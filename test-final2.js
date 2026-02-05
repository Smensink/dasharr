#!/usr/bin/env node
/**
 * Test all agents with the built code
 */
require('dotenv').config();

async function test() {
  const gameName = 'Elden Ring';
  
  console.log('========================================');
  console.log(`Testing search for: ${gameName}`);
  console.log('========================================\n');
  
  const { GamesService } = require('./apps/api/dist/services/games/GamesService');
  const { CacheService } = require('./apps/api/dist/services/cache.service');
  const { config } = require('./apps/api/dist/config/services.config');
  
  const cacheService = new CacheService();
  
  const gamesService = new GamesService(
    {
      igdb: config.igdb,
      prowlarr: config.prowlarr?.enabled ? {
        baseUrl: config.prowlarr.baseUrl,
        apiKey: config.prowlarr.apiKey,
      } : undefined,
      dodi: config.flaresolverr?.enabled ? {
        flaresolverrUrl: config.flaresolverr.baseUrl,
      } : undefined,
    },
    cacheService
  );
  
  // Wait a bit for initialization
  await new Promise(r => setTimeout(r, 1000));
  
  console.log('\nTesting enhanced search (with IGDB data):\n');
  
  // Get IGDB game data first
  const igdbGames = await gamesService.searchGames(gameName, 1);
  if (igdbGames.length === 0) {
    console.log('No IGDB game found');
    return;
  }
  
  const igdbGame = await gamesService.getGameDetails(igdbGames[0].igdbId);
  console.log(`Using IGDB game: ${igdbGame?.name}\n`);
  
  // Test enhanced search
  const results = await gamesService.testSearchAgentsEnhanced(igdbGame.id);
  
  console.log('\n\nEnhanced Results by agent:');
  console.log('Agent           | Available | Success | Candidates | Duration | Error');
  console.log('----------------|-----------|---------|------------|----------|------');
  
  for (const r of results.results) {
    const error = r.error ? r.error.substring(0, 25) : '';
    console.log(`${r.agent.padEnd(15)} | ${r.available ? 'YES' : 'NO '}       | ${r.success ? 'YES' : 'NO '}     | ${r.candidates.length.toString().padStart(10)} | ${r.duration.toString().padStart(6)}ms | ${error}`);
    
    if (r.candidates.length > 0) {
      console.log(`  Sample candidates:`);
      r.candidates.slice(0, 5).forEach((c, i) => {
        const score = c.matchScore ? ` (score: ${c.matchScore})` : '';
        console.log(`    ${i+1}. ${c.title.substring(0, 60)}${score}`);
      });
    }
  }
  
  console.log('\n========================================');
  console.log('Test Complete');
  console.log('========================================');
}

test().catch(err => {
  console.error('Error:', err.message);
  console.error(err.stack);
});
