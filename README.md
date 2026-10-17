# Haqdar

Haqdar ("the rightful claimant" in Hindi and Urdu) is a Gemini-powered helper for gig and informal workers in India: delivery partners, drivers, and daily-wage workers. It works in 9 Indian languages.

Live app: https://haqdar-945707801757.asia-south1.run.app

## What a worker can do

1. Ask: take a photo of an app screen, a fine, or any paper, or speak or type a question. Gemini explains it in the worker's language, warns about scams, and gives next steps.
2. Earnings: log a work day (filled in from a photo or voice note). Haqdar calculates the real pay per hour after costs and compares it with the minimum wage.
3. Benefits: answer four questions. Haqdar shows the government schemes the worker can get, how to apply, and the laws that protect them.
4. Complaint: describe a problem or add a screenshot. Gemini writes a formal letter in English, explains it in the worker's language, and shows who to send it to.

Each screen can read its answer aloud with Gemini text to speech. The whole interface is translated by Gemini.

## Run it

1. Install Node.js 22.9 or later.
2. Copy `.env.example` to `.env` and put your Gemini API key in it.
3. Run `npm install`.
4. Run `npm start`, then open http://localhost:3000.

Run `npm test` to run the 27 unit and API tests. The tests use a fake model, so they need no key.

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
