import { createServer } from "node:http";
import { createApp } from "./src/app.js";
import { config } from "./src/config.js";
import { openDb } from "./src/db.js";
import * as gemini from "./src/gemini.js";
import { warmUp } from "./src/features/translate.js";
import { attachLiveServer } from "./src/live/proxy.js";
import { drain } from "./src/inflight.js";

const missing = ["apiKey", "sessionSecret"].filter((key) => !config[key]);
if (missing.length > 0) {
  console.error(`Missing settings in .env: ${missing.join(", ")}. See .env.example.`);
  process.exit(1);
}

const db = await openDb(config.dataFile);
const { app, services } = createApp({ ai: gemini, db });
await services.users.ensureDemoUser(config.demoUser);

const server = createServer(app);
attachLiveServer(server, { ...services, config });
server.listen(config.port, () => {
  console.log(`Haqdar is running at http://localhost:${config.port} (model: ${config.model}, live: ${config.liveModel}, data: ${config.dataFile})`);
  if (process.env.WARM_TRANSLATIONS !== "false") warmUp(gemini, db).then(() => console.log("Interface translations are ready."));
});

// Cloud Run sends SIGTERM before it stops an instance. Finish background replies, save, then exit.
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    server.close();
    await drain(8000);
    await db.flush();
    process.exit(0);
  });
}
