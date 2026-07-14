# Repository Guidelines

## Project Structure & Module Organization

The Next.js UI lives in `app/`; the main client experience is `app/game/HawkerSimulator.tsx`. Game code is under `src/game`: keep deterministic rules in `core/`, browser orchestration in `runtime/`, persistence in `persistence/`, and audio/PWA integrations in their named folders. Content definitions and validation belong in `src/content/`. Static assets are in `public/`, deployment adapters in `worker/` and `build/`, utilities in `tools/`, and project records in `docs/`. Tests mirror these concerns under `tests/`, with simulation-focused suites in `tests/core/`.

Do not edit generated directories such as `.next/`, `dist/`, or `node_modules/`.

## Build, Test, and Development Commands

- `npm install` installs the locked dependencies; use Node.js 22.15 or newer.
- `npm run dev` starts the local Next.js development server.
- `npm run typecheck` runs strict TypeScript checks without emitting files.
- `npm run lint` applies the Next.js TypeScript and Core Web Vitals rules.
- `npm test` runs all Vitest suites once; `npm run test:watch` supports iteration.
- `npm run test:release` runs the complete Sites release gate.
- `npm run build` creates the Sites/Cloudflare Vinext build; `npm run build:vercel` validates native Next.js output for Vercel.
- `npm run smoke:deployment -- <url>` checks a deployed application.

## Coding Style & Naming Conventions

Use TypeScript/TSX with two-space indentation, double quotes, semicolons, and trailing commas in multiline constructs. Prefer `camelCase` for values and functions, `PascalCase` for components and types, and `UPPER_SNAKE_CASE` for module constants. Keep core simulation functions deterministic and side-effect free; isolate browser APIs in runtime or integration modules. Use the `@/` alias for root imports and run lint and type checks before review.

## Testing Guidelines

Vitest uses the Node environment and discovers `tests/**/*.test.ts`; SSR assertions use Node's test runner in `tests/rendered-html.test.mjs`. Add regression tests beside the closest existing suite and name behaviors clearly with `describe`/`it`. No numeric coverage threshold is enforced, so every behavior change should cover the affected state transition, validation edge case, or rendered contract.

## Commit & Pull Request Guidelines

Follow the history's short, imperative subjects, for example `Fix actionable queue flow insights` or `Add guarded Vercel deployment pipeline`. Keep each commit to one coherent change. Pull requests should explain player or operational impact, list validation commands, link relevant issues, and include screenshots for visible UI changes. Call out deployment, persistence, accessibility, or security implications explicitly; centralize shared response-header changes in `src/config/securityHeaders.ts`.
