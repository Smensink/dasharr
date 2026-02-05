// Debug with potential Unicode apostrophes
const tests = [
  "Marvel's Spider-Man: Miles Morales",  // ASCII 39
  "Marvel's Spider-Man: Miles Morales",  // U+2019 right single quote
  "Marvel's Spider-Man: Miles Morales",  // U+2018 left single quote
  "Marvel`s Spider-Man: Miles Morales",  // backtick
];

function cleanGameName(name) {
  return name
    .toLowerCase()
    .replace(/[''']/g, '') // Remove apostrophes (curly and straight)
    .replace(/([a-z])-([a-z])/g, '$1$2')
    .trim();
}

console.log("Testing different apostrophe types:\n");

tests.forEach((title, i) => {
  const clean = cleanGameName(title);
  console.log(`Test ${i}: "${title}"`);
  console.log(`  Clean: "${clean}"`);
  console.log(`  Contains apostrophe-like?`, /[\u0027\u2018\u2019\u0060]/.test(clean));
  
  // Show char codes around position 6
  console.log(`  Char codes at 5-7: [${title.charCodeAt(5)}, ${title.charCodeAt(6)}, ${title.charCodeAt(7)}]`);
  console.log();
});

// The exact string from the logs
const logTitle = "Marvel's Spider-Man: Miles Morales";
console.log("Log title analysis:");
for (let i = 0; i < logTitle.length; i++) {
  console.log(`  ${i}: '${logTitle[i]}' = ${logTitle.charCodeAt(i)}`);
}
