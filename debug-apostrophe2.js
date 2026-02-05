// Debug with the exact title from logs
const title = "Marvel's Spider-Man: Miles Morales – v1.1116.0.0 + DLC + Bonus OST";
const alt = "Marvels Spider-Man: Miles Morales";

function cleanGameName(name) {
  return name
    .toLowerCase()
    .replace(/[''']/g, '') // Remove apostrophes (curly and straight)
    .replace(/([a-z])-([a-z])/g, '$1$2') // spider-man -> spiderman
    .replace(/\s*[–—−-]\s*v?\d+\.\d+.*$/i, '') // Remove version/build suffixes
    .replace(/\s+\+\s+.*$/, '') // Remove " + DLC" etc
    .trim();
}

const cleanTitle = cleanGameName(title);
const cleanAlt = cleanGameName(alt);

console.log("Original title:", title);
console.log("Original alt:", alt);
console.log("Clean title:", cleanTitle);
console.log("Clean alt:", cleanAlt);
console.log("Equal?", cleanTitle === cleanAlt);

// Check character codes in title
console.log("\nCharacter codes in original title:");
for (let i = 0; i < title.length; i++) {
  const code = title.charCodeAt(i);
  if (code > 126) {
    console.log(`  ${i}: '${title[i]}' = ${code} (0x${code.toString(16)})`);
  }
}

console.log("\nCharacter codes in cleanTitle:");
for (let i = 0; i < cleanTitle.length; i++) {
  const code = cleanTitle.charCodeAt(i);
  if (code > 126) {
    console.log(`  ${i}: '${cleanTitle[i]}' = ${code} (0x${code.toString(16)})`);
  }
}

// Find the apostrophe position
console.log("\nPositions with potential apostrophes:");
for (let i = 0; i < title.length; i++) {
  const c = title[i];
  if (c === "'" || c === "'" || c === "`" || c === "´") {
    console.log(`  ${i}: '${c}' = ${title.charCodeAt(i)}`);
  }
}
