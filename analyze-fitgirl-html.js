const fs = require('fs');
const cheerio = require('cheerio');

const gameName = process.argv[2] || 'star_wars_jedi__survivor';
const htmlPath = `description-test-results/${gameName}_fitgirl_full.html`;

if (!fs.existsSync(htmlPath)) {
  console.log(`File not found: ${htmlPath}`);
  process.exit(1);
}

const html = fs.readFileSync(htmlPath, 'utf8');
const $ = cheerio.load(html);

console.log(`=== Analyzing FitGirl: ${gameName} ===\n`);

// Check various selectors
const selectors = [
  '.entry-content',
  '.entry-content p',
  '.entry-content h1, .entry-content h2, .entry-content h3',
  'article .entry-content',
  '.post-content',
  '.content-area .entry-content',
  // Look for description sections
  '.entry-content strong:contains("Genres")',
  '.entry-content strong:contains("Description")',
  '.entry-content strong:contains("About")',
  '.entry-content blockquote',
  '.entry-content div',
];

console.log('Content selectors:');
for (const selector of selectors) {
  try {
    const el = $(selector);
    if (el.length > 0) {
      const text = el.text().trim();
      console.log(`  ${selector}: ${el.length} elements, ${text.length} chars total`);
      if (text.length > 0 && text.length < 500) {
        console.log(`    Preview: ${text.substring(0, 150)}...`);
      }
    }
  } catch (e) {
    // jQuery-style selectors might fail
  }
}

// Look at the entry-content structure in detail
console.log('\n--- .entry-content structure ---');
const entryContent = $('.entry-content').first();
if (entryContent.length) {
  const children = entryContent.children();
  console.log(`Total children: ${children.length}`);
  
  children.each((i, el) => {
    const tag = el.tagName;
    const text = $(el).text().trim().substring(0, 100);
    console.log(`  [${i}] <${tag}>: ${text}${text.length >= 100 ? '...' : ''}`);
  });
}

// Look for the actual game description
console.log('\n--- Looking for game description ---');
const content = $('.entry-content').first();

// Try to find where the description starts
// Usually it's after the title/header and before "Genres/Tags" or download links
const allText = content.text();
console.log(`Total entry-content text length: ${allText.length}`);

// Find key markers
const genresIndex = allText.indexOf('Genres/Tags');
const companiesIndex = allText.indexOf('Companies');
const repackSizeIndex = allText.indexOf('Repack Size');
const downloadIndex = allText.indexOf('Download Mirrors');
const aboutIndex = allText.indexOf('About This Game');

console.log(`\nKey markers:`);
console.log(`  "Genres/Tags" at position: ${genresIndex}`);
console.log(`  "Companies" at position: ${companiesIndex}`);
console.log(`  "Repack Size" at position: ${repackSizeIndex}`);
console.log(`  "Download Mirrors" at position: ${downloadIndex}`);
console.log(`  "About This Game" at position: ${aboutIndex}`);

// Try to extract the description portion
let description = '';
if (aboutIndex > 0 && genresIndex > aboutIndex) {
  description = allText.substring(aboutIndex, genresIndex).trim();
  console.log(`\nExtracted "About This Game" to "Genres/Tags": ${description.length} chars`);
} else if (genresIndex > 0) {
  // Look for text before Genres/Tags
  const beforeGenres = allText.substring(0, genresIndex).trim();
  // Remove the title/header part
  const lines = beforeGenres.split('\n').filter(l => l.trim());
  if (lines.length > 2) {
    description = lines.slice(2).join('\n');
    console.log(`\nExtracted text after title (before Genres): ${description.length} chars`);
  }
}

if (description) {
  console.log(`\nPreview: ${description.substring(0, 300)}...`);
  
  // Save extracted description
  fs.writeFileSync(`description-test-results/${gameName}_fitgirl_manual_extract.txt`, description);
  console.log(`\nSaved manual extraction`);
}

// Check for images in content
const images = $('.entry-content img');
console.log(`\nImages in content: ${images.length}`);
images.each((i, img) => {
  const src = $(img).attr('src') || $(img).attr('data-src');
  if (src) {
    console.log(`  [${i}] ${src.substring(0, 80)}...`);
  }
});
