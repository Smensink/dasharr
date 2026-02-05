const fs = require('fs');
const cheerio = require('cheerio');

const games = [
  'star_wars_jedi__survivor',
  'god_of_war_ragnar_k',
  'spider_man_remastered',
  'marvel_s_spider_man__miles_morales'
];

function extractGameDescription(htmlPath) {
  if (!fs.existsSync(htmlPath)) {
    return null;
  }
  
  const html = fs.readFileSync(htmlPath, 'utf8');
  const $ = cheerio.load(html);
  
  // Find divs containing 'Game Description' - take the one with the most content
  const divs = $('.entry-content div');
  let bestDesc = '';
  
  divs.each((i, el) => {
    const text = $(el).text().trim();
    if (text.includes('Game Description') && text.length > bestDesc.length) {
      bestDesc = text;
    }
  });
  
  // Remove "Game Description" header
  return bestDesc.replace(/^Game Description\s*/i, '').trim();
}

console.log('=== Extracting Game Descriptions from FitGirl ===\n');

for (const game of games) {
  const htmlPath = `description-test-results/${game}_fitgirl_full.html`;
  const desc = extractGameDescription(htmlPath);
  
  console.log(`\n--- ${game.replace(/_/g, ' ')} ---`);
  
  if (desc) {
    console.log(`Length: ${desc.length} chars`);
    console.log(`Preview: ${desc.substring(0, 200)}...`);
    
    fs.writeFileSync(`description-test-results/${game}_fitgirl_game_desc.txt`, desc);
  } else {
    console.log('❌ No game description found');
  }
}
