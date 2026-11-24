# AI_LOG.md

Factual log of how AI was used in this project, written from the working session. `DECISIONS.md` was **not** produced with AI and is not part of this log.

## Tools used and what for

| Tool | Used for |
|---|---|
| Claude Code (VS Code extension; Claude Opus 5.5, later Claude Sonnet 5.5) | Domain research (web search and page fetches), the monorepo, the parametric engine, API, web app, tests, deployment files, README, RESEARCH_NOTES.md, this log |
| Playwright (Chromium) | Screenshots of rendered sheets and the UI to inspect drawings; the end-to-end test |
| PyMuPDF | Rendering the exported PDF to an image to check text rotation, dashes and page size |
| ESLint, `tsc --strict`, Vitest, Supertest, Testing Library | Checking the AI-written code |

AI did **not** write `DECISIONS.md`. The `Crane_*_Research_Report.pdf` files in the project folder appeared during the session; they were treated as reference reading only and nothing in the app was built from them.

## Key prompts (summarised)

1. *Master brief:* build the take-home to a "reviewer would think this person understands our users" standard on a fixed stack (Node + TypeScript API, Prisma on Neon, React + Vite + MUI, Render), with Zod schemas and the parametric engine shared by client and server, phases for user analysis, research, engine, API, UI and deployment, a hard rule not to write `DECISIONS.md`, and "never invent a standard, formula or citation; label estimates".
2. *Research constraint:* read the brief, the sample drawing and the sketch first; research standards and manufacturer data on the web; record URLs and a confidence level for every formula; record where sources conflict.
3. *Verification constraint:* render extreme designs and look at them; try to break validation and auth; run everything from a clean clone using only the documented commands.

(Replace these with your own wording if you prefer; they describe what was asked.)

## Times the AI was wrong, and how it was caught

1. **Search summaries disagreed with the standards.** The web-search tool's summaries mixed vendor blogs with standards (for example a class-by-class girder deflection table L/600…L/1200 attributed to CMAA 70, and a "wheelbase ≥ span/7" rule). I downloaded the primary documents that were free (IS 3177:1999 full text, CMAA's own buyers' guide and FAQ) and checked: only the CMAA 1/888 girder limit and the CMAA 74 §3.6.1 wheelbase ≥ span/8 survived; the rest became labelled Low/Estimate, with the conflict recorded in RESEARCH_NOTES.md. A page-fetch also "read" a Demag PDF that turned out to be an unrelated trailer-manufacturer document; the content was obviously off, so it was discarded and the Demag wheel catalogue was fetched separately.
2. **The code-writing tool silently rewrote escape sequences.** Source files containing `​`-style escapes came back with the real invisible characters (one test file even got mojibake). Behaviour was still right, but the next `eslint` run failed on `no-irregular-whitespace`. Fixed by writing the escapes as text again.
3. **A drawing bug only visible in a screenshot.** The first end view drew the runway beam over the hook, hiding it. Unit tests passed (geometry was inside the frame); looking at the rendered PNG showed it. The beam is now a thin flange strip.
4. **A layout bug only visible in the browser.** The drawing canvas rendered 1257 px tall and pushed the sheet off screen. The component tests passed; measuring the DOM in Playwright showed `flex: 1` overriding the fixed height of the editor. Fixed and re-measured.
5. **A flaky test setup found by the clean-clone run.** The API tests started their database on a fixed port; a crashed earlier run left a server behind and the next run failed with "No test files found". Fixed by asking the OS for a free port and always stopping the server; two back-to-back runs now pass with no leftover process.
