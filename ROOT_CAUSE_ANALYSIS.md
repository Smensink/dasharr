# Root Cause Analysis: Game Matching Failures

## The Real Problem ✅

You proved the FitGirl and Steam descriptions are **IDENTICAL**. But our system shows only **11.7% similarity**.

### Evidence
**You showed:**
- Steam "About This Game": Full text (2000+ chars) starting with "THE NORSE SAGA CONTINUES..."
- FitGirl description: Same full text (2000+ chars)
- **Expected similarity: >90%**

**Our logs show:**
- Steam description: 93 chars - "Kratos and Atreus embark on a mythic journey for answers before Ragnarök arrives – now on PC...."
- FitGirl description: 552 chars - "The sequel to the critically acclaimed God of War (2018)..."
- **Actual similarity: 11.7%**

## Root Cause Identified ✅

**Steam description extraction is BROKEN!**

###  What's Happening
The `fetchSteamDescription` function in `steam.ts` is extracting:
1. Only 93 characters (short tagline)
2. NOT the full "About This Game" section

### Why It's Happening
Steam's HTML structure likely changed or our selectors are wrong:
```typescript
$('#game_area_description').text()  // Should get full description
$('.game_description_snippet').text()  // Getting this instead (93 chars)
$('meta[property="og:description"]')  // Fallback meta tag
```

**Current behavior:**
- `game_area_description` either returns empty or short text
- Falls back to snippet/meta which is only 93 chars
- This doesn't match FitGirl's full description

## Cascading Effects

### 1. Description Matching Fails
- Steam: 93 chars
- FitGirl: 552 chars
- Similarity: 11.7% (should be >90%)
- Score bonus: +5 (minor overlap) instead of +40 (strong match)

### 2. Name Matching Issues
**God of War Ragnarok** scoring breakdown:
- "Ragnarok" vs "Ragnarök" (ö) - special char mismatch
- "Digital Deluxe Edition + All DLCs" - extra words penalty
- Total: ~8 points from name, +5 from description = **13 total**
- Threshold: 70
- **Result: FAIL** ❌

### 3. Five Games Missing
All have the same issue:
1. God of War Ragnarok
2. The Last of Us Part I
3. Uncharted Legacy of Thieves Collection
4. Spider-Man Miles Morales
5. Star Wars Jedi Survivor

## The Fix

### Priority 1: Fix Steam Description Extraction ⚠️

**Problem**: Not getting full "About This Game" section

**Solutions to try:**
1. Check if Steam changed their HTML structure
2. Try different selectors (div.game_description, etc.)
3. Look for the section that contains the full multi-paragraph description
4. May need to scrape from a different element or API

**Test command:**
```bash
curl -H "User-Agent: Mozilla/5.0" "https://store.steampowered.com/app/2322010" | grep -i "about this game" -A 50
```

### Priority 2: Fix Special Character Normalization

**Problem**: "Ragnarok" ≠ "Ragnarök"

**Current approach** (not working):
```typescript
.replace(/[öøōŏő]/g, 'o')  // Applied in cleanGameName()
```

**Issue**: May not be applied consistently across all matching paths

### Priority 3: Reduce Extra Words Penalty

**Current**: -10 for "many extra words" like "Digital Deluxe Edition"
**Proposed**: -5 or exempt common repack terms

## Expected Results After Fix

### With correct Steam description (2000+ chars):
```
God of War Ragnarok vs "God of War: Ragnarök - Digital Deluxe Edition..."

Name matching:
  + exact phrase (with normalization): +35
  + title contains game name: +25
  + very high word match: +20
  + all keywords present: +15
  - many extra words: -5
  = 90 points from name

Description matching:
  + strong Steam match (>90% similarity): +40
  = 40 points from description

Platform info: +5

TOTAL: ~135 → capped at 100 ✅
```

### Current (broken):
```
Name: ~13 points
Description: +5 (11.7% similarity)
Total: ~18 points
Threshold: 70
Result: FAIL ❌
```

## Action Items

1. **Investigate Steam HTML** - Check what selectors work for new Steam pages
2. **Test extraction** - Verify we can get full 2000+ char descriptions
3. **Fix normalization** - Ensure ö→o works in ALL code paths
4. **Re-run tests** - Should get 16/16 matches on FitGirl games

## Success Criteria

After fixes:
- ✅ Steam extraction: 2000+ chars (not 93)
- ✅ Description similarity: >90% (not 11.7%)
- ✅ God of War Ragnarok: Score 100 (not 13)
- ✅ All 5 missing games: Found and matched
- ✅ Test suite: 16/16 on FitGirl (not 11/16)
