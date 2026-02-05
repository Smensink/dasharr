const axios = require('axios');
const cheerio = require('cheerio');

async function test() {
  const response = await axios.get('https://fitgirl-repacks.site/?s=witcher', {
    timeout: 30000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  });
  
  const $ = cheerio.load(response.data);
  const articles = $('article');
  console.log('Found articles:', articles.length);
  
  articles.each((i, el) => {
    const title = $(el).find('h2.entry-title a').text().trim();
    const link = $(el).find('h2.entry-title a').attr('href');
    console.log('Article ' + i + ': ' + title);
    console.log('  Link: ' + link);
  });
}

test().catch(console.error);
