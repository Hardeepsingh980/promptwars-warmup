# Haqdar

Haqdar ("the rightful claimant" in Hindi and Urdu) is a Gemini-powered helper for gig and informal workers in India: delivery partners, drivers, and daily-wage workers. It works in 9 Indian languages.

Live app: https://haqdar-945707801757.asia-south1.run.app

## Saathi, the riding co-pilot

Riders get customer calls while they drive. Answering is unsafe, and a missed call can bring a penalty. Saathi fixes this:

1. The rider forwards missed and busy calls to +91 80314 50668 by dialing `**61*+918031450668#` and `**67*+918031450668#` once.
2. A Cheerio AI voice agent answers in Hindi or the caller's language. At the start of each call, it reads the rider's name, status, and order ETA from `GET /api/copilot/status`.
3. When the call ends, Cheerio sends the call record to `POST /api/copilot/call-ended`. Gemini pulls out who called, why, the exact details (gate code, landmark), the urgency, and scam signs, and writes a spoken message in the rider's language.
4. An animated avatar face on the Co-pilot screen speaks urgent calls at once. It saves the rest and reads them aloud when the rider taps "I have stopped". Its lips move with the real Gemini voice.
5. The rider can talk to Saathi hands-free, for example "traffic, I will reach in 20 minutes". Gemini picks an action and the server updates the ETA, so the next caller hears the new time.

Both phone endpoints need the `X-Copilot-Key` header. Caller numbers are masked, and the phone agent never sees messages or earnings. To test, call +91 80314 50668 from any phone, then open the Co-pilot screen.

## What a worker can do

1. Ask: take a photo of an app screen, a fine, or any paper, or speak or type a question. Gemini explains it in the worker's language, warns about scams, and gives next steps.
2. Earnings: log a work day (filled in from a photo or voice note). Haqdar calculates the real pay per hour after costs and compares it with the minimum wage.
3. Benefits: answer four questions. Haqdar shows the government schemes the worker can get, how to apply, and the laws that protect them.
4. Complaint: describe a problem or add a screenshot. Gemini writes a formal letter in English, explains it in the worker's language, and shows who to send it to.

Each screen can read its answer aloud with Gemini text to speech. The whole interface is translated by Gemini.

## Run it

1. Install Node.js 22.9 or later.
2. Copy `.env.example` to `.env`. Put your Gemini API key in it, and set `COPILOT_TOOL_KEY` to a long random value.
3. Run `npm install`.
4. Run `npm start`, then open http://localhost:3000.

Run `npm test` to run the 35 unit and API tests. The tests use a fake model, so they need no key.

There is no login. Evaluators do not need test credentials.

## How it keeps answers honest

Every answer comes from a real Gemini call with a JSON schema. Scheme names, rules, documents, and official links come from `src/data/schemes.js`. The model only explains them. The server drops any scheme or link the model invents. The pay math runs on the server in plain code, not in the model. The minimum wage is a Gemini estimate that is clearly labelled, and the worker can change it.

## Security, speed, and accessibility

The API key stays on the server (Secret Manager on Cloud Run). The server checks every input, limits requests per IP, and sends a strict Content Security Policy. Model text goes into the page only as text, never as HTML. Photos are shrunk in the browser before upload. Voice is recorded as 16 kHz WAV. Translations and speech are cached. The interface follows Material You with large touch targets, labels on every control, live regions for results, keyboard support, and reduced motion support.

## Project layout

- `server.js`: starts the server.
- `src/app.js`: routes, security headers, and errors.
- `src/features/`: one file per feature, each with input checks, prompt, and schema.
- `src/data/`: schemes, laws, helplines, and states.
- `shared/`: pay math and interface text, used by both server and browser.
- `public/`: the web app (plain HTML, CSS, and JavaScript modules).
- `test/`: tests for the Node test runner.
- `docs/PRODUCT.md`: user stories and features.
