import * as cheerio from 'cheerio';
import * as fs from 'fs';

const html = fs.readFileSync('../../steam_page.html', 'utf-8');
console.log('HTML file size:', html.length);

const $ = cheerio.load(html);
const el = $('#game_area_description');
console.log('Elements found:', el.length);

if (el.length > 0) {
  const htmlContent = el.html() || '';
  const textContent = el.text() || '';
  console.log('HTML content length:', htmlContent.length);
  console.log('Text content length:', textContent.length);
  console.log('\n=== Text preview (first 500 chars) ===');
  console.log(textContent.substring(0, 500));
  
  // Check if there's nested content
  console.log('\n=== Child elements ===');
  console.log('Direct children count:', el.children().length);
  
  // Check for h2
  const h2 = el.find('h2');
  console.log('H2 elements:', h2.length);
  h2.each((i, elem) => {
    console.log(`  H2 #${i}:`, $(elem).text());
  });
}

// Also try class selector
const classEl = $('.game_area_description');
console.log('\n=== Class selector ===');
console.log('Elements with class game_area_description:', classEl.length);
classEl.each((i, elem) => {
  const text = $(elem).text().trim();
  if (text.length > 100) {
    console.log(`  Element #${i}: ${text.length} chars`);
    if (i === 0) {
      console.log('  Preview:', text.substring(0, 200));
    }
  }
});
