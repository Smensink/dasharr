// Debug apostrophe handling
const title = "Marvel's Spider-Man: Miles Morales";
const alt = "Marvels Spider-Man: Miles Morales";

function cleanGameName(name) {
  return name
    .toLowerCase()
    .replace(/[''']/g, '') // Remove apostrophes (curly and straight)
    .replace(/([a-z])-([a-z])/g, '$1$2') // spider-man -> spiderman
    .trim();
}

const cleanTitle = cleanGameName(title);
const cleanAlt = cleanGameName(alt);

console.log("Original title:", title);
console.log("Original alt:", alt);
console.log("Clean title:", cleanTitle);
console.log("Clean alt:", cleanAlt);
console.log("Equal?", cleanTitle === cleanAlt);

// Check character codes
console.log("\nCharacter codes in title:");
for (let i = 0; i < title.length; i++) {
  const code = title.charCodeAt(i);
  if (code > 127 || title[i] === "'") {
    console.log(`  ${i}: '${title[i]}' = ${code} (0x${code.toString(16)})`);
  }
}

// Check what's in the cleanTitle
console.log("\nCharacter codes in cleanTitle:");
for (let i = 0; i < cleanTitle.length; i++) {
  const code = cleanTitle.charCodeAt(i);
  if (code > 127 || cleanTitle[i] === "'") {
    console.log(`  ${i}: '${cleanTitle[i]}' = ${code} (0x${code.toString(16)})`);
  }
}

// Try a more comprehensive replacement
const comprehensive = name => name
  .toLowerCase()
  .replace(/[\u2018\u2019\u0027\u0060]/g, '') // Various apostrophe types
  .replace(/([a-z])-([a-z])/g, '$1$2')
  .trim();

console.log("\nWith comprehensive cleaning:");
console.log("Clean title:", comprehensive(title));
console.log("Clean alt:", comprehensive(alt));
console.log("Equal?", comprehensive(title) === comprehensive(alt));
