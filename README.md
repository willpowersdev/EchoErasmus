# Echo + OpenAI Voice Assistant

A private Amazon Alexa custom skill that uses an Echo as the voice interface and
the OpenAI Responses API as the conversational backend. Ask arbitrary questions,
get spoken answers, and follow up in context.

```text
User
  ↓
Amazon Echo
  ↓
Alexa speech recognition
  ↓
Alexa Custom Skill
  ↓
AWS Lambda  ──────►  OpenAI Responses API
  ↓                        │
  ◄────────────────────────┘
Alexa text-to-speech
  ↓
Amazon Echo
```

---

## 1. Purpose

Replace Alexa's built-in answers with a model of your choosing, while keeping
Alexa's wake word, speech recognition and text-to-speech. This is a *custom
skill*, not a firmware replacement: the Echo stays an Alexa-controlled device
and the skill only ever receives Alexa's transcript, never raw microphone audio.

---

## 2. Architecture

```text
┌──────────────┐
│ Amazon Echo  │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│    Alexa     │
│ STT + Skill  │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ AWS Lambda   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ OpenAI API   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│ Alexa TTS    │
└──────────────┘
```

Three layers, deliberately kept apart:

| Layer | Files | Responsibility |
| --- | --- | --- |
| Alexa transport | `src/handlers/`, `src/index.ts` | Parse requests, build spoken responses, manage session state |
| Conversation | `src/services/OpenAIService.ts` | Everything that talks to OpenAI. The only module that imports the SDK |
| Support | `src/utils/`, `src/types/` | Speech formatting, structured logging, session attribute shape |

`src/index.ts` exposes `createSkill(deps)` so tests drive the real Alexa request
pipeline with a stubbed OpenAI call. Future work (tool calling, calendar,
Home Assistant) belongs behind the service layer, not in the handlers.

### Files

```text
src/
├── index.ts                              Lambda entry point + injectable skill factory
├── handlers/
│   ├── LaunchRequestHandler.ts           "Alexa, open Erasmus"
│   ├── AskOpenAIIntentHandler.ts         The main question/answer turn
│   ├── NewConversationIntentHandler.ts   "Start a new conversation"
│   ├── HelpIntentHandler.ts              AMAZON.HelpIntent
│   ├── CancelAndStopIntentHandler.ts     AMAZON.CancelIntent / AMAZON.StopIntent
│   ├── PrivacyIntentHandler.ts           "Where do my questions go?"
│   ├── FallbackIntentHandler.ts          AMAZON.FallbackIntent
│   ├── SessionEndedRequestHandler.ts     Logs why a session closed
│   └── ErrorHandler.ts                   Global catch-all
├── services/OpenAIService.ts             Responses API client, timeouts, error mapping
├── utils/
│   ├── AlexaUtils.ts                     Markdown stripping, truncation, SSML escaping
│   ├── Logging.ts                        Structured JSON logging for CloudWatch
│   └── Speech.ts                         Every user-facing phrase, in one place
└── types/SessionAttributes.ts            Session-scoped conversation state

interaction-model/en-US.json              Alexa interaction model
tests/                                    Unit tests (offline) + integration check (billed)
build.mjs                                 esbuild bundler
```

---

## 3. Requirements

- Node.js 22 or newer (the tests use Node's built-in TypeScript stripping)
- An OpenAI API key with access to the model you configure
- An AWS account (Lambda + CloudWatch)
- An Amazon developer account, using the **same Amazon account as your Echo**

---

## 4. OpenAI API key setup

1. Create a key at <https://platform.openai.com/api-keys>.
2. Copy `.env.example` to `.env` and fill in `OPENAI_API_KEY`.
3. `.env` is gitignored. Never commit it, and never paste the key into the
   Alexa Developer Console — Alexa never sees the key.

Nothing in the runtime reads `.env` implicitly. Local scripts load it with
Node's `--env-file` flag; on Lambda the values come from the function's
environment variables.

| Variable | Required | Default | Notes |
| --- | --- | --- | --- |
| `OPENAI_API_KEY` | yes | — | Read at first request, then the client is cached |
| `OPENAI_MODEL` | no | `gpt-5-mini` | Change without rebuilding to swap models. See Limitations for why not `gpt-5` |
| `OPENAI_REASONING_EFFORT` | no | `low` | `none`/`minimal`/`low`/`medium`/`high`. Higher means slower |
| `OPENAI_TIMEOUT_MS` | no | `7500` | Clamped to 1000–9000 |
| `MAX_RESPONSE_CHARACTERS` | no | `5000` | Clamped to 200–6000 |
| `LOG_LEVEL` | no | `info` | `debug`/`info`/`warn`/`error` |
| `LOG_PROMPTS` | no | `false` | Set `true` only while debugging — voice queries are private |

---

## 5. Install

```bash
npm install
```

---

## 6. Build

```bash
npm run typecheck   # tsc --noEmit, strict
npm test            # unit tests, no network, no API key needed
npm run build       # bundles to dist/index.js
npm run package     # build + zip to lambda.zip
```

`npm run check` runs the first three in sequence.

The bundle is CommonJS. `build.mjs` also writes `dist/package.json` with
`{"type": "commonjs"}`, because the root `package.json` is `"type": "module"`
and Node would otherwise read the bundle as ESM.

To confirm the built bundle against the live API before deploying:

```bash
npm run test:integration   # this one calls OpenAI and costs money
```

---

## 7. Lambda deployment

Manual first deployment:

1. `npm run package` to produce `lambda.zip`.
2. AWS Console → Lambda → **Create function** → *Author from scratch*.
   - Runtime: **Node.js 22.x**
   - Architecture: either (arm64 is cheaper)
3. **Code → Upload from → .zip file**, and upload `lambda.zip`.
4. **Runtime settings → Handler**: `index.handler`
5. **Configuration → Environment variables**: set `OPENAI_API_KEY`,
   `OPENAI_MODEL`, and any optional variables from the table above.
6. **Configuration → General configuration**:
   - Memory: **512 MB** (256 MB works; 512 MB starts faster)
   - Timeout: **10 seconds**
7. Optional: set `NODE_OPTIONS=--enable-source-maps` so CloudWatch stack traces
   map back to the TypeScript sources (`dist/index.js.map` ships in the zip).
8. Copy the function **ARN** from the top-right of the console — you need it in
   step 10.

Permissions: the default execution role (CloudWatch Logs only) is all this skill
needs. Do not attach DynamoDB, Secrets Manager or S3 policies; nothing here uses
them.

Do not create a Function URL. The Alexa Skills Kit trigger is the intended entry
point, and a public URL would expose the skill to unauthenticated callers.

Subsequent deploys:

```bash
npm run package
aws lambda update-function-code --function-name <your-function> --zip-file fileb://lambda.zip
```

---

## 8. Create the Alexa skill

1. Go to the [Alexa Developer Console](https://developer.amazon.com/alexa/console/ask)
   and sign in with **the same Amazon account your Echo is registered to**.
2. **Create Skill**.
   - Skill name: `Erasmus` (the display name in the console and the Alexa app —
     a separate field from the invocation name, though there is no reason to
     make them differ)
   - Primary locale: `English (US)`
   - Model: **Custom**
   - Hosting: **Provision your own** (not Alexa-hosted — the Lambda above is the backend)
3. Choose **Start from Scratch** when offered a template.

---

## 9. Interaction model

In **Build → Interaction Model → JSON Editor**, paste the contents of
`interaction-model/en-US.json`, then **Save Model** and **Build Model**.

The model contains two question intents, and the reason matters:

- **`AskOpenAIIntent`** uses `AMAZON.SearchQuery`, which captures arbitrary
  free-form speech. Amazon's rules for this slot type are strict, and this model
  follows them: *"Each sample utterance must include a carrier phrase"* and
  *"the `AMAZON.SearchQuery` slot type cannot be combined with another intent
  slot in sample utterances."* So `"{question}"` on its own is **invalid** here
  and the model build will fail if you add it. Every sample has a carrier
  phrase: `ask {question}`, `tell me {question}`, and so on.

- **`AskOpenAIFreeformIntent`** exists because of that restriction. Without it,
  a bare `why is the sky blue` matches nothing. It uses a custom slot type,
  `FreeformQuestion`, seeded with 40 varied sample questions. Custom slot types
  allow a slot-only utterance and Alexa passes through values that do not match
  any seeded value, so bare questions reach the skill. Both intents are answered
  by the same handler.

This is the standard workaround, but be honest about what it is: recognition for
unseeded phrasings is best-effort, and it is less reliable than a carrier
phrase. If you find bare questions being missed, add representative phrasings to
`FreeformQuestion` and rebuild the model, or train yourself to say "ask ..."
first. `AMAZON.FallbackIntent` catches whatever still slips through and
reprompts rather than leaving silence.

### Invocation name

The invocation name is `erasmus`, so the launch phrase is `Alexa, open Erasmus`.
This is *not* a wake word — the wake word stays whatever the device is set to
(`Alexa`, `Amazon`, `Echo`, `Computer` or `Ziggy`, changed in the Alexa app) and
no skill can replace it. Setting the device to `Computer` gets you
`Computer, open Erasmus`, which is about as close as this hardware allows.

One caveat, which does not block a private skill: **single-word invocation
names** are only supposed to be accepted when the name is distinctive to your
own brand. Model builds are usually permissive here, but if the console rejects
it, `ask erasmus` or `hey erasmus` are the usual fallbacks — change
`invocationName` and rebuild.

Amazon also rejects invocation names containing `alexa`, `amazon`, `echo`,
`computer`, `skill`, or `app`, and launch words like `ask`, `tell` or `launch`
used on their own.

---

## 10. Connect the skill to Lambda

1. Alexa Developer Console → **Build → Endpoint**.
2. Select **AWS Lambda ARN**.
3. Paste the Lambda ARN into **Default Region**.
4. Copy the **Your Skill ID** value shown on that page.
5. In AWS Lambda → **Configuration → Triggers → Add trigger**:
   - Source: **Alexa Skills Kit**
   - Enable **Skill ID verification** and paste the Skill ID.

   Skill ID verification is what stops anyone else's skill from invoking your
   function. Enable it.
6. Back in the Alexa console, **Save Endpoints**, then **Build Model** again.

The Lambda must be in a region Alexa supports for the ASK trigger —
`us-east-1` (N. Virginia) is the safe choice for English (US).

---

## 11. Testing

### In the developer console

**Test** tab → set the dropdown to **Development**. Then type or speak:

```text
open erasmus
→ Hi. What would you like to know?

why is the sky blue
→ (a concise spoken answer)

does that happen on mars too
→ (an answer that clearly follows on from the previous one)

start a new conversation
→ Okay. I've started a new conversation. What would you like to ask?

stop
→ Goodbye.
```

The JSON request/response panes on that page are the fastest way to see exactly
what Alexa sent and what the skill returned.

### On a physical Echo

A skill in **Development** stage is automatically available on Echo devices
registered to the same Amazon account. No certification or publishing needed.

```text
Alexa, open Erasmus
```

Then work through the checklist: startup, arbitrary questions, spoken answers,
contextual follow-ups, `stop`, and a forced timeout (drop `OPENAI_TIMEOUT_MS`
to `1000` temporarily) to confirm it fails gracefully.

---

## 12. Logs and debugging

Everything is logged as single-line JSON to CloudWatch, under
`/aws/lambda/<your-function-name>`.

Events:

| Event | Meaning |
| --- | --- |
| `OpenAIRequest` | Model, prompt length, whether a follow-up chain is in play |
| `OpenAIResponse` | Response id, status, character count, duration in ms |
| `AskOpenAIFailed` | The turn failed; the user heard a friendly message |
| `MissingQuestionSlot` | Alexa matched the intent but delivered no slot value |
| `FallbackIntent` | Nothing in the model matched what was said |
| `SessionEnded` | Includes `reason` — `ERROR` here usually means a malformed or slow response |
| `UnhandledError` | Reached the global error handler |
| `ConversationReset` | Context cleared |

Useful CloudWatch Logs Insights query for latency:

```text
fields @timestamp, durationMs, characterCount
| filter event = "OpenAIResponse"
| sort @timestamp desc
```

If answers are cut off or Alexa goes silent, check `durationMs` first — see
Limitations below.

---

## 13. Security

- The API key lives only in Lambda environment variables. It is never in source,
  never in the interaction model, never sent to Alexa, and never spoken.
- `.env` and `.env.*` are gitignored; only `.env.example` is tracked.
- Error handling never surfaces an exception message to the user. OpenAI error
  text (which can echo request details) is logged, not spoken.
- User prompts are **not** logged by default. `LOG_PROMPTS=true` opts in, and is
  meant for short debugging sessions only — voice queries are private.
- Logging only ever extracts `name`, `message` and `stack` from an error, so the
  originating request and its `Authorization` header cannot leak into CloudWatch.
- Enable Skill ID verification on the Lambda trigger (step 10.5) so only your
  skill can invoke the function.
- The execution role needs CloudWatch Logs and nothing else.
- Model output is escaped for SSML before being spoken, so a response containing
  `&` or `<` cannot produce a malformed response (which Alexa renders as
  silence).

---

## 14. Limitations

- **The Echo is still an Alexa device.** You must say "Alexa, open Erasmus" first;
  there is no way to replace the wake word or get raw microphone audio from a
  custom skill. Direct audio-to-audio via the OpenAI Realtime API is not
  possible on this hardware.
- **Latency is the real constraint, and it drove the default model.** Alexa
  expects a response in roughly eight seconds. `OPENAI_TIMEOUT_MS` defaults to
  7500 ms and the client uses `maxRetries: 0` so a retry can never blow the
  budget. Measured round-trip on two short questions:

  | Config | Call 1 | Call 2 |
  | --- | --- | --- |
  | `gpt-5` / effort `low` | 4432 ms | 5242 ms |
  | `gpt-5` / effort `minimal` | 4769 ms | 2276 ms |
  | `gpt-5-mini` / effort `low` | 2260 ms | 3122 ms |

  Hence the `gpt-5-mini` default. Alexa's cutoff is a cliff rather than a
  gradient, so *consistency* matters more than the average — `gpt-5` at
  `minimal` effort was the worst of both worlds, varying 2.3–4.8 s on identical
  prompts. Those were short questions on a warm client; a hard question plus a
  Lambda cold start is where `gpt-5` starts producing "That took too long to
  answer." Set `OPENAI_MODEL=gpt-5` if you want the quality ceiling — it is an
  environment variable, so no rebuild is needed. Re-measure on your own account
  with `npm run test:integration`.
- **Bare questions depend on the catch-all slot** and are less reliable than
  carrier phrases. See section 9.
- **Context dies with the session.** Conversation state lives in Alexa session
  attributes, so it is lost on "stop" or after Alexa's idle timeout. Follow-ups
  work within a session only. Answers are also not cached — every question is
  one billed OpenAI call.
- **English (US) only** as shipped. Other locales need their own interaction
  model file.
- **Cost is unbounded by the app.** One OpenAI call per question, no retries, no
  loops — but nothing here caps monthly spend. Set usage limits in the OpenAI
  dashboard and a CloudWatch alarm on invocation count.

---

## 15. Future improvements

Deliberately out of scope for version 1, in the order that makes sense:

1. **Persistent memory** — a DynamoDB table (`userId` → `previousOpenAIResponseId`,
   `updatedAt`, `expiresAt`) with a TTL, via
   `ask-sdk-dynamodb-persistence-adapter`, so context survives across sessions.
   Alexa user IDs must stay internal and never become public identifiers.
2. **Tool calling** — let the model call developer-defined tools (weather,
   calendar, notes). Tools execute in Lambda, never in the model. Never allow
   model-generated arguments to become arbitrary URLs or shell commands.
3. **Calendar** — OAuth tokens stay in Lambda; the model gets a narrow tool
   interface, never a token.
4. **Home Assistant** — the model determines intent, Lambda performs the call,
   and high-impact actions (locks, garage doors) require spoken confirmation
   before executing.
5. **Streaming or progressive response** — Alexa's Progressive Response API can
   fill the silence while a slow answer generates.
6. **Secrets Manager** — move the API key out of environment variables once
   there is a reason to rotate it automatically.

---

## Manual steps that cannot be automated from this repo

Everything below happens in a web console and has no file in this project:

1. Creating the OpenAI API key.
2. Creating the Lambda function, uploading the zip, and setting environment
   variables (steps 7.2–7.6).
3. Creating the skill in the Alexa Developer Console (step 8).
4. Pasting `interaction-model/en-US.json` into the JSON editor and building the
   model (step 9).
5. Pairing the two: skill endpoint ARN, and the ASK trigger with Skill ID
   verification (step 10).

AWS and Alexa change their console layouts regularly. If a menu path above does
not match what you see, the underlying settings — runtime, handler name,
environment variables, endpoint ARN, trigger — are what matter; find them
wherever they have moved to.
