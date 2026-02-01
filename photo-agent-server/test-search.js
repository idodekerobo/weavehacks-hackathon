#!/usr/bin/env node

/**
 * Test script for agentic search functionality
 * Usage: node test-search.js "your search query"
 */

const http = require('http');

const query = process.argv[2] || 'red flowers';
const maxResults = process.argv[3] || 10;

console.log(`\n🔍 Testing search for: "${query}"`);
console.log(`   Max results: ${maxResults}\n`);

const options = {
  hostname: 'localhost',
  port: 1738,
  path: `/api/search?q=${encodeURIComponent(query)}&maxResults=${maxResults}`,
  method: 'GET',
  headers: {
    'Content-Type': 'application/json',
  }
};

const req = http.request(options, (res) => {
  let data = '';

  res.on('data', (chunk) => {
    data += chunk;
  });

  res.on('end', () => {
    try {
      const response = JSON.parse(data);
      
      console.log('✅ Response received:\n');
      console.log(`Success: ${response.success}`);
      console.log(`Total results: ${response.total}`);
      
      if (response.agentSteps) {
        console.log(`\nAgent steps:`);
        console.log(`  - Tools used: ${response.agentSteps.toolCalls.join(', ')}`);
        console.log(`  - Iterations: ${response.agentSteps.iterations}`);
        console.log(`  - Reasoning: ${response.agentSteps.reasoning}`);
      }
      
      if (response.results && response.results.length > 0) {
        console.log(`\nResults:`);
        response.results.slice(0, 3).forEach((result, i) => {
          console.log(`\n${i + 1}. ${result.filename || 'Unknown'}`);
          console.log(`   Photo Library ID: ${result.photoLibraryId}`);
          console.log(`   Intent: ${result.intentType || 'none'}`);
          if (result.summary) {
            console.log(`   Summary: ${result.summary.substring(0, 100)}...`);
          }
        });
        
        if (response.results.length > 3) {
          console.log(`\n   ... and ${response.results.length - 3} more results`);
        }
      } else {
        console.log('\nNo results found.');
      }
      
      if (response.error) {
        console.error(`\n❌ Error: ${response.error}`);
      }
      
      console.log('\n');
    } catch (error) {
      console.error('❌ Failed to parse response:', error.message);
      console.error('Raw response:', data);
    }
  });
});

req.on('error', (error) => {
  console.error('❌ Request failed:', error.message);
  console.log('\nMake sure the server is running:');
  console.log('  cd photo-agent-server && npm run dev\n');
});

req.end();
