# Frontend Interactive Search Feature

## Overview
Added an interactive "Search Downloads" button to each game card on the Games search page. When clicked, it opens a modal pane showing all download candidates with their match scores.

## Features Implemented

### 1. Search Downloads Button
- Added to each game card in the Games page
- Button labeled "🔍 Search Downloads"
- Styled with secondary color to distinguish from Monitor/Unmonitor buttons

### 2. Interactive Results Modal
- Opens when "Search Downloads" button is clicked
- Shows game cover and title in header
- Displays loading state while searching
- Shows error state if search fails
- Shows empty state if no candidates found
- Lists all candidates sorted by match score

### 3. Candidate Cards with Scoring
Each candidate displays:

#### Score Badge (Color-coded)
- **90-100**: Green (Excellent match)
- **70-89**: Blue (Good match)
- **50-69**: Yellow (Fair match)
- **Below 50**: Red (Poor match)

#### Game Information
- Title with release type badge (repack, scene, etc.)
- Quality badge (FitGirl, etc.)
- File size
- Seeders count (if available)
- Source (FitGirl, Prowlarr, etc.)

#### Match Reasons
- Shows why the game matched (e.g., "exact name match", "title contains game name")
- Up to 4 reasons visible, with "+N more" indicator if more exist

#### Expandable Details
- Click to expand for full match reasons list
- Shows download links (Magnet, Torrent) when available

## Screenshots Description

### Games List View
```
┌─────────────────────────────────────┐
│ 🎮 Game Cover    Game Name          │
│                  Release: 2023      │
│                  Platforms: PC, PS5 │
│                  ⭐ 94.5            │
│                                     │
│ [🔍 Search Downloads] [Monitor]     │
└─────────────────────────────────────┘
```

### Search Results Modal
```
┌──────────────────────────────────────────────────────┐
│ [Cover] Game Name                              [✕]   │
│ Search Results from Download Sources                 │
├──────────────────────────────────────────────────────┤
│ Found N candidate(s) | Sorted by match score         │
│                                                      │
│ ┌──────────────────────────────────────────────────┐ │
│ │ [95] Title - Release Type - Quality        [▶]   │ │
│ │ 💾 Size | 🌱 Seeders | 📡 Source                   │ │
│ │ Match: exact name, title match, +2 more          │ │
│ └──────────────────────────────────────────────────┘ │
│                                                      │
│ ┌──────────────────────────────────────────────────┐ │
│ │ [88] Title - Repack - FitGirl              [▼]   │ │
│ │ 💾 Size | 🌱 Seeders | 📡 Source                   │ │
│ │ Match: exact name, title match, +2 more          │ │
│ ├──────────────────────────────────────────────────┤ │
│ │ All Match Reasons:                               │ │
│ │ • exact name match • title match • etc           │ │
│ │                                                  │ │
│ │ [🧲 Magnet Link] [📥 Torrent File]               │ │
│ └──────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────┘
```

## Technical Implementation

### Files Modified
- `apps/web/src/pages/Games.tsx`

### Key Components
1. **`GameCard`** - Added `onSearch` prop and "Search Downloads" button
2. **`SearchResultsModal`** - New modal component for displaying results
3. **`CandidateCard`** - Card component for each download candidate with:
   - Score badge with color coding
   - Expandable details section
   - Download link buttons

### API Integration
Uses existing `api.games.getCandidates(igdbId)` endpoint:
```typescript
const { data: candidates } = useQuery({
  queryKey: ['games', 'candidates', game.igdbId],
  queryFn: () => api.games.getCandidates(game.igdbId),
});
```

### State Management
- `selectedGame` state tracks which game's results are being viewed
- Modal closes when clicking X, clicking outside, or pressing Escape

## User Flow

1. User searches for a game on the Games page
2. User sees search results with game cards
3. User clicks "🔍 Search Downloads" button on a game card
4. Modal opens showing loading spinner
5. Backend searches all agents (FitGirl, DODI, SteamRIP, Prowlarr)
6. Results appear with scores and details
7. User can:
   - View match scores and reasons
   - Expand cards to see all details
   - Click download links (Magnet/Torrent)
   - Close modal to search another game

## Testing

Tested with:
- Baldur's Gate 3 (shows 100/100 score)
- Elden Ring (shows multiple candidates)
- Games not on FitGirl (shows empty state)

## Notes

- The search uses the production enhanced search with all improvements:
  - Alternative names matching
  - Steam description comparison
  - Improved scoring algorithm
- Results are automatically sorted by match score (highest first)
- No backend changes required - uses existing candidates endpoint
