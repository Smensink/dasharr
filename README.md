# DashArr

DashArr is a unified dashboard for the *arr ecosystem and related media tooling. It brings Radarr, Sonarr, Readarr, Prowlarr, and download clients into one clean UI, with a TypeScript API that aggregates queues, calendars, and search across services.

## Who It Is For

DashArr is built for self-hosters running multiple *arr services who want one place to monitor downloads, search across services, and manage libraries without hopping between tabs.

## Features

- Unified dashboard across *arr services
- Unified search across Radarr, Sonarr, and Readarr
- Unified download queue across *arr services and clients
- Unified calendar view for upcoming releases
- Download client integration for qBittorrent and SABnzbd
- IGDB game discovery, monitoring, and download workflows
- Mobile-friendly UI and responsive layouts
- Docker support for local and production deployments

## Tech Stack

- API: Node.js, Express, TypeScript
- Web: React, Vite, TanStack Query, Zustand, Tailwind CSS
- Shared: TypeScript types package for API and web
- Infra: Docker and Docker Compose

## Quick Start

### Local Development

1. Install dependencies.

```bash
pnpm install
```

2. Create and edit `.env`.

```bash
cp .env.example .env
```

3. Start the dev servers.

```bash
pnpm dev
```

The API runs on `http://localhost:3000` and the web app on `http://localhost:5173`.

### Docker

1. Create and edit `.env`.

```bash
cp .env.example .env
```

2. Start Docker Compose.

```bash
docker compose -f docker/docker-compose.yml up -d
```

Access the app at `http://localhost:3000`.

## Configuration

All services are configured via environment variables in `.env`. Use `.env.example` as the source of truth. Each service has an enable flag, a URL, and an API key.

Example:

```bash
RADARR_ENABLED=true
RADARR_URL=http://radarr:7878
RADARR_API_KEY=your_api_key_here
```

## Project Structure

```
apps/api/            Express + TypeScript API
apps/web/            React + Vite UI
packages/shared-types/ Shared TypeScript types
docker/              Dockerfiles and compose configs
```

## Architecture

### Backend

- Service clients wrap external APIs with retrying and error handling
- Service layer abstracts common *arr patterns
- Controllers and routes expose a consistent REST surface
- In-memory caching reduces repeated upstream calls

### Frontend

- TanStack Query manages server state and caching
- Zustand handles UI preferences and local state
- React Router controls navigation
- Tailwind CSS provides layout and styling

## Deployment

Use Docker for local or production deployments. The compose files in `docker/` provide a baseline setup. For production, set strong API keys and validate service connectivity.

## Roadmap

- RDTClient integration
- Plex and Tautulli integration
- Quality profile management
- Log viewer
- Advanced filtering and sorting

## Contributing

Contributions are welcome. Please:

1. Create a feature branch.
2. Run `pnpm lint` and `pnpm type-check` before opening a PR.
3. Include screenshots for UI changes.

## License

MIT
