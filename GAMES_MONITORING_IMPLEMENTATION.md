# Games Monitoring Implementation Summary

## Overview
This document describes the games monitoring system implementation for DashArr, including RSS feed monitoring, initial search on add, and periodic searching.

## Features Implemented

### 1. FitGirl RSS Feed Monitoring ✅
**Location**: `apps/api/src/services/games/FitGirlRssMonitor.ts`

- **Purpose**: Monitors FitGirl's RSS feed (https://fitgirl-repacks.site/feed/) for new game repacks
- **Interval**: Checks every 30 minutes
- **Features**:
  - Parses RSS feed and extracts game entries
  - Filters non-game entries (updates, compatibility packs, etc.)
  - Matches entries against monitored games
  - Auto-downloads when a match is found (score >= 70)
  - Tracks processed entries to avoid duplicates

**Test Endpoint**: `GET /api/v1/games/test/rss/fitgirl`
- Returns detailed information about RSS parsing
- Shows total entries, game entries, monitored games, and potential matches
- Requires authentication

### 2. Prowlarr RSS Feed Monitoring ✅
**Location**: `apps/api/src/services/games/ProwlarrRssMonitor.ts`

- **Purpose**: Monitors Prowlarr indexer RSS feeds for new game releases
- **RSS Endpoint Format**: `http://prowlarr:9696/{indexerId}/api?apikey={key}&extended=1&t=search`
- **Interval**: Checks every 15 minutes
- **Features**:
  - Fetches RSS feeds from all enabled torrent indexers that support RSS
  - Uses 5-second delays between requests to avoid rate limiting
  - Filters out TV shows and movies using pattern detection
  - Strict matching algorithm (requires all game name words to match)
  - Auto-downloads when a match is found (score >= 90)
  - Tracks processed GUIDs to avoid duplicates

**Test Endpoint**: `GET /api/v1/games/test/rss/prowlarr`
- Returns detailed information about RSS feeds from enabled indexers
- Shows indexer count, total releases, game releases, and matches
- Requires authentication

**Note**: Uses `host.docker.internal` for Prowlarr URL when running inside Docker container.

### 3. Initial Search on Game Monitoring ✅
**Location**: `apps/api/src/services/games/GamesService.ts` (method: `performInitialSearch`)

When a game is added to monitoring:
1. Game is immediately added to the monitored games list
2. An initial search is performed asynchronously across all search agents:
   - FitGirl Agent (repacks)
   - DODI Agent (repacks)
   - SteamRip Agent (rips)
   - Prowlarr Agent (scene/p2p via torrent indexers)
3. Candidates are filtered by preferred release type (if specified)
4. Candidates are sorted by priority: repacks > rips > scene > p2p
5. Best candidate is auto-downloaded if magnet/torrent URL is available
6. If no candidate found, game remains in monitoring state for RSS/periodic checks

### 4. Periodic Search for Monitored Games ✅
**Location**: `apps/api/src/services/games/GamesService.ts` (method: `checkMonitoredGames`)

- **Interval**: Runs every 30 minutes
- **Features**:
  - Skips games that are already downloaded or downloading
  - Skips unreleased games (checks release date)
  - Throttles searches (15 min minimum between searches for same game)
  - Searches all configured agents in parallel
  - Auto-downloads best candidate when found
  - Updates game status to 'wanted' when candidates are found

## Monitoring Logic Flow

```
User adds game to monitoring
        ↓
[monitorGame() called]
        ↓
Game added to monitoredGames map
        ↓
Initial search performed (async)
        ↓
┌─────────────────────────────────────────────────────────────┐
│ Initial Search Results:                                      │
│ - Candidates found → Auto-download best match → Status:      │
│   'downloading'                                             │
│ - No candidates → Status remains 'wanted'/'monitored' →     │
│   Wait for RSS/periodic search                              │
└─────────────────────────────────────────────────────────────┘
        ↓
┌─────────────────────────────────────────────────────────────┐
│ Background Monitoring (continuous):                          │
│                                                              │
│ 1. FitGirl RSS Monitor (every 30 min)                       │
│    - New repack found → Match against monitored games       │
│    - Match found → Auto-download                            │
│                                                              │
│ 2. Prowlarr RSS Monitor (every 15 min)                      │
│    - Check all enabled indexers via RSS feeds               │
│    - New releases found → Match against monitored games     │
│    - Match found → Auto-download                            │
│                                                              │
│ 3. Periodic Search (every 30 min)                           │
│    - Search all agents for 'wanted' games                   │
│    - Candidates found → Auto-download best match            │
│                                                              │
│ 4. Manual Check (POST /api/v1/games/check)                  │
│    - Trigger immediate search across all monitored games    │
└─────────────────────────────────────────────────────────────┘
```

## Game Status Lifecycle

1. **monitored**: Game is monitored but not yet released
2. **wanted**: Game is released, searching for download candidates
3. **downloading**: Download has been started
4. **downloaded**: Download completed (manually set or detected via qBittorrent)

## Matching Algorithms

### FitGirl/DODI Matching (Existing)
- Uses IGDB game data (names, alternative names, descriptions)
- Fuzzy matching with word overlap
- Score threshold: 70%
- Includes description similarity comparison

### Prowlarr RSS Matching (New - Stricter)
- Direct inclusion check (title contains game name)
- Requires ALL words from game name to be present in title
- TV show/movie detection (rejects S01E01, WEB-DL, etc.)
- Score threshold: 90%
- No description comparison (RSS feeds don't include descriptions)

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GAMES_RSS_MONITOR_ENABLED` | Enable FitGirl RSS monitoring | `true` |
| `PROWLARR_URL` | Prowlarr base URL | - |
| `PROWLARR_API_KEY` | Prowlarr API key | - |

### Preferred Release Types

When adding a game to monitoring, users can specify:
- `any`: Accept any release type
- `repack`: Prefer repacks (FitGirl, DODI, etc.)
- `rip`: Prefer rips (SteamRip, GOG)
- `scene`: Prefer scene releases
- `p2p`: Prefer P2P releases

## API Endpoints

### Games Monitoring
- `POST /api/v1/games/monitored/:igdbId` - Start monitoring a game
- `DELETE /api/v1/games/monitored/:igdbId` - Stop monitoring a game
- `GET /api/v1/games/monitored` - List all monitored games
- `POST /api/v1/games/check` - Manually trigger check for all monitored games

### Testing
- `GET /api/v1/games/test/rss/fitgirl` - Test FitGirl RSS parsing
- `GET /api/v1/games/test/rss/prowlarr` - Test Prowlarr RSS parsing
- `GET /api/v1/games/test/agents` - Test search agents
- `GET /api/v1/games/test/agents/enhanced/:igdbId` - Test with IGDB matching
- `GET /api/v1/games/test/agents/mock` - Test with mock data

## Logging

All monitoring activities are logged with prefixes:
- `[FitGirlRssMonitor]` - FitGirl RSS monitoring
- `[ProwlarrRssMonitor]` - Prowlarr RSS monitoring
- `[GamesService]` - General games service operations
- Initial search results
- Periodic search results
- RSS feed matches
- Download attempts (success/failure)
- Status changes

## Troubleshooting

### RSS Feeds Returning Empty
- Check Prowlarr is accessible: `GET /api/v1/system/status`
- Verify indexers have RSS support: Check `supportsRss: true`
- Check rate limiting: Some indexers return 429 if polled too frequently
- Use the test endpoints to diagnose issues

### False Positive Matches
- Prowlarr RSS uses strict matching to filter TV shows/movies
- FitGirl/DODI use description-based matching for accuracy
- Check the test endpoint results to see match scores

### Downloads Not Starting
- Verify qBittorrent is configured and accessible
- Check that releases have magnet URLs or download URLs
- Review logs for specific error messages
