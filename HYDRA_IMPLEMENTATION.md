# Hydra Library Search Pipeline Implementation

This document describes the implementation of the alternative game download search pipeline using Hydra Library sources.

## Overview

The Hydra Library search pipeline allows DashArr to search for game downloads from community-maintained sources instead of relying solely on manual search agents (FitGirl, DODI, etc.).

## Features

- **Toggle Hydra Library search**: Enable/disable Hydra Library as a search source
- **Trust level filtering**: Select which trust levels to include (Trusted, Safe, Abandoned, Unsafe, NSFW)
- **Source selection**: Choose specific sources to use from the available Hydra Library sources
- **Cache configuration**: Configure how long to cache Hydra library data
- **Results limiting**: Set maximum results per source

## API Endpoints

### Hydra Controller (`/api/v1/hydra`)

- `GET /sources` - Get all available Hydra sources with metadata
- `GET /sources/trust/:level` - Get sources by trust level
- `GET /settings` - Get current Hydra settings
- `PUT /settings` - Update Hydra settings
- `GET /search?q={gameName}` - Search for a game
- `POST /refresh` - Clear Hydra library cache

### App Settings (`/api/v1/app-settings/hydra`)

- `GET /hydra` - Get Hydra settings
- `PUT /hydra` - Update Hydra settings

## Data Structures

### HydraSource

```typescript
interface HydraSource {
  id: string;
  name: string;
  url: string;
  trustLevel: 'trusted' | 'safe' | 'abandoned' | 'unsafe' | 'nsfw';
  description?: string;
  author?: string;
  enabled?: boolean;
}
```

### HydraSearchSettings

```typescript
interface HydraSearchSettings {
  enabled: boolean;
  enabledSources: string[];
  allowedTrustLevels: HydraSourceTrustLevel[];
  cacheDurationMinutes: number;
  maxResultsPerSource: number;
}
```

## Frontend Settings

A new "Hydra Library" section has been added to the Games tab in Settings:

1. **Enable Hydra Library Search** - Toggle to enable/disable Hydra search
2. **Trust Levels** - Multi-select checkboxes for filtering sources by trust level
   - Trusted (green)
   - Safe For Use (blue)
   - Abandoned (amber)
   - Use At Your Own Risk (red)
   - NSFW (purple)
3. **Enabled Sources** - Checkboxes to select specific sources
4. **Cache Duration** - Minutes to cache library data
5. **Max Results Per Source** - Limit results from each source

## Backend Services

### HydraLibraryService

Manages Hydra Library sources and searching:

- `getAvailableSources()` - Returns all known Hydra sources
- `getSourcesByTrustLevel()` - Filters sources by trust level
- `searchGame()` - Searches for a game across enabled sources
- `isAvailable()` - Checks if Hydra search is enabled

### HydraLibraryAgent

Search agent implementation for the GamesService:

- Implements `BaseGameSearchAgent`
- Priority: 90 (high priority for curated sources)
- Supports all release types (repack, rip, scene, p2p)
- Uses enhanced matching with IGDB data

## Known Sources

The following Hydra Library sources are pre-configured:

| ID | Name | Trust Level |
|----|------|-------------|
| fitgirl | FitGirl Repacks | trusted |
| dodi | DODI Repacks | trusted |
| steamrip | SteamRip | safe |
| onlinefix | OnlineFix | safe |
| kaoskrew | KaOsKrew | safe |
| masquerade | Masquerade Repacks | safe |
| armgddn | ARMGDDN | safe |

## Environment Variables

The following environment variables can be used to configure Hydra settings:

- `HYDRA_SEARCH_ENABLED` - Enable/disable Hydra search (true/false)
- `HYDRA_ENABLED_SOURCES` - Comma-separated list of source IDs
- `HYDRA_ALLOWED_TRUST_LEVELS` - Comma-separated list of trust levels
- `HYDRA_CACHE_DURATION` - Cache duration in minutes
- `HYDRA_MAX_RESULTS` - Maximum results per source

## Integration with GamesService

The Hydra Library agent is integrated into the GamesService:

1. When the GamesService initializes, it checks for Hydra settings
2. If enabled, a `HydraLibraryAgent` is added to the search agents
3. The agent participates in parallel searches with other agents
4. Results are sorted by match score and displayed alongside other sources

## Future Enhancements

- Direct fetching from Hydra wiki JSON endpoints
- Automatic source discovery
- Source health checking
- Download statistics tracking
- User-contributed source submissions
