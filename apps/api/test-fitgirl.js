const cheerio = require('/app/node_modules/cheerio');
const axios = require('/app/node_modules/axios');

async function test() {
  const url = 'https://fitgirl-repacks.site/god-of-war-ragnarok/';
  console.log('Fetching:', url);
  try {
    const resp = await axios.get(url, { timeout: 10000, headers: { 'User-Agent': 'Mozilla/5.0' } });
    console.log('Status:', resp.status);
    console.log('Length:', resp.data.length);
    const $ = cheerio.load(resp.data);
    const desc = $('.entry-content').text().trim().substring(0, 800);
    console.log('Description preview:');
    console.log(desc);
  } catch(e) {
    console.error('Error:', e.message);
  }
}
test();
