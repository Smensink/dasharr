/**
 * TitleNormalizer — Shared heuristic functions for game title matching.
 *
 * Used by both:
 *   - compile-training-labels.ts (offline labeling pipeline)
 *   - BaseGameSearchAgent.ts (live matching pipeline)
 *
 * Handles scene group stripping, edition normalization, sequel detection,
 * malware/update/DLC detection, and short-name safety checks.
 */

// ── Unicode normalization ────────────────────────────────────────────

/**
 * Normalize unicode characters to ASCII equivalents.
 * e.g., ö→o, é→e, ü→u, ñ→n
 */
export function normalizeUnicode(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// ── Name normalization ───────────────────────────────────────────────

/**
 * Normalize a game name for comparison.
 * Replaces ALL non-alphanumeric chars (including _ . [ ] etc.) with spaces.
 * Also normalizes unicode (ö→o, é→e, etc.)
 */
export function normalizeName(name: string): string {
  return normalizeUnicode(name)
    .toLowerCase()
    .replace(/&/g, ' and ')     // "&" → "and" before stripping
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// ── File extension stripping ─────────────────────────────────────────

/**
 * Strip common file extensions from a title.
 */
export function stripFileExtensions(title: string): string {
  return title.replace(/\.(zip|rar|7z|iso|exe|torrent|nzb|bin|dmg|msi|tar|gz|pkg|xz|bz2)$/gi, '').trim();
}

// ── Version string stripping ─────────────────────────────────────────

/**
 * Strip version strings from a title for comparison.
 * Matches patterns like: v1.0, v2.5.1, v1.0.0.1055, Build 12345, etc.
 */
export function stripVersionStrings(title: string): string {
  return title
    // Version strings with dots (must be before space-separated version)
    .replace(/\bv\d+(\.\d+)+\b/gi, '')           // v1.0, v2.0.119.430
    // Space-separated version numbers: "v1 2 0", "v1 0 1 4" (common in torrent titles)
    .replace(/\bv\d+(\s+\d+)+\b/gi, '')
    // Version with space after v: "v 1.08.2" → "v 1 08 2" (after dot-to-space normalization)
    .replace(/\bv\s+\d+(\s+\d+)+\b/gi, '')
    // Version dates with v-prefix and spaces: "v31 08 2017", "v20 04 2021"
    .replace(/\bv\d{1,2}\s+\d{2}\s+\d{2,4}\b/gi, '')
    .replace(/\bv\d+\b/gi, '')                     // v1, v2 (simple v-prefix)
    // Build strings with full version/date: "build 25.11.2020", "build 12345"
    .replace(/\bbuild\s*[\d]+[.\s][\d.]+\b/gi, '') // build 25.11.2020, build 1.2.3
    .replace(/\bbuild\s*\d+\b/gi, '')              // build 12345
    .replace(/\b\(\d{4,}\)\b/g, '')                // (4960)
    .replace(/\bupdate\s*\d+\b/gi, '')             // Update 5
    .replace(/\bpatch\s*\d+\b/gi, '')              // Patch 3
    // Date patterns (various formats)
    .replace(/\b\d{2}[\s./-]\d{2}[\s./-]\d{4}\b/g, '')   // 08 12 2021, 08/12/2021
    .replace(/\b\d{4}[\s./-]\d{2}[\s./-]\d{2}\b/g, '')   // 2025-12-30, 2025 12 30
    .replace(/\b\d{2}[\s./-]\d{4}\b/g, '')                // 08 2021, 11.2020 (orphan month-year)
    // Greek letter versions
    .replace(/\bgamma\d+\b/gi, '')                 // gamma21
    .replace(/\bbeta\d*\b/gi, '')                   // beta, beta3
    .replace(/\balpha\d*\b/gi, '')                  // alpha, alpha2
    // Release metadata with numbers
    .replace(/\b\d+\s*DLCs?\b/gi, '')              // 11 DLCs, 5 DLC
    .replace(/\b\d+\s*Bonuses?\b/gi, '')           // 4 Bonuses
    .replace(/\b\d+\s*Items?\b/gi, '')             // 12 Items
    .replace(/\bFrom\s+\d+[\s.]\d*\s*[KMGT]?B\b/gi, '')  // From 51 GB
    .replace(/\b\d+[\s.]\d*\s*[KMGT]B\b/gi, '')   // 51 GB, 2.7 GB (size info)
    .replace(/\bSuper\s+Fast\s+Install\b/gi, '')   // Super Fast Install (FitGirl)
    .replace(/\bAppid\s*\d+\b/gi, '')              // Appid 205100 (Steam app IDs)
    .trim();
}

// ── Edition suffix stripping ─────────────────────────────────────────

/**
 * Strip edition/release suffixes that don't change the base game identity.
 */
export function stripEditionSuffix(title: string): string {
  const editionPatterns = [
    /\b(the\s+)?(deluxe|ultimate|premium|gold|platinum|diamond)\s*(edition)?\b/gi,
    /\b(the\s+)?(game\s*of\s*the\s*year|goty)\s*(edition)?\b/gi,
    /\b(the\s+)?(complete|definitive|legendary|enhanced|remastered|remake|redux)\s*(edition|collection|version)?\b/gi,
    /\b(the\s+)?(full\s*clip|director'?s?\s*cut|special|collector'?s?)\s*(edition)?\b/gi,
    /\b(the\s+)?(standard|digital|anniversary|limited)\s*(edition)?\b/gi,
    /\b(classic|hd|classics)\b/gi,
    // Catch broader "X Edition" patterns: "Prepare to Die Edition", "Wii Edition", etc.
    /\b\w+(?:\s+(?:to|of|the|a|for)\s+\w+)*\s+edition\b/gi,
    // "The Final Cut" (Disco Elysium, Blade Runner, etc.)
    /\b(the\s+)?final\s+cut\b/gi,
    /\s*[-–—:]\s*(deluxe|ultimate|complete|definitive|enhanced|remastered|goty|special)\b.*/gi,
    /\s*\+\s*\d+\s*DLCs?.*/gi,                   // + 5 DLCs
    /\s*\+\s*Bonus\s+.*/gi,                       // + Bonus Soundtrack
    /\s*\+\s*All\s+DLCs?.*/gi,                    // + All DLCs
    /\s*[-–]\s*v\d+.*/gi,                         // – v1.35966
  ];

  let result = title;
  for (const pattern of editionPatterns) {
    result = result.replace(pattern, '');
  }
  return result.trim();
}

// ── Sequel info extraction ───────────────────────────────────────────

/**
 * Extract the base game name and any sequel number from a title.
 * Strips scene groups, platform codes, language codes, and release metadata.
 * Returns { baseName, sequelNumber } where sequelNumber is null if no sequel.
 */
export function extractSequelInfo(title: string): { baseName: string; sequelNumber: number | null } {
  // First strip file extensions, then normalize separators before version stripping
  // (underscores/dots prevent \b word boundaries from matching version patterns)
  let clean = stripFileExtensions(title);
  clean = clean.replace(/[_\.]/g, ' ');
  clean = stripVersionStrings(clean);
  clean = stripEditionSuffix(clean);

  // Normalize special characters to spaces before sequel detection
  clean = clean
    .replace(/[^a-zA-Z0-9\s]/g, ' ')
    .replace(/\bFitGirl\s*Repacks?\b/gi, '')
    .replace(/\bDODI\s*Repacks?\b/gi, '')
    .replace(/\bR\s*G\s*Mechanics\b/gi, '')
    .replace(/\brepack\b/gi, '')
    .replace(/\bx86|x64|64bit|32bit\b/gi, '')
    .replace(/\bmulti\s*\d*\b/gi, '')
    .replace(/\b(RUS|ENG|FRE|GER|SPA|ITA|POR|JPN|KOR|CHI|NL|CZ|PL|HUN|ROM|TUR|ARA|HEB|THA|VIE)\b/gi, '')
    // Region codes
    .replace(/\b(USA|EUR|JAP|PAL|NTSC|ASIA|JPN)\b/gi, '')
    // Platform codes
    .replace(/\b(WII|WIIU|PS2|PS3|PS4|PS5|PSP|PSV|PSVITA|VITA|XBOX|XBOX360|XONE|X360|XSX|NSW|NDS|N64|GBA|GBC|GCN|NGC|PSX|SNES|NES|PC|MAC|LINUX|ANDROID|IOS|3DS)\b/gi, '')
    .replace(/\bOST\b/gi, '')                    // Bonus OST
    .replace(/\bBonus\b/gi, '')                   // Bonus content
    .replace(/\bMULTi\b/gi, '')                   // MULTi language
    // Repacker/uploader credits: "by xatab", "by Igruha", "by Wanterlude", "by SE7EN"
    .replace(/\bby\s+\w+\b/gi, '')
    // Linux repackers and Wine/Proton compatibility layer metadata
    .replace(/\b(jc141|johncena141)\b/gi, '')
    .replace(/\bGNU\b/g, '')
    .replace(/\bWINE\b/gi, '')
    .replace(/\bPROTON\b/gi, '')
    // Steam/GOG AppID references
    .replace(/\bAppid\d*\b/gi, '')
    // "Native" (as in "GNU/Linux Native" ports)
    .replace(/\bNative\b/gi, '')
    // Build IDs: b13725329, b123456, etc.
    .replace(/\bb\d{5,}\b/gi, '')
    // Cross-posting tag
    .replace(/\bxpost\b/gi, '')
    // Common scene group names
    .replace(/\b(CODEX|PLAZA|SKIDROW|FLT|RELOADED|PROPHET|CPY|TENOKE|RUNE|DARKSiDERS|RAZOR1911|GOG|HOODLUM|CONSPIRACY|SUSHi|iMARS|DUPLEX|VENOM|SUXXORS|GENESIS|ABSTRAKT|HI2U|SiMPLEX|DOGE|BAT|KaOs|EMPRESS|ElAmigos|THETA|ACTIVATED|iCON|ACCiDENT|GANT|LaKiTu|BlaZe|ALiAS|TiNYiSO|DODI|xatab|BlackBox|Catalyst|Decepticon|MAXAGENT|Audioslave|WaLMaRT|SPARE|PARADISO|UNLiMiTED|APATHY|COMPLEX|RESPAWN|PRELUDE|SiMON|FLTDOX|RazorDOX|DINOByTES|QOOB|P2P|Lz0PDA|LiGHTFORCE|SharpHD|RABO|AnCiENT|PLAYME|AUCTOR|DEViANCE|FiGHTCLUB|LZ0|nosTEAM|VOKSI|3DM|3DMGAME)\b/gi, '')
    // Scene release notes and metadata
    .replace(/\bREAD\s*NFO\b/gi, '')
    .replace(/\bWORKING\b/gi, '')
    .replace(/\bPROPER\b/gi, '')
    .replace(/\biNTERNAL\b/gi, '')
    // Strip orphan number sequences (leftover from version stripping): "3 1 6298 19580 0"
    // Only strip sequences of 3+ standalone numbers in a row (not sequel numbers)
    .replace(/(?<=\s|^)(\d+\s+){2,}\d+(?=\s|$)/g, '')
    // Disc/CD count (e.g., "2 CD", "4 Disc") — not sequel numbers
    .replace(/\b\d+\s*CDs?\b/gi, '')
    .replace(/\b\d+\s*Discs?\b/gi, '')
    // Strip large standalone numbers (>20) that are clearly not sequel numbers
    .replace(/\b\d{3,}\b/g, '')                   // 3+ digit numbers (build IDs, etc.)
    .replace(/\s+/g, ' ')
    .trim();

  // Check for Roman numeral sequels (II, III, IV, V, VI, VII, VIII, IX, X)
  const romanMap: Record<string, number> = {
    'II': 2, 'III': 3, 'IV': 4, 'V': 5, 'VI': 6,
    'VII': 7, 'VIII': 8, 'IX': 9, 'X': 10, 'XI': 11, 'XII': 12,
  };

  // Match "Game Name III", "Game Name III: Subtitle", "Game Name III Something Else"
  const romanMatch = clean.match(/^(.+?)\s+(I{2,3}|IV|VI{0,3}|IX|X{1,2}I{0,3})(?:[\s:–-].*)?$/i);
  if (romanMatch) {
    const roman = romanMatch[2].toUpperCase();
    if (romanMap[roman]) {
      return { baseName: romanMatch[1].trim(), sequelNumber: romanMap[roman] };
    }
  }

  // Match "Game Name 2", "Game Name 3: Subtitle", "Game Name 2 Black Edition"
  const arabicMatch = clean.match(/^(.+?)\s+(\d{1,2})(?:[\s:–-].*)?$/);
  if (arabicMatch) {
    const num = parseInt(arabicMatch[2], 10);
    if (num >= 2 && num <= 20) {
      return { baseName: arabicMatch[1].trim(), sequelNumber: num };
    }
  }

  return { baseName: clean, sequelNumber: null };
}

// ── Content type detection ───────────────────────────────────────────

/**
 * Detect non-game content (soundtracks, trailers, tools, etc.)
 */
export function isNonGameContent(title: string): boolean {
  const lower = title.toLowerCase();
  // Soundtracks / music (but not "Bonus OST" which is a side item in game repacks)
  if (/\b(flac|soundtrack|original\s+sound|music\s+disc)\b/i.test(lower)) return true;
  if (/\bost\b/i.test(lower) && !/\bbonus\s+ost\b/i.test(lower)) return true;
  // Trailers
  if (/\btrailer\s*\d*\b/i.test(lower)) return true;
  // Trainers (cheat tools)
  if (/\btrainer\b/i.test(lower) && /\bplus\s*\d+\b/i.test(lower)) return true;
  // Artbooks, strategy guides
  if (/\b(artbook|art\s*book|strategy\s*guide|prima\s*guide)\b/i.test(lower)) return true;
  return false;
}

/**
 * Detect update/patch-only releases that are not full games.
 * Scene releases like "Game.Update.v1.2-CODEX" are patches, not full games.
 * But repacks like "Game [Update 4 + DLC] [Repack]" are full games with updates bundled.
 */
export function isUpdateOnlyRelease(title: string): boolean {
  // Normalize separators: underscores/dots → spaces (so "Update_v4.04a" becomes "Update v4 04a")
  const normalized = title.replace(/[_\.]/g, ' ');
  // Strip bracketed content — repacks often mention updates in brackets
  const stripped = normalized.replace(/\[.*?\]/g, '').replace(/\(.*?\)/g, '');
  // "Update" followed by a version/number pattern
  const hasUpdateNumber = /\bUpdate[\s]*v?\d/i.test(stripped);
  // "Updates" (plural) as standalone word → "Game.Updates-SceneGroup" is update-only
  const hasUpdatesPlural = /\bUpdates\b/i.test(stripped);
  if (!hasUpdateNumber && !hasUpdatesPlural) return false;
  // Full-game indicators: repack, includes, ElAmigos, "with update", "including update", Steam Rip
  if (/\b(repack|inc\b|incl|includes?|elamigos)\b/i.test(normalized)) return false;
  if (/\bwith[\s]+update\b/i.test(normalized)) return false;
  if (/\bincluding[\s]+update\b/i.test(normalized)) return false;
  if (/\bSteam\s*Rip\b/i.test(normalized)) return false;
  return true;
}

/**
 * Detect DLC-only releases (not the base game).
 * e.g., "Far Cry 4 Escape From Durgesh Prison Dlc Proper-RELOADED"
 */
export function isDlcOnlyRelease(gameName: string, candidateTitle: string): boolean {
  // Must contain standalone "DLC" or "Dlc" (not "DLCs" which implies bundle with base game)
  if (!/\bDlc\b/i.test(candidateTitle)) return false;
  if (/\bDLCs\b/i.test(candidateTitle)) return false;
  // If title also mentions inclusion of DLC alongside base game, it's not DLC-only
  if (/\b(complete|incl|includes?|with|plus|all)\b/i.test(candidateTitle)) return false;
  if (/\+/.test(candidateTitle)) return false;
  // The DLC word should appear after the game name, suggesting it qualifies specific content
  const gameNorm = normalizeName(gameName);
  const candidateNorm = normalizeName(candidateTitle);
  if (candidateNorm.startsWith(gameNorm)) {
    const after = candidateNorm.slice(gameNorm.length);
    if (/\bdlc\b/.test(after)) return true;
  }
  return false;
}

// ── Malware detection ────────────────────────────────────────────────

/**
 * Detect exe.rar malware pattern.
 */
export function isMalwarePattern(candidateTitle: string, sizeBytes: number): boolean {
  const lower = candidateTitle.toLowerCase();
  // exe.rar files between 10MB and 100MB are almost always fake
  if ((lower.includes('.exe.rar') || lower.includes('.exe.zip')) && sizeBytes > 0 && sizeBytes < 100_000_000) {
    return true;
  }
  // Very tiny files (< 10MB) matched as full games are suspicious
  if (sizeBytes > 0 && sizeBytes < 10_000_000) {
    return true;
  }
  return false;
}

// ── Game variant detection ───────────────────────────────────────────

/**
 * Check if a candidate title is a version/edition variant of the game (same game).
 * IMPORTANT: This must reject cases where sequel numbers differ.
 */
export function isSameGameVariant(gameName: string, candidateTitle: string): boolean {
  const gameInfo = extractSequelInfo(gameName);
  const candidateInfo = extractSequelInfo(candidateTitle);

  const gameBase = normalizeName(gameInfo.baseName);
  const candidateBase = normalizeName(candidateInfo.baseName);

  // Exact base name match → check sequel numbers
  if (gameBase === candidateBase) {
    if (gameInfo.sequelNumber === candidateInfo.sequelNumber) return true;
    return false;
  }

  // Prefix match via extractSequelInfo bases — apply same remainder checks as below
  if (candidateBase.startsWith(gameBase + ' ') || gameBase.startsWith(candidateBase + ' ')) {
    // Sequel numbers must agree
    if (gameInfo.sequelNumber !== candidateInfo.sequelNumber) return false;

    // Check the longer name's extra words don't indicate a different game
    const longer = candidateBase.length > gameBase.length ? candidateBase : gameBase;
    const shorter = candidateBase.length > gameBase.length ? gameBase : candidateBase;
    const extraWords = longer.slice(shorter.length).trim();

    // Reject if extra words start with a sequel indicator
    if (/^\d{1,2}\b/.test(extraWords)) return false;
    if (/^(ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)\b/i.test(extraWords)) return false;

    // Short game names: extra words must look like metadata, not a game subtitle
    const shortWordCount = shorter.split(' ').length;
    if (shortWordCount <= 3) {
      const meaningfulExtra = extraWords.split(' ').filter(w => w.length > 1);
      if (/^(of|the|and|in|on|at|to|for|from|with|by|a|an)\b/i.test(extraWords)) return false;
      // Shorter game names need fewer extra words to indicate a different game
      const maxExtra = shortWordCount === 1 ? 1 : shortWordCount === 2 ? 2 : 3;
      if (meaningfulExtra.length >= maxExtra) return false;
    }
    return true;
  }

  // Check if game name appears in candidate after stripping editions + versions
  const strippedCandidate = normalizeName(stripEditionSuffix(stripVersionStrings(candidateTitle)));
  const strippedGame = normalizeName(stripEditionSuffix(stripVersionStrings(gameName)));

  if (strippedCandidate === strippedGame) return true;

  // Only allow "startsWith" if the candidate doesn't introduce a new sequel number
  if (strippedCandidate.startsWith(strippedGame + ' ')) {
    const remainder = strippedCandidate.slice(strippedGame.length).trim();
    // Reject if remainder starts with a sequel number
    if (/^\d{1,2}\b/.test(remainder)) return false;
    if (/^(ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)\b/i.test(remainder)) return false;

    // For short game names (<=3 words), require the remainder to look like
    // release metadata rather than additional game-name words.
    const gameWordCount = strippedGame.split(' ').length;
    if (gameWordCount <= 3) {
      const remainderWords = remainder.split(' ').filter(w => w.length > 1);
      if (/^(of|the|and|in|on|at|to|for|from|with|by|a|an)\b/i.test(remainder)) return false;
      const maxExtra = gameWordCount === 1 ? 1 : gameWordCount === 2 ? 2 : 3;
      if (remainderWords.length >= maxExtra) return false;
    }
    return true;
  }

  return false;
}

/**
 * Check if the candidate is a different sequel than the game.
 * Only returns true when we're confident the base franchise matches but the
 * sequel number is genuinely different.
 */
export function isDifferentSequel(gameName: string, candidateTitle: string): boolean {
  const gameInfo = extractSequelInfo(gameName);
  const candidateInfo = extractSequelInfo(candidateTitle);

  const gameBase = normalizeName(gameInfo.baseName);
  const candidateBase = normalizeName(candidateInfo.baseName);

  // Safety net: if the game HAS a sequel number, and the full game name
  // (with sequel) appears verbatim at the start of the candidate, it's the same game.
  if (gameInfo.sequelNumber !== null) {
    const simpleGame = normalizeName(stripFileExtensions(gameName));
    const simpleCandidate = normalizeName(stripFileExtensions(candidateTitle));
    if (simpleCandidate === simpleGame || simpleCandidate.startsWith(simpleGame + ' ')) {
      return false;
    }
  }

  // Need base names to match for this to be a sequel comparison
  const basesMatch = gameBase === candidateBase
    || candidateBase.startsWith(gameBase + ' ')
    || gameBase.startsWith(candidateBase + ' ');
  if (!basesMatch) return false;

  // Both have the SAME sequel number → same game, not a different sequel
  if (gameInfo.sequelNumber === candidateInfo.sequelNumber) return false;

  // Both have sequel numbers but they differ → different sequel
  if (gameInfo.sequelNumber !== null && candidateInfo.sequelNumber !== null) {
    return true;
  }

  // One has a sequel number and the other doesn't → different entry
  if (gameInfo.sequelNumber !== null || candidateInfo.sequelNumber !== null) {
    return true;
  }

  return false;
}

// ── Short name safety ────────────────────────────────────────────────

/**
 * Check if an "all game words present in title" match is safe, i.e. not a false
 * positive caused by short game names whose words happen to appear in an unrelated title.
 * e.g., "Dead Space" → "Dead Space Extraction" (false positive)
 *       "Fallout New Vegas" → "Fallout New Vegas Ultimate Edition" (safe — 3 words)
 */
export function allWordsPresentIsSafe(gameName: string, candidateTitle: string): boolean {
  const gameWords = gameName.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2);
  const gameWordCount = gameWords.length;

  // Games with 3+ significant words are distinctive enough
  if (gameWordCount >= 3) return true;

  // For short names (1-2 significant words), check what's left in the candidate
  // after accounting for the game words — use extractSequelInfo to strip scene groups/platforms
  const candidateNorm = normalizeName(extractSequelInfo(candidateTitle).baseName);
  const gameNorm = normalizeName(stripEditionSuffix(stripVersionStrings(gameName)));

  // For 1-word game names: require the game word to be the first word in the candidate
  if (gameWordCount === 1) {
    const firstWord = candidateNorm.split(' ')[0];
    if (firstWord !== gameNorm) return false;
  }

  // If normalized candidate starts with normalized game name, check remainder
  if (candidateNorm.startsWith(gameNorm + ' ')) {
    const remainder = candidateNorm.slice(gameNorm.length).trim();
    // Remainder starts with a preposition/article → likely different game subtitle
    if (/^(of|the|and|in|on|at|to|for|from|with|by|a|an)\b/i.test(remainder)) return false;
    // Remainder has sequel number → isDifferentSequel should catch this, but safety net
    if (/^\d{1,2}\b/.test(remainder)) return false;
    if (/^(ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)\b/i.test(remainder)) return false;
    // Shorter game names need fewer extra words to indicate a different game
    const meaningfulWords = remainder.split(' ').filter(w => w.length > 1);
    const maxExtra = gameWordCount <= 2 ? 1 : 3;
    if (meaningfulWords.length >= maxExtra) return false;
  }

  return true;
}

// ── Scene release detection ──────────────────────────────────────────

/** List of known scene group names (case-insensitive matching). */
const SCENE_GROUPS = new Set([
  'codex', 'plaza', 'skidrow', 'flt', 'reloaded', 'prophet', 'cpy', 'tenoke',
  'rune', 'darksiders', 'razor1911', 'gog', 'hoodlum', 'conspiracy', 'sushi',
  'imars', 'duplex', 'venom', 'suxxors', 'genesis', 'abstrakt', 'hi2u',
  'simplex', 'doge', 'bat', 'kaos', 'empress', 'elamigos', 'theta',
  'activated', 'icon', 'accident', 'gant', 'lakitu', 'blaze', 'alias',
  'tinyiso', 'dodi', 'xatab', 'blackbox', 'catalyst', 'decepticon',
  'maxagent', 'audioslave', 'walmart', 'spare', 'paradiso', 'unlimited',
  'apathy', 'complex', 'respawn', 'prelude', 'simon', 'fltdox', 'razordox',
  'dinobytes', 'qoob', 'p2p', 'lz0pda', 'lightforce', 'sharphd', 'rabo',
  'ancient', 'playme', 'auctor', 'deviance', 'fightclub', 'lz0', 'nosteam',
  'voksi', '3dm', '3dmgame',
]);

/** Repack group names (case-insensitive matching). */
const REPACK_GROUPS = new Set([
  'fitgirl', 'dodi', 'xatab', 'blackbox', 'kaos', 'elamigos',
]);

/**
 * Detect if a title is a scene release (has a known scene group tag).
 */
export function isSceneRelease(title: string): boolean {
  // Check for "Title-SCENEGROUP" pattern
  const dashMatch = title.match(/-([A-Za-z0-9]+)$/);
  if (dashMatch && SCENE_GROUPS.has(dashMatch[1].toLowerCase())) {
    return true;
  }
  // Also check for scene group names embedded in the title
  const words = title.replace(/[^a-zA-Z0-9\s]/g, ' ').split(/\s+/);
  return words.some(w => SCENE_GROUPS.has(w.toLowerCase()));
}

/**
 * Detect if a title is a repack (has a known repack group name).
 */
export function isRepack(title: string): boolean {
  const lower = title.toLowerCase();
  if (/\brepack\b/.test(lower)) return true;
  const words = lower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/);
  return words.some(w => REPACK_GROUPS.has(w));
}
