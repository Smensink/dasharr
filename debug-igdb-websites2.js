const axios = require('axios');
require('dotenv').config();

async function test() {
  const token = (await axios.post('https://id.twitch.tv/oauth2/token?client_id=' + process.env.IGDB_CLIENT_ID + '&client_secret=' + process.env.IGDB_CLIENT_SECRET + '&grant_type=client_credentials')).data.access_token;
  
  // First get the game with website IDs
  const body1 = 'search "Elden Ring"; fields id, name, websites; limit 1;';
  const response1 = await axios.post('https://api.igdb.com/v4/games', body1, {
    headers: { 'Client-ID': process.env.IGDB_CLIENT_ID, 'Authorization': 'Bearer ' + token }
  });
  
  console.log('Game:', response1.data[0].name);
  console.log('Website IDs:', response1.data[0].websites);
  
  // Now query the websites endpoint for details
  const websiteIds = response1.data[0].websites.slice(0, 5).join(',');
  const body2 = `fields id, url, category; where id = (${websiteIds});`;
  const response2 = await axios.post('https://api.igdb.com/v4/websites', body2, {
    headers: { 'Client-ID': process.env.IGDB_CLIENT_ID, 'Authorization': 'Bearer ' + token }
  });
  
  console.log('\nWebsite details:');
  response2.data.forEach(w => {
    console.log(`  ${w.id}: category=${w.category}, url=${w.url.substring(0, 60)}`);
  });
}
test();
