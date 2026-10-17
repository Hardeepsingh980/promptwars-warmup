import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname } from "node:path";

const WRITE_DELAY_MS = 150;

/**
 * A small document store that keeps everything in memory and saves it to one JSON file.
 * On Cloud Run the file lives on a Cloud Storage volume, so data survives restarts.
 * One server instance writes at a time. Swap this module for Firestore to scale out.
 */
export async function openDb(filePath) {
  let data = { collections: {} };
  if (filePath) {
    try {
      data = JSON.parse(await readFile(filePath, "utf8"));
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      await mkdir(dirname(filePath), { recursive: true });
    }
  }

  let timer = null;
  let writing = Promise.resolve();

  function scheduleWrite() {
    if (!filePath) return;
    clearTimeout(timer);
    timer = setTimeout(() => { writing = writing.then(persist).catch((error) => console.error("db write failed:", error.message)); }, WRITE_DELAY_MS);
  }

  async function persist() {
    const temp = `${filePath}.tmp`;
    await writeFile(temp, JSON.stringify(data));
    await rename(temp, filePath);
  }

  const table = (name) => (data.collections[name] ??= {});

  return {
    get: (collection, id) => structuredClone(table(collection)[id] ?? null),
    list: (collection) => Object.values(table(collection)).map((doc) => structuredClone(doc)),
    find: (collection, predicate) => Object.values(table(collection)).filter(predicate).map((doc) => structuredClone(doc)),
    put(collection, id, doc) {
      table(collection)[id] = structuredClone({ ...doc, id });
      scheduleWrite();
      return structuredClone(table(collection)[id]);
    },
    update(collection, id, changes) {
      const current = table(collection)[id];
      if (!current) return null;
      return this.put(collection, id, { ...current, ...changes });
    },
    remove(collection, id) {
      delete table(collection)[id];
      scheduleWrite();
    },
    /** Wait for pending writes. Used by tests and at shutdown. */
    async flush() {
      clearTimeout(timer);
      if (filePath) await (writing = writing.then(persist));
    },
  };
}
