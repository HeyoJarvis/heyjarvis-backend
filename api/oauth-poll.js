/**
 * OAuth Polling Endpoint
 * Desktop app polls this to check if OAuth flow completed
 */

const oauthStore = require('../lib/oauth-store');

module.exports = async (req, res) => {
  try {
    const { provider, session_id } = req.query;
    
    console.log(`📡 Poll request received:`, { provider, session_id, allKeys: oauthStore.keys() });
    
    if (!provider || !session_id) {
      console.error('❌ Missing provider or session_id');
      return res.status(400).json({ 
        success: false, 
        error: 'Missing provider or session_id' 
      });
    }

    const key = `${provider}_${session_id}`;
    console.log(`🔍 Looking for key: ${key}`);
    
    const result = oauthStore.get(key);

    if (result) {
      // Remove the result after retrieving it (one-time use)
      oauthStore.delete(key);
      
      console.log(`✅ OAuth result retrieved and deleted: ${key}`);
      
      return res.json({
        success: true,
        found: true,
        ...result
      });
    }

    // No result yet - still pending
    console.log(`⏳ No result found for ${key}, still pending`);
    return res.json({
      success: true,
      found: false,
      pending: true
    });

  } catch (error) {
    console.error('❌ OAuth poll error:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
