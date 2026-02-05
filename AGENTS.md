# Repository Guidelines

## Project Structure & Module Organization
- `apps/api/` is the Express + TypeScript backend. Source lives in `apps/api/src/` with `clients/`, `services/`, `controllers/`, `routes/`, and `config/` separated by responsibility.
- `apps/web/` is the React + Vite frontend. UI code is in `apps/web/src/` with `components/`, `pages/`, `lib/`, and `stores/`.
- `packages/shared-types/` holds shared TypeScript types used by both apps.
- `docker/` contains Dockerfiles and compose configs for local and production setups.
- Build artifacts land in `apps/*/dist/` and `packages/*/dist/`; do not edit these by hand.

## Build, Test, and Development Commands
Run from the repo root using pnpm:
```bash
pnpm dev          # run API and web dev servers
pnpm dev:api      # API only (http://localhost:3000)
pnpm dev:web      # web only (http://localhost:5173)
pnpm build        # build both apps
pnpm start        # run production API server
pnpm lint         # eslint across workspaces
pnpm type-check   # tsc --noEmit across workspaces
pnpm docker:dev   # docker compose dev
pnpm docker:prod  # docker compose prod
```

## Coding Style & Naming Conventions
- TypeScript everywhere; prefer explicit types for API boundaries.
- Formatting: Prettier with 2-space indentation, single quotes, semicolons, print width 80.
- Linting: ESLint + @typescript-eslint (unused vars error; allow `_`-prefixed).
- Naming: React pages/components use PascalCase file names (see `apps/web/src/pages/`). API files use kebab-case with suffixes like `.service.ts` or `.controller.ts`.

## Testing Guidelines
- No test runner is configured in this repo yet (no `test` script present).
- If you add tests, keep them close to source (e.g., `__tests__` or `*.test.tsx`) and wire a `pnpm test` script at the workspace root.

## Commit & Pull Request Guidelines
- This checkout does not include git history, so commit conventions could not be inferred. If a history is available, follow its pattern or adopt Conventional Commits.
- PRs should include a clear description, a list of key changes, and screenshots for UI changes. Link related issues when applicable.

## Configuration & Security Tips
- Copy `.env.example` to `.env` and fill in service URLs and API keys before running locally.
- Avoid committing secrets; keep tokens in `.env` and verify `.gitignore` coverage before pushing.
