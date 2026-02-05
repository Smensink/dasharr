const fs = require('fs');

const games = [
  'star_wars_jedi__survivor',
  'marvel_s_spider_man__miles_morales',
  'god_of_war_ragnar_k',
  'spider_man_remastered'
];

function readFile(path) {
  try {
    return fs.readFileSync(path, 'utf8');
  } catch (e) {
    return null;
  }
}

function cleanText(text) {
  return text
    .toLowerCase()
    .replace(/<[^>]+>/g, ' ')  // Remove HTML
    .replace(/[^\w\s]/g, ' ')   // Remove punctuation
    .replace(/\s+/g, ' ')        // Normalize whitespace
    .trim();
}

function calculateSimilarity(text1, text2) {
  const words1 = new Set(cleanText(text1).split(' ').filter(w => w.length > 3));
  const words2 = new Set(cleanText(text2).split(' ').filter(w => w.length > 3));
  
  const intersection = new Set([...words1].filter(x => words2.has(x)));
  const union = new Set([...words1, ...words2]);
  
  return {
    jaccard: intersection.size / union.size,
    commonWords: intersection.size,
    totalWords: union.size,
    text1Words: words1.size,
    text2Words: words2.size
  };
}

console.log('=== Description Comparison (Steam API vs FitGirl) ===\n');

for (const game of games) {
  console.log(`\n--- ${game.replace(/_/g, ' ')} ---`);
  
  const steam = readFile(`description-test-results/${game}_steam_api_plain.txt`);
  const fitgirl = readFile(`description-test-results/${game}_fitgirl_game_desc.txt`) || 
                  readFile(`description-test-results/${game}_fitgirl_extracted.txt`);
  
  if (!steam) {
    console.log('❌ Steam description not found');
    continue;
  }
  if (!fitgirl) {
    console.log('❌ FitGirl description not found');
    continue;
  }
  
  console.log(`Steam API: ${steam.length} chars`);
  console.log(`FitGirl:   ${fitgirl.length} chars`);
  
  const similarity = calculateSimilarity(steam, fitgirl);
  console.log(`\nSimilarity: ${(similarity.jaccard * 100).toFixed(1)}%`);
  console.log(`Common words: ${similarity.commonWords} / ${similarity.totalWords}`);
  
  // Show preview of both
  console.log('\nSteam preview:');
  console.log(steam.substring(0, 200) + '...');
  console.log('\nFitGirl preview:');
  console.log(fitgirl.substring(0, 200) + '...');
}
