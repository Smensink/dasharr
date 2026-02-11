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

## Agent Notes (2026-02-11)
- Codebase behavior learned:
  - The game matching pipeline supports three evaluation modes: heuristic `matched`, `ml_only` (probability threshold), and `hybrid(+ML)` where ML can only turn heuristic matches off (plus a looser "triage" reject threshold).
  - Match-model training data can have many near-duplicates that share `(gameId, gameName, candidateTitle)` but differ by source/indexer and torrent metadata; dedup strategy materially changes the effective training set size.
  - Windows + Docker Desktop can fail `docker pull`/build from non-interactive SSH sessions due to credential helper/logon session issues; running builds interactively or avoiding builds (`--no-build`) is more reliable once images exist.
  - Port 8000 is commonly occupied (e.g. Portainer); services should support configurable host ports.
- User product/workflow preferences learned:
  - Prefer a hybrid approach: strong heuristics for safety/obvious matches, ML for gating/triage, and per-source thresholds to push accepted precision close to 1.0.
  - Wants the system to take advantage of a remote Windows server GPU when possible, orchestrated via `sshpass` for remote commands.
  - Explicitly wants `prowlarr:bitmagnet` treated as manual-review only due source-quality concerns (no ML auto-accept for that source).
- Additional edge cases learned:
  - Hydra thresholds must be computed from Hydra-labeled data (e.g. `match-training-review-focus-labeled.csv`), because the large auto-labeled CSV can be heavily Prowlarr-skewed and contain zero Hydra rows.
  - Discover game rails intentionally exclude already monitored/downloaded items so users don’t repeatedly see games already in their acquisition workflow.

## Agent Notes (2026-02-11, discover games curation)
- Codebase behavior learned:
  - Game Discover supports multiple independent rails fed from dedicated API endpoints (`/games/anticipated`, `/games/top-rated`, etc.), making it straightforward to add specialized curated rails without affecting movie/TV discover sections.
  - IGDB queries in `IGDBClient` can be safely specialized by genre/rating constraints, while `GamesService` can blend specialized + fallback pools and rank them with lightweight heuristics.
- User product/workflow preferences learned:
  - User wants a dedicated Discover section for highly rated simple indie-style games (puzzle/platformer/roguelite), with examples like Tiny Rogues, rather than only broad “top games” lists.

## Agent Notes (2026-02-11, match safety + monitoring behavior)
- Codebase behavior learned:
  - Monitored game status is derived from in-memory monitored entries plus pending approvals; adding explicit status refresh hooks after rejects prevents games getting stuck in a stale `wanted` state.
  - Periodic game checks previously skipped unreleased items in `monitored` status, which could suppress new candidate discovery for upcoming titles after prior cleanup.
  - Match safety can be materially improved by hard-rejecting high-risk heuristics before ML gating (e.g., major release-year mismatch, unreleased crack/repack indicators, and third-party indexer repacker impersonation for upcoming titles).
- User product/workflow preferences learned:
  - Monitored games must continue periodic re-search even after all proposed matches are rejected.
  - Upcoming/new titles should default to manual review behavior rather than being treated as normal auto-accept ML matches.
  - User prefers conservative handling of obvious fake candidates (examples raised: GTA VI fakes, Resident Evil Requiem fake FitGirl-tagged indexer results, and Fable 2026 matching older-year releases).
