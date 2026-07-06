# Custom Emotional Voice AI MVP

Private browser voice companion with OpenAI Realtime WebRTC, persistent encrypted memory, and a provider adapter ready for Gemini Live later.

## What is implemented

- Runnable Express app with static browser UI in `public/`.
- OpenAI Realtime provider using the WebRTC unified interface.
- Gemini Live provider stub behind the same adapter contract.
- Sequelize/Postgres schema for users, voice sessions, conversation turns, memories, memory events, and usage events.
- AES-256-GCM encryption for conversation and memory text.
- Memory extraction after a session ends using a configurable cheap OpenAI text model.
- Memory list, delete, and "forget this" controls.
- Tests for provider adapters, prompt building, encryption, extraction, and the main API routes.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Create `.env` from `.env.example` and set:

```bash
OPENAI_API_KEY=...
MEMORY_ENCRYPTION_KEY=use-a-long-random-secret-at-least-32-chars
DATABASE_URL=postgres://...
```

3. Create the Postgres database named in `DATABASE_URL`.

4. Start the app:

```bash
npm start
```

5. Open `http://localhost:3001`.

Set `DB_SYNC=true` for this MVP so Sequelize creates tables automatically. Use migrations before deploying beyond your private prototype.

For a UI-only preview before setting up Postgres and OpenAI credentials:

```bash
npm run preview
```

## Neon and Render

You can use Neon for `DATABASE_URL`. Copy the Node.js connection string from Neon and keep the SSL query parameters, for example `?sslmode=require&channel_binding=require`.

You do need a backend for this app. The backend keeps provider API keys out of the browser, creates realtime sessions, encrypts memories, stores transcripts, and runs memory extraction.

Render is a good fit for the backend. Create a Web Service from this repository, use `npm install --omit=dev` as the build command and `npm start` as the start command. Set `OPENAI_API_KEY`, `DATABASE_URL`, `MEMORY_ENCRYPTION_KEY`, `REALTIME_PROVIDER`, `OPENAI_REALTIME_MODEL`, `OPENAI_REALTIME_VOICE`, `OPENAI_REALTIME_BASE_URL`, `OPENAI_TRANSCRIPTION_MODEL`, `MEMORY_EXTRACT_MODEL`, `APP_ORIGIN`, and `DB_SYNC` as Render environment variables. Render supplies `PORT` in production, and locally the app defaults to port `3001`.

## Notes

- The app stores transcripts and extracted memories, encrypted in Postgres.
- It does not store raw audio.
- OpenAI receives live audio/text during realtime sessions. "Confidential" here means local encrypted storage and careful provider use, not end-to-end secrecy from the AI provider.
- Gemini Live is intentionally a stub until the OpenAI path is working and measured.

## Tests

```bash
npm test
```
