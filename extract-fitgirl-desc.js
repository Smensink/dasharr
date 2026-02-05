const fs = require('fs');
const cheerio = require('cheerio');

const gameName = process.argv[2] || 'star_wars_jedi__survivor';
const htmlPath = `description-test-results/${gameName}_fitgirl_full.html`;

const html = fs.readFileSync(htmlPath, 'utf8');
const $ = cheerio.load(html);

// Find the div containing 'Game Description'
const divs = $('.entry-content div');
divs.each((i, el) => {
  const text = $(el).text().trim();
  if (text.includes('Game Description')) {
    console.log(`=== ${gameName} ===`);
    console.log('Found Game Description div!');
    console.log('Length:', text.length);
    console.log('\nContent:');
    console.log(text);
    
    // Save it
    fs.writeFileSync(`description-test-results/${gameName}_fitgirl_game_desc.txt`, text);
    console.log(`\nSaved to ${gameName}_fitgirl_game_desc.txt`);
  }
});
