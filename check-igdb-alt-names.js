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

async function searchIGDBWithAlts(gameName, token) {
  const response = await axios.post(
    'https://api.igdb.com/v4/games',
    `search "${gameName}";
    fields id, name, slug, first_release_date;
    fields alternative_names.id, alternative_names.name, alternative_names.comment;
    fields websites.url, websites.category;
    limit 5;`,
    {
      headers: {
        'Client-ID': IGDB_CLIENT_ID,
        'Authorization': `Bearer ${token}`,
      },
    }
  );
  return response.data;
}

async function main() {
  const token = await getIGDBToken();
  
  const games = ["Baldur's Gate 3", "Baldur's Gate III"];
  
  for (const game of games) {
    console.log(`\n=== Searching: "${game}" ===`);
    const results = await searchIGDBWithAlts(game, token);
    
    if (results.length > 0) {
      const g = results[0];
      console.log(`Found: "${g.name}" (ID: ${g.id})`);
      console.log(`Alternative names: ${g.alternative_names?.length || 0}`);
      
      if (g.alternative_names?.length > 0) {
        g.alternative_names.forEach(alt => {
          console.log(`  - ${alt.name}${alt.comment ? ` (${alt.comment})` : ''}`);
        });
      }
      
      const steamSite = g.websites?.find(w => w.category === 13);
      if (steamSite) {
        console.log(`Steam URL: ${steamSite.url}`);
      }
    } else {
      console.log('Not found');
    }
  }
}

main().catch(console.error);
