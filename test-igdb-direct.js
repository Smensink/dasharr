// Test IGDB client directly
const axios = require('axios');

async function testIGDB() {
  // IGDB credentials from .env
  const clientId = 'uvlvo12y1vkg6n9tkcacno9tu807wc';
  const clientSecret = '0us40zznw0gpyec4lxz04b2xiol7ty';

  console.log('Testing IGDB API directly...');
  console.log('Client ID:', clientId.substring(0, 5) + '...');
  console.log('');

  try {
    // Step 1: Get access token
    console.log('1. Getting access token from Twitch...');
    const tokenResponse = await axios.post('https://id.twitch.tv/oauth2/token', null, {
      params: {
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'client_credentials',
      },
    });
    
    const accessToken = tokenResponse.data.access_token;
    console.log('✅ Got access token');
    console.log('');

    // Step 2: Test anticipated games query
    console.log('2. Testing anticipated games query...');
    const now = Math.floor(Date.now() / 1000);
    
    const anticipatedBody = `
      fields id, name, slug, summary, storyline, first_release_date, rating, rating_count, aggregated_rating, aggregated_rating_count, status, hypes;
      fields cover.id, cover.url, cover.width, cover.height;
      fields platforms.id, platforms.name, platforms.abbreviation;
      fields genres.id, genres.name;
      where first_release_date > ${now} & status != 6 & status != 8;
      sort hypes desc;
      limit 5;
    `;

    const anticipatedResponse = await axios.post('https://api.igdb.com/v4/games', anticipatedBody, {
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    console.log('✅ Anticipated games count:', anticipatedResponse.data.length);
    if (anticipatedResponse.data.length > 0) {
      console.log('First game:', JSON.stringify(anticipatedResponse.data[0], null, 2));
    } else {
      console.log('⚠️ No anticipated games returned');
    }
    console.log('');

    // Step 3: Test top rated games query
    console.log('3. Testing top rated games query...');
    
    const topRatedBody = `
      fields id, name, slug, summary, storyline, first_release_date, rating, rating_count, aggregated_rating, aggregated_rating_count, status;
      fields cover.id, cover.url, cover.width, cover.height;
      fields platforms.id, platforms.name, platforms.abbreviation;
      fields genres.id, genres.name;
      where aggregated_rating > 85 & aggregated_rating_count > 50 & status != 6 & status != 8;
      sort aggregated_rating desc;
      limit 5;
    `;

    const topRatedResponse = await axios.post('https://api.igdb.com/v4/games', topRatedBody, {
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    console.log('✅ Top rated games count:', topRatedResponse.data.length);
    if (topRatedResponse.data.length > 0) {
      console.log('First game:', JSON.stringify(topRatedResponse.data[0], null, 2));
    } else {
      console.log('⚠️ No top rated games returned');
    }
    console.log('');

    // Step 4: Test search
    console.log('4. Testing game search...');
    
    const searchBody = `
      search "witcher";
      fields id, name, slug, summary, storyline, first_release_date, rating, rating_count, aggregated_rating, aggregated_rating_count, status;
      fields cover.id, cover.url, cover.width, cover.height;
      fields platforms.id, platforms.name, platforms.abbreviation;
      fields genres.id, genres.name;
      fields alternative_names.id, alternative_names.name, alternative_names.comment;
      fields websites.id, websites.url, websites.category;
      limit 5;
    `;

    const searchResponse = await axios.post('https://api.igdb.com/v4/games', searchBody, {
      headers: {
        'Client-ID': clientId,
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
    });

    console.log('✅ Search results count:', searchResponse.data.length);
    if (searchResponse.data.length > 0) {
      console.log('First result:', JSON.stringify(searchResponse.data[0], null, 2));
    } else {
      console.log('⚠️ No search results returned');
    }

  } catch (error) {
    console.error('❌ Error testing IGDB:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
    } else {
      console.error(error.message);
    }
  }
}

testIGDB();
