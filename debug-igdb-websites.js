const axios = require('axios');
require('dotenv').config();

async function test() {
  const token = (await axios.post('https://id.twitch.tv/oauth2/token?client_id=' + process.env.IGDB_CLIENT_ID + '&client_secret=' + process.env.IGDB_CLIENT_SECRET + '&grant_type=client_credentials')).data.access_token;
  
  const body = 'search "Elden Ring"; fields id, name, websites.id, websites.url, websites.category; limit 1;';
  const response = await axios.post('https://api.igdb.com/v4/games', body, {
    headers: { 'Client-ID': process.env.IGDB_CLIENT_ID, 'Authorization': 'Bearer ' + token }
  });
  
  console.log('Websites:', JSON.stringify(response.data[0].websites.slice(0, 3), null, 2));
}
test();
