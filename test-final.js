#!/usr/bin/env node
/**
 * Final test to check all agents
 */
require('dotenv').config();

const axios = require('axios');

async function test() {
  const gameName = 'Elden Ring';
  
  console.log('========================================');
  console.log(`Testing search for: ${gameName}`);
  console.log('========================================\n');
  
  // Test using the built agents
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
  
  console.log('Search agents initialized:\n');
  
  // Test each agent
  const results = await gamesService.testSearchAgents(gameName);
  
  console.log('\nResults by agent:');
  console.log('Agent           | Available | Success | Candidates | Duration | Error');
  console.log('----------------|-----------|---------|------------|----------|------');
  
  for (const r of results) {
    const error = r.error ? r.error.substring(0, 20) : '';
    console.log(`${r.agent.padEnd(15)} | ${r.available ? 'YES' : 'NO '}       | ${r.success ? 'YES' : 'NO '}     | ${r.candidates.length.toString().padStart(10)} | ${r.duration.toString().padStart(6)}ms | ${error}`);
    
    if (r.candidates.length > 0) {
      r.candidates.slice(0, 3).forEach((c, i) => {
        console.log(`  ${i+1}. ${c.title} (${c.source})`);
      });
    }
  }
  
  console.log('\n========================================');
  console.log('Test Complete');
  console.log('========================================');
}

test().catch(err => {
  console.error('Error:', err.message);
  console.error('Make sure you have run "pnpm build" first');
});
