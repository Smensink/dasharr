const fs = require('fs');
const cheerio = require('cheerio');

const gameName = process.argv[2] || 'star_wars_jedi__survivor';
const htmlPath = `description-test-results/${gameName}_steam_full.html`;

const html = fs.readFileSync(htmlPath, 'utf8');
const $ = cheerio.load(html);

console.log(`=== Deep Steam Analysis: ${gameName} ===\n`);

// Check if content is hidden behind expand/collapse
const gameAreaDesc = $('#game_area_description');
console.log('game_area_description found:', gameAreaDesc.length > 0);

// Get the parent's parent to see the full structure
const parent = gameAreaDesc.parent();
console.log('Parent element:', parent.prop('tagName'), parent.attr('class'));

// Check for collapsed content
const hasClamp = html.includes('game_page_autocollapse');
const hasExpand = html.includes('expand_button') || html.includes('Read more');
console.log('Has autocollapse:', hasClamp);
console.log('Has expand button:', hasExpand);

// Look for data attributes that might contain full content
const dataAttrs = gameAreaDesc.attr();
console.log('\ngame_area_description attributes:');
Object.keys(dataAttrs).forEach(key => {
  console.log(`  ${key}: ${dataAttrs[key].substring ? dataAttrs[key].substring(0, 100) : dataAttrs[key]}`);
});

// Check for hidden content in the HTML
const descHtml = gameAreaDesc.html();
console.log('\nFirst 2000 chars of HTML:');
console.log(descHtml ? descHtml.substring(0, 2000) : 'No HTML');

// Look for additional content sections
console.log('\n--- Looking for additional content sections ---');
const sections = [
  'about_this_game',
  'game_area_description',
  'game_description_column',
  '.rightcol .block_content',
  '#earlyAccess',
  '.sys_req',
];

sections.forEach(sel => {
  const el = $(sel);
  if (el.length > 0) {
    console.log(`${sel}: ${el.text().trim().length} chars`);
  }
});

// Search for specific keywords that should be in full description
const keywords = ['Cere Junda', 'BD-1', 'combat', 'lightsaber', 'the galaxy', 'empire'];
console.log('\n--- Keyword search in full HTML ---');
keywords.forEach(kw => {
  const count = (html.match(new RegExp(kw, 'gi')) || []).length;
  if (count > 0) {
    console.log(`"${kw}": ${count} occurrences`);
  }
});

// Look for JSON data that might contain full description
console.log('\n--- Looking for JSON data ---');
const jsonMatch = html.match(/"detailed_description":\s*"([^"]+)"/);
if (jsonMatch) {
  console.log('Found detailed_description in JSON:', jsonMatch[1].length, 'chars');
  console.log('Preview:', jsonMatch[1].substring(0, 200));
} else {
  console.log('No detailed_description in JSON');
}

// Check for any script tags with game data
const scripts = $('script[type="text/javascript"]').toArray();
console.log(`\nScript tags found: ${scripts.length}`);
scripts.forEach((script, i) => {
  const text = $(script).html();
  if (text && text.includes('description') && text.length > 500) {
    console.log(`  Script ${i}: ${text.length} chars, contains 'description'`);
    // Look for description in script
    const descMatch = text.match(/description["']?\s*[:=]\s*["']([^"']{100,})/);
    if (descMatch) {
      console.log(`    Found description: ${descMatch[1].substring(0, 100)}...`);
    }
  }
});
