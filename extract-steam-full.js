const fs = require('fs');
const cheerio = require('cheerio');

const gameName = process.argv[2] || 'star_wars_jedi__survivor';
const htmlPath = `description-test-results/${gameName}_steam_full.html`;

const html = fs.readFileSync(htmlPath, 'utf8');
const $ = cheerio.load(html);

console.log(`=== Extracting full Steam description: ${gameName} ===\n`);

// The autocollapse div contains the full description
const autocollapse = $('.game_page_autocollapse');
console.log('Autocollapse divs found:', autocollapse.length);

autocollapse.each((i, el) => {
  const $el = $(el);
  console.log(`\n[${i}] classes: ${$el.attr('class')}`);
  console.log(`    style: ${$el.attr('style')}`);
  
  // Get all text content
  const text = $el.text().trim();
  console.log(`    text length: ${text.length}`);
  
  if (text.length > 100) {
    console.log(`\n    Preview (first 500 chars):`);
    console.log(text.substring(0, 500));
    
    // Save full text
    fs.writeFileSync(`description-test-results/${gameName}_steam_autocollapse.txt`, text);
    console.log(`\n    Saved to ${gameName}_steam_autocollapse.txt`);
  }
});

// Also try looking for the actual content div inside autocollapse
console.log('\n--- Looking for game_area_description inside autocollapse ---');
const gadInAuto = $('.game_page_autocollapse #game_area_description, .game_page_autocollapse .game_area_description');
console.log('Found:', gadInAuto.length);

if (gadInAuto.length > 0) {
  const parent = gadInAuto.first().parent();
  console.log('Parent HTML length:', parent.html().length);
  
  // Get all text from the autocollapse container
  const fullText = parent.text().trim();
  console.log('Full text length:', fullText.length);
  
  if (fullText.length > text.length) {
    fs.writeFileSync(`description-test-results/${gameName}_steam_full_text.txt`, fullText);
    console.log(`Saved full text (${fullText.length} chars)`);
  }
}

// Look for hidden content that gets expanded
console.log('\n--- Looking for hidden/expandable content ---');
const hiddenContent = html.match(/<div[^>]*class="[^"]*game_page_autocollapse[^"]*"[^>]*>([\s\S]*?)<\/div>/);
if (hiddenContent) {
  console.log('Found autocollapse div with', hiddenContent[1].length, 'chars of content');
}
