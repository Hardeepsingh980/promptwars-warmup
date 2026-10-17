import { createApp } from "./src/app.js";
import { config } from "./src/config.js";
import * as gemini from "./src/gemini.js";
import { warmUp } from "./src/features/translate.js";

if (!config.apiKey) {
  console.error("GEMINI_API_KEY is missing. Add it to the .env file. See README.md.");
  process.exit(1);
}

createApp({ ai: gemini }).listen(config.port, () => {
  console.log(`Haqdar is running at http://localhost:${config.port} (model: ${config.model})`);
  if (process.env.WARM_TRANSLATIONS !== "false") {
    warmUp(gemini).then(() => console.log("Interface translations are ready."));
  }
});
