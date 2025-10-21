#!/usr/bin/env node

const axios = require('axios');

function parseArgs(argv) {
  const options = {};

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];

    if ((arg === '--base-url' || arg === '-b') && argv[i + 1]) {
      options.baseUrl = argv[i + 1];
      i += 1;
      continue;
    }

    if ((arg === '--api-key' || arg === '-k') && argv[i + 1]) {
      options.apiKey = argv[i + 1];
      i += 1;
      continue;
    }
  }

  return options;
}

async function clearSatelliteCache({ baseUrl, apiKey } = {}) {
  const resolvedBaseUrl = (baseUrl || process.env.CACHE_ADMIN_BASE_URL || process.env.API_BASE_URL || 'http://localhost:3001/api').replace(/\/$/, '');
  const endpoint = `${resolvedBaseUrl}/satellite-image/cache/clear`;
  const resolvedApiKey = apiKey || process.env.CACHE_ADMIN_API_KEY || process.env.API_ACCESS_KEY;
  const headers = resolvedApiKey ? { 'x-api-key': resolvedApiKey } : {};

  const response = await axios.delete(endpoint, { headers });
  return response.data;
}

async function run() {
  const options = parseArgs(process.argv);

  try {
    const result = await clearSatelliteCache(options);
    console.log('Satellite image cache cleared successfully.');
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    if (error.response) {
      console.error('Failed to clear satellite image cache:', error.response.status);
      console.error(JSON.stringify(error.response.data, null, 2));
    } else {
      console.error('Failed to clear satellite image cache:', error.message);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  run();
}

module.exports = { clearSatelliteCache };
