# Prowlarr Search & Matching Analysis Report

## Test Methodology
- **Games Tested**: 15 popular games from IGDB
- **Search Method**: Prowlarr API search with game names
- **Matching Logic**: Strict matching requiring ALL words from game name to be present
- **Filters Applied**: TV/Movie detection, update/trainer filtering

## Games Tested
1. Baldur's Gate III (short: "Baldur's Gate 3")
2. Cyberpunk 2077: Ultimate Edition (short: "Cyberpunk 2077")
3. The Witcher 3: Wild Hunt (short: "The Witcher 3")
4. Elden Ring
5. Grand Theft Auto V (short: "GTA V")
6. Red Dead Redemption 2
7. God of War
8. Horizon Zero Dawn
9. Spider-Man (bundle)
10. Final Fantasy VII (bundle)
11. Minecraft
12. Call of Duty
13. Assassin's Creed (bundle)
14. Dark Souls
15. Hogwarts Legacy

## Results Summary

### Games with Strong Matches ✅
| Game | Matches | Notes |
|------|---------|-------|
| Baldur's Gate III | 179 | Good quality matches including ElAmigos release |
| Cyberpunk 2077 | 1066 | Many matches, but includes comics and books |
| The Witcher 3 | 1061 | High match count but **TV show included** |
| Elden Ring | 723 | Good matches, mostly comics in sample |
| GTA V | 930 | Good matches, includes various GTA games |

### Key Findings

#### 1. False Positives Detected

**TV Shows Passing Through Filter:**
- "The Witcher [2019] S02 1080p WEBRip" - **FALSE POSITIVE**
  - Cleaned: "the witcher s02 webrrip"
  - Game name: "the witcher 3 wild hunt"
  - Issue: "the witcher" matches, TV pattern not detected

**Comics/Books Matching:**
- "Dark.Horse-Cyberpunk.2077.Library.Edition.Vol.02" - **FALSE POSITIVE**
  - This is a comic book, not a game
  - Direct inclusion match on "Cyberpunk 2077"

**Adult Content:**
- "VRConk - Alex Coal - Baldur's Gate III: Shadowheart - A Porn Parody" - **FALSE POSITIVE**
  - Matches on "Baldur's Gate III"

#### 2. False Negatives Detected

**Potential Misses:**
- "Grand_Theft_Auto_Chinatown_Wars_USA_PSP-NRP.iso"
  - Score: 33% (1/3 words matched)
  - Reason: "Chinatown" not in game name, "Wars" not matched
  - **VERDICT**: Actually correct - this is a different game (Chinatown Wars)

- "Grand_Theft_Auto_IV-Razor1911"
  - Score: 33% (1/3 words matched)
  - Reason: "IV" (4) doesn't match "V" (5)
  - **VERDICT**: Correct - this is GTA 4, not GTA 5

**Mac Software Falsely Flagged:**
- "rcmd • App Switcher 2.3.6" 
  - Matched because "witcher" substring found in "Switcher"
  - **VERDICT**: Correctly rejected (not a game)

#### 3. TV/Movie Filter Effectiveness

**Caught by Filter:**
- "Action.Button.Reviews.S01E06.Cyberpunk.2077.Complete.2160p" ✅
- "Rigid3D - Cyberpunk 2077 - V and Meredith Stout..." ✅

**Missed by Filter:**
- "The Witcher [2019] S02 1080p WEBRip" ❌
  - No SXXEXX pattern
  - No explicit "Season" or "Episode"
  - But clearly a TV show (year in brackets, S02)

#### 4. Update/DLC Filtering

**Correctly Filtered:**
- Various "Update v1.x" releases
- "Cyberpunk 2077-Chrome 01 [of 04]" (comic issue)
- "Elden Ring Update v1.12" 

## Issues Identified

### 1. TV Show Pattern Too Permissive
The TV show detection regex doesn't catch all TV formats:
```javascript
// Current patterns miss:
"Show Name [2019] S02 1080p..."  // Year in brackets + SXX
"Show Name (2020) Complete..."   // Year in parens
```

**Recommendation**: Add patterns for year-in-brackets followed by season indicators.

### 2. Comic/Book Content Not Filtered
Comics often have exact game name matches:
- "Dark Horse - Game Name - Vol.X"
- "Game Name - Chapter X"

**Recommendation**: Add publisher filters (Dark Horse, Yen Press, etc.) and volume/chapter patterns.

### 3. Adult Content Not Filtered
Adult parodies match on game names:
- "VRConk - ... - Game Name - A Porn Parody"

**Recommendation**: Add adult content keywords filter.

### 4. Bundle Names Too Long
Bundle names like "Assassin's Creed Bundle: Valhalla, Odyssey, Origins" rarely match because:
- Individual releases don't include all words
- Short name "Assassin's Creed" matches too broadly

**Recommendation**: Use only the base game name for matching, not bundle names.

## Recommendations

### Immediate Fixes

1. **Strengthen TV Detection:**
```javascript
const tvPatterns = [
  /\[20\d{2}\].*s\d{2}/i,      // [2019] S02
  /\(20\d{2}\).*season/i,      // (2020) Season
  /\[20\d{2}\].*complete/i,    // [2020] Complete
  // ... existing patterns
];
```

2. **Add Comic/Book Filter:**
```javascript
const bookPatterns = [
  /\bdark\s+horse\b/i,         // Dark Horse comics
  /\byen\s+press\b/i,          // Yen Press
  /\bpanini\b/i,               // Panini comics
  /\bvol\.?\s*\d+/i,           // Vol. X
  /\bchapter\s*\d+/i,          // Chapter X
  /\bissue\s*\d+/i,            // Issue X
];
```

3. **Add Adult Content Filter:**
```javascript
const adultPatterns = [
  /\bporn\b/i,
  /\bxxx\b/i,
  /\bparody\b/i,
  /\bvrconk\b/i,
  /\badult\b/i,
];
```

4. **Improve Game Name Cleaning:**
- Use short names for matching ("Baldur's Gate 3" not full bundle name)
- Remove bundle descriptors before matching

### Long-term Improvements

1. **Category Filtering**: Use Prowlarr category IDs to filter for PC Games (4050) only
2. **Trusted Uploaders**: Whitelist known game uploaders (FitGirl, DODI, ElAmigos, etc.)
3. **Size Filtering**: Filter by reasonable game sizes (exclude <100MB, >500GB)
4. **Seeders Threshold**: Require minimum seeders for auto-download

## Conclusion

The current matching algorithm correctly identifies games when:
- All words from the game name are present in the release title
- TV/Movie patterns don't trigger
- Update/trainer patterns don't trigger

**Main Issues:**
1. TV shows with "Show Name [Year] SXX" format bypass filter
2. Comic books match on game names
3. Adult parodies match on game names
4. Bundle names are too specific for matching

**Match Rate:** High (100+ matches per popular game), but with significant false positives from non-game content.

**Recommendation:** Implement the additional filters before using Prowlarr RSS auto-download in production.
