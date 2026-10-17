import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import { dirname } from "node:path";

const WRITE_DELAY_MS = 150;
/** Fields that get a secondary index, so per-user queries do not scan a whole collection. */
const INDEXED_FIELDS = ["userId", "phone"];

/**
 * A small document store that keeps everything in memory and saves it to one JSON file.
 * On Cloud Run the file lives on a Cloud Storage volume, so data survives restarts.
 * Reads are O(1) by id or by an indexed field. Writes are debounced, so a burst of
 * changes costs one file write. One server instance writes at a time; swap this
 * module for Firestore to scale out.
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

  // indexes: collection -> field -> value -> Set of ids
  const indexes = new Map();
  const table = (name) => (data.collections[name] ??= {});
  const indexFor = (collection, field) => {
    let byField = indexes.get(collection);
    if (!byField) indexes.set(collection, (byField = new Map()));
    let byValue = byField.get(field);
    if (!byValue) byField.set(field, (byValue = new Map()));
    return byValue;
  };
  const indexDoc = (collection, doc) => {
    for (const field of INDEXED_FIELDS) {
      if (doc[field] === undefined) continue;
      const byValue = indexFor(collection, field);
      if (!byValue.has(doc[field])) byValue.set(doc[field], new Set());
      byValue.get(doc[field]).add(doc.id);
    }
  };
  const unindexDoc = (collection, doc) => {
    for (const field of INDEXED_FIELDS) {
      if (doc?.[field] === undefined) continue;
      indexes.get(collection)?.get(field)?.get(doc[field])?.delete(doc.id);
    }
  };
  for (const [collection, docs] of Object.entries(data.collections)) for (const doc of Object.values(docs)) indexDoc(collection, doc);

  let timer = null;
  let writing = Promise.resolve();
  let dirty = false;

  function scheduleWrite() {
    dirty = true;
    if (!filePath) return;
    clearTimeout(timer);
    timer = setTimeout(() => { writing = writing.then(persist).catch((error) => console.error("db write failed:", error.message)); }, WRITE_DELAY_MS);
  }

  async function persist() {
    if (!dirty) return;
    dirty = false;
    const temp = `${filePath}.tmp`;
    await writeFile(temp, JSON.stringify(data));
    await rename(temp, filePath);
  }

  return {
    get: (collection, id) => structuredClone(table(collection)[id] ?? null),
    list: (collection) => Object.values(table(collection)).map((doc) => structuredClone(doc)),
    /** Every document whose indexed `field` equals `value`. O(matches), not O(collection). */
    where(collection, field, value) {
      if (!INDEXED_FIELDS.includes(field)) throw new Error(`${field} is not an indexed field`);
      const ids = indexes.get(collection)?.get(field)?.get(value) ?? new Set();
      const docs = table(collection);
      return [...ids].map((id) => structuredClone(docs[id])).filter(Boolean);
    },
    find: (collection, predicate) => Object.values(table(collection)).filter(predicate).map((doc) => structuredClone(doc)),
    put(collection, id, doc) {
      unindexDoc(collection, table(collection)[id]);
      const saved = structuredClone({ ...doc, id });
      table(collection)[id] = saved;
      indexDoc(collection, saved);
      scheduleWrite();
      return structuredClone(saved);
    },
    update(collection, id, changes) {
      const current = table(collection)[id];
      if (!current) return null;
      return this.put(collection, id, { ...current, ...changes });
    },
    remove(collection, id) {
      unindexDoc(collection, table(collection)[id]);
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
