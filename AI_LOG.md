# AI_LOG.md


## Tools used and what for

| Tool | Used for |
|---|---|
| Claude Code (VS Code extension; Claude Opus 5.5, later Claude Sonnet 5.5) | Domain research (web search and page fetches), the monorepo, the parametric engine, API, web app, tests, deployment files, README, RESEARCH_NOTES.md, this log |
| Playwright (Chromium) | Screenshots of rendered sheets and the UI to inspect drawings; the end-to-end test |
| PyMuPDF | Rendering the exported PDF to an image to check text rotation, dashes and page size |
| ESLint, `tsc --strict`, Vitest, Supertest, Testing Library | Checking the AI-written code |


## Key prompts (summarised)

1. I used Claude code to generate comprehensive prompts:
give prompt to achieve the above task to perfection without making any half measures, prompt ai to do his own research to produce a result that creates a best user experience and solves the problem that the user have and overall create a great user experience.


2. 
i want to use the below stack
(Nodejs backend
Prisma ORM - will be deployed on neon
) 
React + Material UI - Frontend
JWT auth - if required

All will be deployed on render and db on neon.

3. 
ok this is running seperately ,

i want to run 2 agents again seperately from this : will use 2 seperate from scratch sessions for these:

1)
only will research find and see how to integrate it here:
one will research about a suitable open source model lightweight model that can extend user experience and add value here .... and it should be something that adds value not fitted in strictfully... can be something related to physics laws etc or can be something better i dont know i am just giving the idea.

2)
one will do research on the best work done on 2D diagrams ... whatever this is that we're creating here i dont know ..,  whatever work was done how was it done and how can we integrate it here.

give 2 seperate prompts for the above 2 sessions and i will give you the result of both the sessions here and then you will give me the prompt to run in the session we are running right now of the last prompt you gave.

I ran 4 consecutive agents 2 doing the research required 1 checking the research done and implementing only rationally made choice through the 4th final agent.

## Times the AI was wrong, and how it was caught
1. **A layout bug only visible in the browser.** The drawing canvas rendered 1257 px tall and pushed the sheet off screen. The component tests passed; measuring the DOM in Playwright showed `flex: 1` overriding the fixed height of the editor. Fixed and re-measured.
5. **A flaky test setup found by the clean-clone run.** The API tests started their database on a fixed port; a crashed earlier run left a server behind and the next run failed with "No test files found". Fixed by asking the OS for a free port and always stopping the server; two back-to-back runs now pass with no leftover process.
