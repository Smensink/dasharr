const axios = require('axios');

async function testGamesAPI() {
  const baseURL = process.env.API_URL || 'http://localhost:3000/api/v1';
  const apiKey = process.env.API_KEY || ''; // Set this if you have an API key
  
  console.log('Testing Games API...');
  console.log('Base URL:', baseURL);
  console.log('');

  const headers = {};
  if (apiKey) {
    headers['X-API-Key'] = apiKey;
  }

  try {
    // Test health endpoint
    console.log('1. Testing health endpoint...');
    const health = await axios.get(`${baseURL}/health`, { headers });
    console.log('Health status - Games service available:', health.data.services?.games);
    console.log('');

    // Test anticipated games
    console.log('2. Testing anticipated games...');
    const anticipated = await axios.get(`${baseURL}/games/anticipated?limit=5`, { headers });
    console.log('✅ Anticipated games count:', anticipated.data?.length || 0);
    if (anticipated.data?.length > 0) {
      console.log('First game:', JSON.stringify(anticipated.data[0], null, 2));
    }
    console.log('');

    // Test top rated games
    console.log('3. Testing top rated games...');
    const topRated = await axios.get(`${baseURL}/games/top-rated?limit=5`, { headers });
    console.log('✅ Top rated games count:', topRated.data?.length || 0);
    if (topRated.data?.length > 0) {
      console.log('First game:', JSON.stringify(topRated.data[0], null, 2));
    }
    console.log('');

    // Test game search
    console.log('4. Testing game search...');
    const search = await axios.get(`${baseURL}/games/search?q=witcher&limit=5`, { headers });
    console.log('✅ Search results count:', search.data?.length || 0);
    if (search.data?.length > 0) {
      console.log('First result:', JSON.stringify(search.data[0], null, 2));
    }
    console.log('');

    console.log('✅ All tests passed!');

  } catch (error) {
    console.error('❌ Error testing games API:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', JSON.stringify(error.response.data, null, 2));
      
      if (error.response.status === 401) {
        console.error('\n⚠️  Authentication required!');
        console.error('The API requires authentication. Options:');
        console.error('1. Set API_KEY environment variable with your API key');
        console.error('2. Or use a valid session cookie');
        console.error('3. Or temporarily disable AUTH_ENABLED in .env for testing');
      }
    } else {
      console.error(error.message);
    }
  }
}

testGamesAPI();
