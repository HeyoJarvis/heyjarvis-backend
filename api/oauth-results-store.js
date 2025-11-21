/**
 * Shared OAuth Results Store
 * In-memory storage for OAuth results (use Redis in production for multi-instance deployments)
 */

const pendingResults = new Map();

// Clean up expired results every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of pendingResults.entries()) {
    if (now - value.timestamp > 5 * 60 * 1000) { // 5 minutes
      pendingResults.delete(key);
      console.log('🧹 Cleaned up expired OAuth result:', key);
    }
  }
}, 60 * 1000);

module.exports = pendingResults;

