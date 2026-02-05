const axios = require('axios');
require('dotenv').config();

async function test() {
  const token = (await axios.post('https://id.twitch.tv/oauth2/token?client_id=' + process.env.IGDB_CLIENT_ID + '&client_secret=' + process.env.IGDB_CLIENT_SECRET + '&grant_type=client_credentials')).data.access_token;
  
  // Get all websites for Elden Ring with their types
  const body = 'fields id, url, type; where game = 119133;';
  const response = await axios.post('https://api.igdb.com/v4/websites', body, {
    headers: { 'Client-ID': process.env.IGDB_CLIENT_ID, 'Authorization': 'Bearer ' + token }
  });
  
  console.log('Elden Ring websites:');
  response.data.forEach(w => {
    const shortUrl = w.url.substring(0, 50);
    console.log(`  type=${w.type}, url=${shortUrl}...`);
  });
}
test();
