# CLAUDE.md — standing instructions

**Read `DESIGN.md` before making any change.**

## Development process

1. Requirements
2. Design
3. Verify the logic/flow
4. Code
5. Test
6. Fix errors
7. Verify against the requirements

Repeat until there are no errors. Then:

- Bump the version in **both** `src/logic.js` (`VERSION`) and `package.json`.
- Run `./build.sh`.
- Add a new numbered section to `DESIGN.md` describing the change.

## Debugging process

1. Locate
2. Diagnose
3. Fix plan
4. Implement
5. Verify
6. Version bump (same steps as above: `src/logic.js` VERSION, `package.json`, `./build.sh`, numbered `DESIGN.md` section)

## Before every commit

- Run `npm test` (it includes `test/config.js`).
- Run the browser tests in `test/` that are touched by the change (see `npm run test:e2e` for the main set).

## Never

- Never replace `vercel/firebase-config.js` with `vercel/firebase-config.example.js`.

## Infrastructure

- Database: Firebase project `karate-event-webapp`
- Hosting: Vercel
- Source: GitHub `main` branch

If `firestore.rules` changes, tell the user: **"redeploy the rules"** (`npm run deploy:rules`).
