/**
 * OAuth Results Store
 * Stores OAuth results temporarily for desktop app to poll
 * 
 * Uses /tmp directory which persists across serverless invocations
 * on the same Vercel instance for a short time
 */

const fs = require('fs');
const path = require('path');

// Use /tmp directory which is writable on Vercel
const STORE_DIR = '/tmp/oauth-store';

// Ensure store directory exists
if (!fs.existsSync(STORE_DIR)) {
  fs.mkdirSync(STORE_DIR, { recursive: true });
}

// Clean up expired files on module load
const cleanupExpired = () => {
  try {
    const now = Date.now();
    const files = fs.readdirSync(STORE_DIR);
    let cleaned = 0;
    
    for (const file of files) {
      const filePath = path.join(STORE_DIR, file);
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        if (now - data.timestamp > 10 * 60 * 1000) { // 10 minutes
          fs.unlinkSync(filePath);
          cleaned++;
        }
      } catch (err) {
        // Invalid file, delete it
        fs.unlinkSync(filePath);
        cleaned++;
      }
    }
    
    if (cleaned > 0) {
    }
  } catch (err) {
    console.error('Cleanup error:', err);
  }
};

// Run cleanup on module load
cleanupExpired();

module.exports = {
  set: (key, value) => {
    try {
      const data = {
        ...value,
        timestamp: Date.now()
      };
      const filePath = path.join(STORE_DIR, `${key}.json`);
      fs.writeFileSync(filePath, JSON.stringify(data), 'utf8');
    } catch (err) {
      console.error(`❌ Failed to store OAuth result: ${key}`, err);
    }
  },
  
  get: (key) => {
    try {
      const filePath = path.join(STORE_DIR, `${key}.json`);
      if (!fs.existsSync(filePath)) {
        return null;
      }
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      
      // Check if expired
      if (Date.now() - data.timestamp > 10 * 60 * 1000) {
        fs.unlinkSync(filePath);
        return null;
      }
      
      return data;
    } catch (err) {
      console.error(`❌ Failed to get OAuth result: ${key}`, err);
      return null;
    }
  },
  
  delete: (key) => {
    try {
      const filePath = path.join(STORE_DIR, `${key}.json`);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
      return false;
    } catch (err) {
      console.error(`❌ Failed to delete OAuth result: ${key}`, err);
      return false;
    }
  },
  
  size: () => {
    try {
      return fs.readdirSync(STORE_DIR).length;
    } catch (err) {
      return 0;
    }
  },
  
  keys: () => {
    try {
      return fs.readdirSync(STORE_DIR).map(f => f.replace('.json', ''));
    } catch (err) {
      return [];
    }
  }
};

