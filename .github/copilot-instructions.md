This repository is a small React + Vite app that provides NFL scoreboard, game detail, player scouting, and live prop analysis powered by ESPN APIs and Google GenAI (Gemini).

Key goals for an AI coding agent working on this repo:

- Make small, targeted UI or data fixes without changing overall architecture.
- Preserve client-side-only behavior (no server/backend in this repo).
- Keep external API keys out of source; read from env or localStorage per existing patterns.

Quick architecture summary

- Frontend: React (TSX) + Vite. Entrypoints: `index.tsx` -> `App.tsx`.
- Screens: `components/GamesScreen.tsx`, `GameScreen.tsx`, `PlayerScreen.tsx`.
- Shared UI: `components/GameCard.tsx`, `components/StatTable.tsx`.
- Data services: `services/espnService.ts` (fetch scoreboard, summaries, rosters, schedules, and defensive aggregation) and `services/geminiService.ts` (wraps Google GenAI usage for analysis/scouting).
- Global context: `contexts/DefensiveStatsContext.tsx` (aggregates league defensive stats at app start).

Important developer workflows

- Run locally: `npm install` then `npm run dev` (Vite dev server). See `README.md`.
- Build: `npm run build` (Vite). Preview: `npm run preview`.
- API keys: Gemini is read from `process.env.API_KEY` via `vite.config.ts` which maps `GEMINI_API_KEY` to `process.env.GEMINI_API_KEY`; the UI also expects an Odds API key stored in localStorage under `ODDS_API_KEY` for parlay features.

Project-specific conventions and patterns

- Environment: `vite.config.ts` wires `GEMINI_API_KEY` into the client as `process.env.API_KEY` and `process.env.GEMINI_API_KEY`. Keep keys out of git; prefer `.env.local`.
- LocalStorage: `PlayerScreen` and `GameScreen` store the odds API key with `localStorage.setItem('ODDS_API_KEY', key)` and expect it on load.
- Defensive stats aggregation: `aggregateLeagueDefensiveStats(season)` in `services/espnService.ts` fetches schedules for all teams and summaries in batches (BATCH_SIZE=5). Be cautious editing concurrency/loops — they touch many external endpoints and are browser-time heavy.
- Error handling: services usually catch errors and either return empty results (enrichment flows) or throw for critical flows. Keep UI error messages simple (strings) as the components expect.

AI / Gemini notes (important for changes to prompts or schemas)

- `services/geminiService.ts` creates a Google GenAI client using `process.env.API_KEY` and calls `models.generateContent` with strict response schemas for `analyzeLiveProps` (JSON schema enforced). If changing the schema or model, update both the `config.responseSchema` and the UI parsing expectations in `GameScreen.tsx`.
- `scoutPlayer` builds large, structured prompts and expects a plaintext summary back. Do not rely on Gemini returning perfectly formatted JSON unless a schema is used.

Files to reference when making edits

- UI/Routes: `App.tsx`, `index.tsx`, `components/*` (GamesScreen, GameScreen, PlayerScreen).
- Data & logic: `services/espnService.ts`, `services/geminiService.ts`.
- Context: `contexts/DefensiveStatsContext.tsx`.
- Types: `types.ts` (use when adding props/TS types).

Small actionable examples

- To add a new prop to AI payloads: update `services/geminiService.ts` and adjust parsing where `analyzeLiveProps` is consumed (in `GameScreen.tsx`).
- To improve defensive stats performance: reduce batch size or cache fetched `fetchGameSummary` results; modify `aggregateLeagueDefensiveStats` carefully (it assumes 32 teams and uses team ids as keys).

Do not change

- Global routing and memory router usage in `App.tsx` (uses `MemoryRouter` with initialEntries — useful for embedding/testing). Keep this unless you fully understand the embed/test implications.
- How API keys are read/written (`process.env` via Vite for Gemini; `localStorage` for Odds API).

When in doubt

- Run the app locally (`npm run dev`) to verify UI changes quickly.
- Inspect network requests for ESPN and Odds API calls using browser devtools — changes to endpoints easily break parsing logic.

If you need clarification or more examples from specific files, ask and I will refine this doc.
