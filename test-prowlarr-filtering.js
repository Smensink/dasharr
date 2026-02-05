#!/usr/bin/env node
/**
 * Test Prowlarr filtering in detail
 */
require('dotenv').config();

const axios = require('axios');

const PROWLARR_URL = process.env.PROWLARR_URL || 'http://localhost:9696';
const PROWLARR_API_KEY = process.env.PROWLARR_API_KEY;

const baseUrl = PROWLARR_URL.replace(/\/$/, '');

const axiosInstance = axios.create({
  baseURL: baseUrl,
  timeout: 60000,
  headers: {
    'X-Api-Key': PROWLARR_API_KEY,
    'Accept': 'application/json',
  },
});

// Copy of isGameUpdate from ProwlarrGameAgent (UPDATED version)
function isGameUpdate(title) {
  const lower = title.toLowerCase();
  const updatePatterns = [
    /\bupdate\s*only\b/i,
    /\bupdate\s*v?\d+.*\brequire\b/i,
    /\bpatch\s*v?\d/i,
    /\btrainer\b/i,
    /\bplus\s*\d+\s*trainer\b/i,
    /\b(ost|soundtrack)\b/i,
  ];
  return updatePatterns.some(p => p.test(lower));
}

// Simple IGDB-like matching
function matchWithIGDB(title, gameName) {
  const cleanTitle = title.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const cleanGame = gameName.toLowerCase().replace(/[^\w\s]/g, ' ').replace(/\s+/g, ' ').trim();
  
  const titleWords = cleanTitle.split(/\s+/).filter(w => w.length > 2);
  const gameWords = cleanGame.split(/\s+/).filter(w => w.length > 2);
  
  const matches = titleWords.filter(w => gameWords.includes(w));
  const score = (matches.length / Math.max(titleWords.length, gameWords.length)) * 100;
  
  return {
    matches: score >= 60,
    score: Math.round(score),
  };
}

async function test() {
  const gameName = 'Elden Ring';
  
  const params = new URLSearchParams({
    query: gameName,
    type: 'search',
    limit: '100',
  });
  [4050].forEach(cat => params.append('categories', cat.toString()));

  console.log('Testing Prowlarr filtering...\n');
  const response = await axiosInstance.get(`/api/v1/search?${params.toString()}`);
  
  const results = response.data || [];
  console.log(`Total results from Prowlarr: ${results.length}\n`);
  
  let afterUpdateFilter = 0;
  let afterIGDBMatch = 0;
  
  console.log('Title                                                          | IsUpdate? | IGDB Score | Pass?');
  console.log('---------------------------------------------------------------|-----------|------------|------');
  
  for (let i = 0; i < Math.min(40, results.length); i++) {
    const title = results[i].title || results[i].releaseTitle || 'NO_TITLE';
    
    const isUpdate = isGameUpdate(title);
    if (!isUpdate) afterUpdateFilter++;
    
    const igdbMatch = matchWithIGDB(title, gameName);
    if (igdbMatch.matches) afterIGDBMatch++;
    
    const pass = !isUpdate && igdbMatch.matches;
    
    console.log(`${title.substring(0, 60).padEnd(60)} | ${isUpdate ? 'UPDATE   ' : 'GAME     '} | ${igdbMatch.score.toString().padStart(6)}%   | ${pass ? 'YES' : 'NO '}`);
  }
  
  console.log('\n---------------------------------------------------------------|-----------|------------|------');
  console.log(`\nFirst 40 results:`);
  console.log(`  After update filter: ${afterUpdateFilter}`);
  console.log(`  After IGDB match (60%+): ${afterIGDBMatch}`);
  
  // Full stats
  let totalAfterUpdate = 0;
  let totalAfterIGDB = 0;
  
  for (const r of results) {
    const title = r.title || r.releaseTitle || '';
    if (!isGameUpdate(title)) {
      totalAfterUpdate++;
      if (matchWithIGDB(title, gameName).matches) {
        totalAfterIGDB++;
      }
    }
  }
  
  console.log(`\nFull stats for all ${results.length} results:`);
  console.log(`  After update filter: ${totalAfterUpdate}`);
  console.log(`  After IGDB match (60%+): ${totalAfterIGDB}`);
}

test().catch(console.error);
