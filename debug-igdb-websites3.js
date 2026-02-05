const axios = require('axios');
require('dotenv').config();

async function test() {
  const token = (await axios.post('https://id.twitch.tv/oauth2/token?client_id=' + process.env.IGDB_CLIENT_ID + '&client_secret=' + process.env.IGDB_CLIENT_SECRET + '&grant_type=client_credentials')).data.access_token;
  
  // Query websites endpoint with all fields
  const body = 'fields *; where id = 125915;'; // 125915 should be Steam
  const response = await axios.post('https://api.igdb.com/v4/websites', body, {
    headers: { 'Client-ID': process.env.IGDB_CLIENT_ID, 'Authorization': 'Bearer ' + token }
  });
  
  console.log('Website 125915:', JSON.stringify(response.data[0], null, 2));
}
test();
