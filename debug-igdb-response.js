const axios = require('axios');
require('dotenv').config();

const IGDB_CLIENT_ID = process.env.IGDB_CLIENT_ID;
const IGDB_CLIENT_SECRET = process.env.IGDB_CLIENT_SECRET;

async function getIGDBToken() {
  const response = await axios.post(
    `https://id.twitch.tv/oauth2/token?client_id=${IGDB_CLIENT_ID}&client_secret=${IGDB_CLIENT_SECRET}&grant_type=client_credentials`
  );
  return response.data.access_token;
}

async function main() {
  const token = await getIGDBToken();
  
  const body = `
    search "Baldur's Gate 3";
    fields id, name, websites.url, websites.category;
    fields alternative_names.name;
    limit 1;
  `;
  
  const response = await axios.post('https://api.igdb.com/v4/games', body, {
    headers: {
      'Client-ID': IGDB_CLIENT_ID,
      'Authorization': `Bearer ${token}`,
    },
  });
  
  console.log('IGDB Response:');
  console.log(JSON.stringify(response.data[0], null, 2));
}

main().catch(console.error);
