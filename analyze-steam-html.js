const fs = require('fs');
const cheerio = require('cheerio');

const gameName = process.argv[2] || 'star_wars_jedi__survivor';
const htmlPath = `description-test-results/${gameName}_steam_full.html`;

if (!fs.existsSync(htmlPath)) {
  console.log(`File not found: ${htmlPath}`);
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const $ = cheerio.load(html);

console.log(`=== Analyzing: ${gameName} ===\n`);

// Check for game_area_description
const gameAreaDesc = $('#game_area_description');
console.log(`game_area_description found: ${gameAreaDesc.length > 0}`);
console.log(`game_area_description length: ${gameAreaDesc.text().trim().length}`);

// Check for meta description
const metaDesc = $('meta[name="description"]').attr('content');
console.log(`\nMeta description length: ${metaDesc ? metaDesc.length : 0}`);

// Look for other potential description containers
const otherSelectors = [
  '.game_description_snippet',
  '.game_page_description',
  '[data-appid] .description',
  '.about_this_game',
  '#aboutThisGame'
];

console.log('\nOther selectors:');
for (const selector of otherSelectors) {
  const el = $(selector);
  if (el.length > 0) {
    console.log(`  ${selector}: ${el.text().trim().length} chars`);
  }
}

// Look at the game_area_description structure
console.log('\n--- game_area_description HTML structure ---');
const descHtml = gameAreaDesc.html();
if (descHtml) {
  console.log('First 1000 chars of HTML:');
  console.log(descHtml.substring(0, 1000));
  console.log('\n...');
  console.log(`Total HTML length: ${descHtml.length}`);
}

// Check for hidden content or collapsed sections
const hasReadMore = html.includes('Read more');
const hasCollapsed = html.includes('game_page_autocollapse');
console.log(`\nHas "Read more" button: ${hasReadMore}`);
console.log(`Has autocollapse: ${hasCollapsed}`);

// Save full text for analysis
const fullText = gameAreaDesc.text().trim();
if (fullText) {
  fs.writeFileSync(`description-test-results/${gameName}_steam_gad.txt`, fullText);
  console.log(`\nSaved full game_area_description text`);
}
