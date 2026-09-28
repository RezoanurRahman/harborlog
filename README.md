# Harborlog

Harborlog is a local-first marina maintenance log for vessels, service tasks, parts checklists, and
dockside activity. It runs entirely on your machine: a Qwik frontend talks to a typed Elysia API
backed by deterministic in-memory storage, with no database, credentials, or external services.

## Quick start

```bash
npm install
npm run dev
# then open http://localhost:5173
```

`npm run dev` starts both halves of the app together:

- Qwik dev server (Vite) on [http://localhost:5173](http://localhost:5173)
- Elysia API on [http://localhost:4173](http://localhost:4173)

Vite proxies every `/api` request to the API server, so the frontend and API share one origin during
development.

## Production

```bash
npm run build
npm start
```

`npm run build` bundles the Qwik app into `dist/`. `npm start` runs the Elysia server with `tsx` and
serves both the API and the built frontend from `dist/` on [http://localhost:4173](http://localhost:4173).

## API

| Endpoint                               | Description                           |
| -------------------------------------- | ------------------------------------- |
| `GET http://localhost:4173/api/health` | Health check; returns the API status. |

## Quality commands

| Command                                   | What it does                                             |
| ----------------------------------------- | -------------------------------------------------------- |
| `npm run dev`                             | Runs the API and the Vite dev server concurrently.       |
| `npm run lint`                            | ESLint flat config over the repo; fails on any warning.  |
| `npm run lint:fix`                        | Lints and fixes what can be fixed automatically.         |
| `npm run typecheck`                       | TypeScript in strict mode with `tsc --noEmit`.           |
| `npm test`                                | Runs the Vitest suite once.                              |
| `npm run test:watch`                      | Runs Vitest in watch mode.                               |
| `npm run build`                           | Production build into `dist/`.                           |
| `npm start`                               | Starts the production Elysia server on port 4173.        |
| `npm run preview`                         | Serves the production build with Vite for a quick check. |
| `npm run format` / `npm run format:check` | Formats or verifies formatting with Prettier.            |

CI runs the same gates on Node 22 — install, lint, typecheck, test, build — then starts the
production server, waits for `/api/health` to answer, and stops it again.

## Stack

- **Frontend:** Qwik 1 with Vite 7, rendered client-side through `qwikVite({ csr: true })`
- **Backend:** Elysia 1 on the `@elysiajs/node` adapter, with `@elysiajs/static` serving the built app
- **Storage:** deterministic in-memory store — no external services
- **Tooling:** TypeScript (strict), Vitest, ESLint flat config with typescript-eslint, Prettier,
  `tsx`, and `concurrently`

## Requirements

- Node.js 22.13 or newer (npm is bundled with it)
- No Bun, no Docker, no credentials, and no external services

## Data and determinism

Everything Harborlog keeps — vessels, service tasks, parts checklists, and activity entries — lives in
memory inside the API process. The store is seeded deterministically, so a fresh start always looks
the same, and **data resets on restart**. That keeps local runs predictable and tests fully
reproducible.

## Project layout

```text
index.html            App shell that loads src/entry.dev.tsx
src/entry.dev.tsx     Qwik client entry point
src/                  Qwik components, state, and shared domain types
src/server/index.ts   Elysia API (health and resources) on port 4173
dist/                 Production build output (generated)
```

## License

MIT — see [LICENSE](./LICENSE).
