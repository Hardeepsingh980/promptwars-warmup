# Haqdar: Saathi, a voice co-pilot for gig workers

Haqdar ("the rightful claimant") is a web app and a WhatsApp assistant for gig and informal workers in India. Its character, Saathi, talks with the worker in their language, answers their phone calls while they ride, and helps with pay, rights, documents, and complaints. Every answer comes from a real Gemini call.

## The problem

Delivery riders get customer calls while they ride. Answering is dangerous. Missing the call brings a penalty. Riders also do not know if their pay is fair, which welfare schemes they can get, what a fine or a form means, or how to complain when a platform blocks them. Most of this information exists only in English.

## Who we build for

Ravi delivers food in Bengaluru. He reads Kannada and speaks Hindi. He holds his phone in one hand between orders. He does not know why the app cut 120 rupees from today's pay.

Fatima drives a cab in Hyderabad. She speaks Telugu and Urdu. A traffic police challan (a fine notice) arrived on her phone in English. She does not know if it is real or what to do.

Sunil is a daily-wage construction worker in Jaipur. He speaks Hindi and reads very little. He has never heard of the e-Shram card or any pension scheme.

## Design principles

1. Voice first. The worker speaks; Saathi speaks back. Typing is optional.
2. Every answer is in the worker's language, in a few short sentences.
3. Every answer ends with one clear next step or one action already done.
4. Every screen makes a real AI call. No fixed text pretends to be AI.
5. Facts are grounded. Schemes and laws come from a curated list with official links. The model only explains them.
6. The worker's data stays theirs. Accounts are per user, and callers never hear the worker's number, location, or earnings.
7. Saathi gives information, not legal advice. Each legal answer says so in one line.

## The user journey

1. Sign up with a name, mobile number, password, and language, or log in.
2. Setup: state, type of work, and the app or employer.
3. Meet Saathi: a live greeting by name, a real test call to Saathi's number, and the dial codes to forward missed calls.
4. Home: Saathi live, the ride switch, calls Saathi answered, and the current order. Two more tabs: Money and Help.
5. WhatsApp: the same assistant from the worker's registered number, with text, voice notes, and photos.

## User stories

Each story has the form: As a worker, I want X, so that Y. The "Done when" line is the test an evaluator can run.

### Saathi, the voice co-pilot

US1. As a rider, I want calls answered for me while I ride, so that I stay safe and lose no orders.
Done when: I tap Start riding and forward my calls. A caller hears Saathi, who knows my name and my ETA, takes the message, and promises I will get it at my next stop.

US2. As a rider, I want the messages read to me when I stop, so that I never read while riding.
Done when: I tap I have stopped or say so. Saathi reads each message: who called, what they want, the exact details such as a gate code. Urgent calls are spoken at once.

US3. As a rider, I want to talk to Saathi hands-free, so that I can update my status without typing.
Done when: I say my earnings, hours, costs, and destination in one sentence. Saathi logs the day, sets the order and ETA, and confirms in one line.

US4. As a worker, I want Saathi to look alive, so that it feels like a companion and not a form.
Done when: the character breathes, blinks, looks around, and its mouth moves with the real voice.

### Money

US5. As a worker, I want to log a work day by voice, photo, or form, so that tracking takes seconds.
US6. As a worker, I want to know my true pay per hour after costs and how it compares with the minimum wage, so that I know if the day was fair.
Done when: the Money tab shows net pay, pay per hour, the minimum wage used, and a plain verdict with tips. I can change the wage figure and check again.

### Help

US7. As a worker, I want a photo of a payslip, fine, form, or message explained in my language, so that I know what it means and what to do.
US8. As a worker, I want to see which government schemes I can get and my rights, so that I do not miss a benefit.
Done when: the schemes shown match my state, age, income, and work type, each with apply steps and an official link, plus the laws that protect me.
US9. As a worker, I want a formal complaint written for me, so that I can send it to the platform or the labour office.
Done when: I get a subject, an English letter, a summary in my language, who to send it to, and what to do if nobody replies.

### WhatsApp

US10. As a worker, I want to use everything from WhatsApp, so that I do not need to open an app.
Done when: I send a text, a voice note, or a photo from my registered number. One message can hold several requests. Saathi does all of them and replies in my language, as text and as a voice note.

### Across all flows

US11. Nine Indian languages, picked once and kept.
US12. Works on a cheap phone and a slow network: photos shrink before upload, pages are small and compressed.
US13. Usable with a screen reader and a keyboard: labels on every control, live regions, visible focus, reduced motion.

## How each part uses Gemini

| Part | Model | Input | Output |
|------|-------|-------|--------|
| Saathi live | gemini-3.8-live | microphone audio, rider data, tools | spoken Hindi or another language, tool calls |
| Phone agent | Cheerio voice agent + status tool | caller speech, rider status from our API | a call record sent to our webhook |
| Call summary | gemini-3.8-flash | call transcript | who called, details, urgency, scam flag, spoken line |
| WhatsApp | gemini-3.8-flash with function calling | text, voice note (converted to WAV), photo | tool calls and a short reply |
| Voice notes and read aloud | gemini-3.8-flash-tts | reply text | audio |
| Explain a photo | gemini-3.8-flash | photo or text | title, explanation, intent, numbers, next steps |
| Fair pay | gemini-3.8-flash | state, pay numbers | minimum wage estimate, verdict, tips |
| Schemes and rights | gemini-3.8-flash | filtered scheme list, profile | why it fits, apply steps |
| Complaint | gemini-3.8-flash | problem or screenshot | letter, summary, send to, escalation |
| Interface text | gemini-3.8-flash | English strings | translated strings, cached |

The server does the arithmetic and the scheme filtering in plain, tested functions. Gemini does the reading, the language, and the actions.

## What we leave out

Payments, direct links into delivery platforms, push notifications, and a dedicated phone number per rider. The demo shares one phone line; in production each rider would get their own virtual number.
