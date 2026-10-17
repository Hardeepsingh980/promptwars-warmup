# Haqdar

Haqdar ("the rightful claimant" in Hindi and Urdu) is a Gemini-powered helper for gig and informal workers in India: delivery partners, drivers, and daily-wage workers. It works in 9 Indian languages.

Live app: https://haqdar-945707801757.asia-south1.run.app

## Saathi, the voice co-pilot

Saathi is an animated character with a real voice. The rider talks to it through a Gemini Live session (two-way audio over a WebSocket). Saathi greets the rider by name, listens, answers in their language, and acts: it starts and stops rides, sets the ETA, logs earnings, reads out call messages, and opens the right screen. Its mouth moves with the loudness and tone of the actual audio.

Riders get customer calls while they drive. Answering is unsafe, and a missed call can bring a penalty. Saathi fixes this:

1. The rider forwards missed and busy calls to +91 80314 50668 by dialing `**61*+918031450668#` and `**67*+918031450668#` once.
2. A Cheerio AI voice agent answers in Hindi or the caller's language. At the start of each call it reads the rider's name, status, and order ETA from `GET /api/copilot/status`.
3. When the call ends, Cheerio sends the call record to `POST /api/copilot/call-ended/<token>`. Gemini pulls out who called, why, the exact details (gate code, landmark), the urgency, and scam signs, and writes a spoken message in the rider's language.
4. Urgent calls are spoken at once. The rest are read out when the rider says "I have stopped" or taps the button. When the call record carries a recording link, the rider can play the recording in the call list.

The demo shares one phone line, so the phone agent speaks for the user who last started a ride. In production each rider gets their own virtual number.

## Saathi on WhatsApp

The rider can use everything from WhatsApp, with no app open. They message the Haqdar number from their registered phone with a text, a voice note, or a photo. One message can carry several requests at once, for example a payslip screenshot with "why was this cut, log it, and I am heading to Koramangala in 15 minutes". Gemini reads the photo or the audio, calls every tool it needs (log earnings, set the order, update the ride status), and answers in the rider's language. The reply comes back as text and as a voice note made with Gemini text to speech.

Incoming messages arrive on `POST /api/whatsapp/webhook/<token>`. The server answers at once and works in the background, drops repeated deliveries, and ignores numbers that have no account (it sends them a short sign-up note). Replies go out through the Cheerio Direct API.

## The user journey

1. Sign up with a name, mobile number, password, and language. Or log in.
2. Setup: state, type of work, and the app or employer.
3. Meet Saathi: an intro conversation, a real test call to Saathi's number, and the dial codes for call forwarding.
4. Home: Saathi, the ride switch, calls Saathi answered, and the current order. Two more tabs: Money and Help.

Demo account for evaluators: number `9999999999`, password `saathi123`.

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

Run `npm test` to run the 55 unit and API tests. The tests use a fake model, so they need no key.

## How it keeps answers honest

Every answer comes from a real Gemini call with a JSON schema. Scheme names, rules, documents, and official links come from `src/data/schemes.js`. The model only explains them. The server drops any scheme or link the model invents. The pay math runs on the server in plain code, not in the model. The minimum wage is a Gemini estimate that is clearly labelled, and the worker can change it.

## Security, speed, and accessibility

The Gemini key stays on the server (Secret Manager on Cloud Run); the browser talks to Gemini Live only through the server's WebSocket bridge. Passwords are hashed with scrypt. Sessions are signed HttpOnly cookies. Every data route is per user. The phone agent's status tool needs a header key, and the call-ended webhook carries a secret token in its URL because the sender cannot set headers; a wrong token gets a 404. The webhook can only add a message, never read anything, and its content is passed to Gemini as untrusted text. The server checks every input, limits requests per IP, and sends a strict Content Security Policy. Model text goes into the page only as text, never as HTML. Photos are shrunk in the browser before upload. Translations and speech are cached. The interface follows Material You with large touch targets, labels on every control, live regions for results, keyboard support, and reduced motion support.

## Project layout

- `server.js`: starts the server.
- `src/app.js`: routes, security headers, and errors.
- `src/auth/`: users, password hashing, signed sessions.
- `src/copilot/`: rider state, call messages, Saathi's tools, phone agent routes.
- `src/live/proxy.js`: the Gemini Live WebSocket bridge.
- `src/db.js`: a JSON document store (a Cloud Storage volume on Cloud Run).
- `src/features/`: one file per feature, each with input checks, prompt, and schema.
- `src/data/`: schemes, laws, helplines, and states.
- `shared/`: pay math and interface text, used by both server and browser.
- `public/`: the web app (plain HTML, CSS, and JavaScript modules). `avatar.js` draws Saathi, `live.js` streams audio.
- `test/`: tests for the Node test runner.
- `docs/PRODUCT.md`: user stories and features.
