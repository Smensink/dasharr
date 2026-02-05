// Test the exact scenario from logs
function cleanGameName(name) {
  return name
    .toLowerCase()
    .replace(/[''']/g, '') // Remove apostrophes (curly and straight)
    .replace(/([a-z])-([a-z])/g, '$1$2') // spider-man -> spiderman
    .replace(/\s*[–—−-]\s*v?\d+\.\d+.*$/i, '') // Remove version/build suffixes
    .replace(/\s+\+\s+.*$/, '') // Remove " + DLC" etc
    .trim();
}

// Simulate what the title looks like
const title = "Marvel's Spider-Man: Miles Morales – v1.1116.0.0 + DLC + Bonus OST";
const cleanTitle = cleanGameName(title);

console.log("Title:", title);
console.log("Clean:", cleanTitle);
console.log("Length:", cleanTitle.length);

// Check each character
console.log("\nCharacter by character:");
for (let i = 0; i < cleanTitle.length; i++) {
  const c = cleanTitle[i];
  const code = c.charCodeAt(0);
  if (code > 126 || c === "'") {
    console.log(`  ${i}: '${c}' = ${code} (0x${code.toString(16)})`);
  }
}

// Alternative name
const alt = "Marvels Spider-Man: Miles Morales";
const cleanAlt = cleanGameName(alt);
console.log("\nAlt clean:", cleanAlt);
console.log("Equal?", cleanTitle === cleanAlt);

// Check byte by byte comparison
console.log("\nByte comparison:");
for (let i = 0; i < Math.min(cleanTitle.length, cleanAlt.length); i++) {
  if (cleanTitle[i] !== cleanAlt[i]) {
    console.log(`  Diff at ${i}: title[${i}]='${cleanTitle[i]}'(${cleanTitle.charCodeAt(i)}) vs alt[${i}]='${cleanAlt[i]}'(${cleanAlt.charCodeAt(i)})`);
  }
}
