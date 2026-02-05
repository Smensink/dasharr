import axios from 'axios';
import * as cheerio from 'cheerio';

async function testSteamFetch() {
  const appId = 2322010; // God of War Ragnarok
  console.log(`[Steam] Fetching description for app ${appId}`);

  const url = `https://store.steampowered.com/app/${appId}`;

  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Cookie': 'birthtime=0; mature_content=1; wants_mature_content=1',
      },
      maxRedirects: 5,
    });

    console.log(`[Steam] Response status: ${response.status}`);
    console.log(`[Steam] Response size: ${response.data.length} bytes`);

    const $ = cheerio.load(response.data);

    // Check if we got the age check page
    const isAgeCheck = response.data.includes('agecheck') || $('#agegate_box').length > 0;
    console.log(`[Steam] Is age check page: ${isAgeCheck}`);

    // Method 1: game_area_description
    const fullDesc = $('#game_area_description').text().trim();
    console.log(`[Steam] game_area_description: ${fullDesc ? fullDesc.length + ' chars' : 'NOT FOUND'}`);

    // Method 2: snippet
    const snippet = $('.game_description_snippet').text().trim();
    console.log(`[Steam] game_description_snippet: ${snippet ? snippet.length + ' chars' : 'NOT FOUND'}`);

    // Method 3: Meta
    const metaDesc = $('meta[property="og:description"]').attr('content') || '';
    console.log(`[Steam] meta description: ${metaDesc ? metaDesc.length + ' chars' : 'NOT FOUND'}`);

    // Choose longest
    const options = [
      { text: fullDesc, source: 'game_area_description' },
      { text: snippet, source: 'game_description_snippet' },
      { text: metaDesc, source: 'meta description' }
    ].filter(opt => opt.text && opt.text.length > 50);

    let description = '';
    if (options.length > 0) {
      options.sort((a, b) => b.text.length - a.text.length);
      description = options[0].text;
      console.log(`\n[Steam] Using ${options[0].source} (${description.length} chars)`);
    }

    // Clean up
    description = description
      .replace(/^About This Game\s*/i, '')
      .replace(/\s+/g, ' ')
      .trim();

    console.log(`\n[Steam] Final description length: ${description.length} chars`);
    console.log(`[Steam] Preview: ${description.substring(0, 300)}...`);

  } catch (error: any) {
    console.error('[Steam] Error:', error.message);
    if (error.response) {
      console.error('[Steam] Status:', error.response.status);
    }
  }
}

testSteamFetch();
