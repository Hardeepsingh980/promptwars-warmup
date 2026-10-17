# Haqdar: Gig Worker Companion

Haqdar (Hindi for "companion") is a web app for gig and informal workers in India. The worker shows Haqdar a photo or speaks in their own language. Gemini reads the input and explains it in simple words. Haqdar then helps with the next step: log the earnings, test if the pay is fair, find a welfare scheme, or write a complaint.

Every screen makes a real Gemini call. Nothing is canned. Facts about schemes and laws come from a list we ship with official links. Minimum wage figures come from Gemini's knowledge. Haqdar marks them as approximate and links to the official state notification page.

## Who we build for

Ravi delivers food in Bengaluru. He reads Kannada and speaks Hindi. He holds his phone in one hand between orders. He does not know why the app cut 120 rupees from today's pay.

Fatima drives a cab in Hyderabad. She speaks Telugu and Urdu. A traffic police challan (a fine notice) arrived on her phone in English. She does not know if it is real or what to do.

Sunil is a daily-wage construction worker in Jaipur. He speaks Hindi and reads very little. He has never heard of the e-Shram card or any pension scheme.

## Design principles

1. Snap or speak first. Typing is optional.
2. Every answer is in the worker's language, in five lines or fewer.
3. Every answer ends with one clear next step.
4. Every screen makes a real AI call. No fixed text pretends to be AI.
5. Facts are grounded. Schemes come from our list. Wage figures are marked approximate and link to the official source.
6. No login. Earnings data stays on the phone.
7. Haqdar gives information, not legal advice. Each legal answer says so in one line.

## User stories

Each story has the form: As a worker, I want X, so that Y. The "Done when" line is the test an evaluator can run.

### Flow 1: Understand anything (the shell)

US1. As a worker, I want to take a photo of a screen or a paper and get it explained in my language, so that I know what it means and what to do next.
Done when: I upload a photo or use the camera. Within about five seconds I see a title, three to five short sentences in my language, and one or more next-step buttons.

US2. As a worker, I want to speak my question in my language, so that I do not have to type.
Done when: I hold the mic button and speak. Haqdar shows what it heard and gives the same kind of answer as US1.

US3. As a worker, I want to type a short question, so that I can use Haqdar in a quiet place.
Done when: I type and send. The answer has the same shape as US1.

US4. As a worker, I want Haqdar to warn me when a message looks like a scam, so that I do not lose money.
Done when: I show a message that asks for an OTP, a payment, or a link. The answer has a red caution line that says what not to do.

US5. As a worker, I want to hear the answer read aloud, so that I can listen while I ride.
Done when: I tap the speaker icon and hear the answer in my language.

### Flow 2: Earnings and fair pay

US6. As a worker, I want earnings from a screenshot added to my log without typing, so that tracking takes one tap.
Done when: I upload an earnings screenshot. Haqdar shows the platform, date, gross pay, deductions, and net pay that it read. I tap "Add to log" and the entry appears in my log.

US7. As a worker, I want to add a day's earnings by voice or by a short form, so that I can log a day with no screenshot.
Done when: I say "today 850 rupees, 9 hours, petrol 200" or fill four fields. The entry appears in my log.

US8. As a worker, I want to know my true pay per hour after costs, and how it compares with the minimum wage in my state, so that I know if the day was fair.
Done when: Haqdar shows net pay, pay per hour, the approximate minimum wage for my state, and a link to the official source. It then says in plain words if the day was fair and what I can do. If the pay is low, it offers "Find schemes for me".

US9. As a worker, I want to see my week's total and my best and worst day, so that I can plan.
Done when: the log screen shows a seven-day total and a short plain-language note from Haqdar.

### Flow 3: Rights and schemes

US10. As a worker, I want to see which government schemes I can get, based on my state, age, income, and type of work, so that I do not miss a benefit.
Done when: I give state, age, monthly income, and work type. Haqdar lists only schemes I can get. Each one shows the benefit, why it fits me, three to five steps to apply, and the official link.

US11. As a worker, I want to know my basic rights as a gig worker, so that I can stand up for myself.
Done when: I ask "what are my rights" or tap the rights card. Haqdar explains, in my language, the rights that apply in my state, from our list of laws.

US12. As a worker, I want helpline numbers in one place, so that I can call for help fast.
Done when: the rights screen shows emergency, labour, cyber crime, and women's helpline numbers as tap-to-call links.

### Flow 4: Complaint drafting

US13. As a worker, I want to describe a problem by voice or by a photo of the support chat and get a formal complaint, so that I can send it to the platform or the labour office.
Done when: Haqdar gives a subject line, a formal complaint in English, a two-line summary in my language, and the name of the office or role to send it to. I can copy the text or share it on WhatsApp.

US14. As a worker, I want to know what to do if nobody replies, so that I am not stuck.
Done when: the complaint screen shows an escalation ladder with three steps, each with who to contact and how long to wait.

### Across all flows

US15. As a worker, I want to pick my language once, so that every screen uses it.
Done when: the picker offers Hindi, English, Tamil, Telugu, Kannada, Marathi, Bengali, Punjabi, and Gujarati. The choice is kept on the device.

US16. As a worker on a cheap phone and a slow network, I want the app to stay fast, so that I can use it between orders.
Done when: photos are shrunk on the phone before upload. The page loads with no build step and no heavy framework.

US17. As a worker who uses a screen reader or has low vision, I want large buttons and clear labels, so that I can use every feature.
Done when: every control has a label. Results are announced to screen readers. Text and buttons meet contrast rules. The whole app works with a keyboard.

## Features

P0 means we must ship it. P1 means we ship it if the P0 list is done. P2 means only if time remains.

| ID | Feature | Priority | Stories |
|----|---------|----------|---------|
| F1 | Snap, speak, or type input with a language picker | P0 | US1, US2, US3, US15 |
| F2 | Understand: title, explanation, intent, extracted numbers, next steps, caution | P0 | US1, US2, US3, US4 |
| F3 | Earnings log on the device, with auto-fill from a screenshot or voice | P0 | US6, US7, US9 |
| F4 | Fair pay check: server math, approximate minimum wage with official link, plain verdict | P0 | US8 |
| F5 | Scheme finder: filter our list, then Gemini explains how to apply | P0 | US10 |
| F6 | Complaint drafter: formal English, local summary, send-to, escalation, share | P0 | US13, US14 |
| F7 | Server proxy that hides the API key, validates input, and limits request rate | P0 | all |
| F8 | Read aloud with Gemini text to speech, with the browser voice as fallback | P1 | US5 |
| F9 | Rights explainer card and tap-to-call helplines | P1 | US11, US12 |
| F10 | Image shrink on the phone before upload | P1 | US16 |
| F11 | Accessibility pass: labels, live regions, contrast, keyboard | P1 | US17 |
| F12 | Shift safety brief before a night ride | P2 | new |
| F13 | Export the earnings log as CSV | P2 | US9 |

## How each screen uses Gemini

| Screen | Model | Input | Output |
|--------|-------|-------|--------|
| Understand | gemini-3.8-flash | photo, audio, or text, plus language | JSON: title, explanation, intent, extracted data, next steps, caution |
| Fair pay | gemini-3.8-flash | state, city, net pay per hour | JSON: approximate minimum wage, official link, verdict, tips |
| Schemes | gemini-3.8-flash | filtered scheme list, worker profile | JSON: for each scheme, why it fits, benefit, apply steps |
| Complaint | gemini-3.8-flash | problem text or photo, platform, city | JSON: subject, body, summary, send to, escalation ladder |
| Read aloud | gemini-3.8-flash-tts | answer text, language | audio |

The server does the arithmetic for pay per hour and the first filter of schemes. These parts are plain functions with unit tests. Gemini does the reading, the language, and the explanation.

## What we tested against the Gemini API

We ran these checks on Oct 17, 2026 with the hackathon key:

1. gemini-3.8-flash with a zero thinking budget answers a short prompt in about one to three seconds.
2. JSON schema output (responseSchema) works and returns valid JSON in Tamil and Hindi.
3. Voice input works. A 16 kHz WAV clip in Hinglish came back as a correct transcript with the numbers pulled out, in about three seconds.
4. Text to speech (gemini-3.8-flash-tts) returns a WAV file the browser can play, in about five seconds.
5. Google Search grounding took 16 to 79 seconds and returned no source links. We do not use it in the demo. It stays a P2 idea.

## Stack

One Node server with Express serves the page and the API. The Gemini key stays on the server. The front end is plain HTML, CSS, and JavaScript, with CSS variables for the design system. Tests use the Node built-in test runner. There is no database and no build step. One command starts the app.

## What we leave out

Login and accounts. A server database. Payments. Direct links into the delivery platforms. Push notifications. These are not needed to show the four flows, and each one adds a way to fail.

## The two-minute demo an evaluator will run

1. Pick Hindi.
2. Upload an earnings screenshot. Read the explanation. Tap "Add to log".
3. Tap "Is this fair?". See pay per hour, the minimum wage with its source, and the verdict.
4. Tap "Find schemes for me". See two or three schemes with apply steps and links.
5. Hold the mic. Say the platform blocked your account with no reason. Tap "Write a complaint". Copy the draft.
6. Tap the speaker on any answer and hear it in Hindi.

## How this scores

Problem alignment: the four flows map one to one to the brief (earnings, rights and schemes, documents, grievances), and safety is covered by the scam caution. Code quality: small modules, pure functions for logic, one style. Security: key on the server, input checks, rate limit, no raw HTML from the model. Efficiency: flash model, zero thinking budget, JSON schema output, shrunk images. Testing: unit tests on the pure functions and a smoke test on each route. Accessibility: labels, live regions, contrast, keyboard, read aloud, nine languages.

## Open points

1. App name: Haqdar, or another name you prefer.
2. Model: gemini-3.8-flash for speed, or gemini-flash-latest as a safer alias.
3. Languages: the nine above, or fewer.
4. Design system: you will share it. Plain CSS or a framework.
