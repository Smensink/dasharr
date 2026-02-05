# Game Matching Issues - Findings

## Status Update (2026-02-02)

### ✅ FIXED - Games Now Matching

1. **God of War Ragnarök** - Score: 85/100 ✅
   - Alternative name "God of War: Ragnarok" (with ASCII 'o') matches FitGirl's "Ragnarök"
   - Special character normalization working

2. **Star Wars Jedi: Survivor** - Score: 78/100 ✅
   - Description similarity improvements
   - Version suffix removal working

3. **Uncharted: Legacy of Thieves Collection** - Score: 85/100 ✅
   - Title matching with edition suffixes working

4. **Marvel's Spider-Man: Miles Morales** - Score: 75/100 ✅
   - Alternative name matching working
   - Apostrophe normalization (U+0027 and U+2019) fixed
   - FitGirl search using alternative names with "Marvel's" prefix

## Root Causes & Fixes Applied

### 1. Special Character Normalization ✅ FIXED
**Problem:** "Ragnarok" ≠ "Ragnarök" (ö not being normalized)

**Solution:** Added Unicode escape sequences in regex:
```typescript
.replace(/[\u00F6\u00F8\u014D\u014F\u0151]/g, 'o')  // öøōŏő → o
.replace(/[\u00E4\u00E5\u0101\u0103\u0105]/g, 'a')  // äåāăą → a
```

### 2. Apostrophe Handling ✅ FIXED
**Problem:** Curly apostrophe (U+2019 ' ) not being removed

**Solution:** Use Unicode escapes instead of literal characters:
```typescript
.replace(/[\u0027\u2019]/g, '')  // ' and ' → removed
```

### 3. Alternative Names Support ✅ FIXED
**Problem:** Games with different naming conventions (IGDB vs FitGirl)

**Solution:** Added IGDB alternative names to matching algorithm (+30 points for match)

### 4. FitGirl Search Enhancement ✅ FIXED
**Problem:** FitGirl search for "Spider-Man Miles Morales" returned "Spider-Man 2"

**Solution:** Use alternative names (with "Marvel's" prefix) for FitGirl search query

### 5. Version/Edition Suffix Removal ✅ FIXED
**Problem:** Edition text ("Digital Deluxe Edition", "v1.1116.0.0") interfering with matching

**Solution:** Enhanced `cleanGameName()` to strip:
- Version numbers (v1.1116.0.0)
- Edition text (Digital Deluxe, GOTY, etc.)
- Build suffixes (+ DLC + Bonus OST)

## Implementation Summary

### Files Modified

1. **packages/shared-types/src/games.ts**
   - Added `IGDBAlternativeName` interface
   - Added `alternative_names` field to `IGDBGame`

2. **apps/api/src/clients/IGDBClient.ts**
   - Fetch alternative names from IGDB API

3. **apps/api/src/services/games/GamesService.ts**
   - Include alternative names in mock test data

4. **apps/api/src/services/games/search-agents/BaseGameSearchAgent.ts**
   - Fixed Unicode regex for special characters
   - Fixed Unicode regex for apostrophes
   - Added alternative name matching logic (+30 points)
   - Enhanced version/edition suffix removal

5. **apps/api/src/services/games/search-agents/FitGirlAgent.ts**
   - Use alternative names for search queries

## Test Results

### Currently Matching on FitGirl:
| Game | Score | Status |
|------|-------|--------|
| God of War (2018) | 100 | ✅ |
| God of War Ragnarök | 85 | ✅ |
| Uncharted: Legacy Collection | 85 | ✅ |
| Star Wars Jedi: Survivor | 78 | ✅ |
| Spider-Man Miles Morales | 75 | ✅ |
| Stray | 78 | ✅ |
| Dying Light 2 | 72 | ✅ |
| Dead Space | 70 | ✅ |

### Not on FitGirl (Confirmed):
- Hogwarts Legacy
- Spider-Man Remastered
- A Plague Tale: Requiem
- The Last of Us Part I

## Technical Details

### Matching Algorithm Scoring (70+ threshold)

**Base Scores:**
- Exact name match: +50
- Exact phrase match: +35 (long names) / scaled (short names)
- Title contains game name: +25
- Alternative name match: +30
- Prefixed title match: +15

**Description Scoring:**
- >40% similarity: +40
- >25% similarity: +25
- >15% similarity: +12
- >10% similarity: +5
- <10% similarity: -10

**Bonus Points:**
- Strong title match: +10
- High word match ratio: +15
- All keywords present: +10
- Year match: +10

**Penalties:**
- Sequel number mismatch: -15
- Extra words: varies
- Description mismatch: -10
