// Vercel serverless function wrapper for Grid Surge
const path = require('path');

// Import the built server from dist
const serverPath = path.join(__dirname, '..', 'dist', 'index.cjs');
const app = require(serverPath);

// Export for Vercel serverless
module.exports = app;
