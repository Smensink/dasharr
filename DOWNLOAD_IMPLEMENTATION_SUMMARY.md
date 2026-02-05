# Download Implementation Summary

## Overview
Implemented the complete download flow from search results to qBittorrent:
1. Extract magnet links from search results
2. Pass magnet links to qBittorrent via API
3. Track download status in monitored games

## Backend Changes

### 1. QBittorrentClient.ts
Added methods to add torrents:

```typescript
async addMagnetLink(magnetUrl: string, options?: {...}): Promise<string>
async addTorrentUrl(torrentUrl: string, options?: {...}): Promise<void>
```

### 2. QBittorrentService.ts
Added wrapper method:

```typescript
async addMagnetLink(magnetUrl: string, options?: {...}): Promise<string>
```

### 3. GamesService.ts
- Added `qbittorrentService` dependency
- Implemented `startDownload()` method:
  - Validates game is monitored
  - Extracts magnet/torrent URL from candidate
  - Adds to qBittorrent with 'games' category
  - Updates game status to 'downloading'
  - Stores download hash for tracking

### 4. Service Registry
Updated to pass `qbittorrentService` to `GamesService`

## Frontend Changes

### Games.tsx - CandidateCard Component
Added download functionality:

```typescript
interface CandidateCardProps {
  candidate: GameDownloadCandidate;
  game: GameSearchResult | MonitoredGame;
  onDownload: () => void;        // NEW
  isDownloading: boolean;        // NEW
}
```

**UI Changes:**
- "⬇️ Download to qBittorrent" button (green, primary action)
- Disabled state during download
- Success/error alerts
- "🧲 Magnet" link (secondary, opens magnet URL directly)

### Games.tsx - SearchResultsModal Component
Added download mutation:

```typescript
const downloadMutation = useMutation({
  mutationFn: ({ candidate, downloadClient }) =>
    api.games.startDownload(game.igdbId, candidate, downloadClient),
  onSuccess: () => {
    queryClient.invalidateQueries({ queryKey: ['games', 'monitored'] });
    alert('Download started successfully!');
  },
  onError: (error) => {
    alert(`Failed to start download: ${error.message}`);
  },
});
```

## User Flow

```
1. Search for game
   ↓
2. Click "🔍 Search Downloads" 
   ↓
3. View candidates with scores
   ↓
4. Expand desired candidate
   ↓
5. Click "⬇️ Download to qBittorrent"
   ↓
6. Game added to monitored with 'downloading' status
   ↓
7. Download appears in qBittorrent with 'games' category
```

## API Endpoint

```
POST /api/v1/games/:igdbId/download
Body: {
  candidate: GameDownloadCandidate,
  downloadClient?: 'qbittorrent' | 'rdtclient'
}
```

## Key Features

### Automatic Monitoring
- Game must be monitored before download
- Download automatically updates game status
- Tracks download hash for progress monitoring

### Category Management
- Downloads added to 'games' category in qBittorrent
- Enables organization and filtering

### Error Handling
- Validates magnet/torrent URL exists
- Checks qBittorrent availability
- User-friendly error messages

### Progress Tracking
```typescript
game.currentDownload = {
  status: 'downloading',
  progress: 0,
  source: candidate.source,
  title: candidate.title,
  client: 'qbittorrent',
  hash: downloadHash,  // For tracking
};
```

## Testing

Test with Baldur's Gate 3:
```bash
curl -X POST "http://localhost:3000/api/v1/games/119171/download" \
  -H "Content-Type: application/json" \
  -d '{
    "candidate": {
      "title": "Baldur's Gate 3: Digital Deluxe Edition",
      "magnetUrl": "magnet:?xt=urn:btih:...",
      "source": "FitGirl",
      "releaseType": "repack"
    }
  }'
```

## Future Enhancements

1. **Real-time Progress**: Poll qBittorrent for download progress
2. **Completion Detection**: Auto-mark game as 'downloaded' when complete
3. **RDTClient Support**: Add Real-Debrid download option
4. **Torrent File Support**: Download and add .torrent files
5. **Download History**: Track all download attempts
