/**
 * Slack Search API Endpoint
 * Searches for messages across the workspace
 * Requires 'search:read' OAuth scope
 */

const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { query, userId, count = 20 } = req.query;
    
    if (!query || !userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing query or userId parameter',
        messages: []
      });
    }

    console.log('🔍 Searching Slack for:', query);

    // Initialize Supabase
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get user's Slack tokens
    const { data: userData, error: fetchError } = await supabase
      .from('users')
      .select('integration_settings')
      .eq('id', userId)
      .single();

    if (fetchError) {
      console.error('❌ Failed to fetch user:', fetchError);
      return res.status(400).json({ success: false, error: 'Failed to fetch user data', messages: [] });
    }

    const slackSettings = userData?.integration_settings?.slack;
    
    if (!slackSettings?.access_token && !slackSettings?.user_access_token) {
      return res.status(400).json({ success: false, error: 'Slack not connected', messages: [] });
    }

    // IMPORTANT: search.messages requires USER token (xoxp-*), not bot token (xoxb-*)
    // Use user_access_token if available, otherwise fall back to access_token
    const searchToken = slackSettings.user_access_token || slackSettings.access_token;
    
    // Check if we have a user token (starts with xoxp-)
    if (searchToken && !searchToken.startsWith('xoxp-')) {
      console.log('⚠️ Warning: Search token may be a bot token. search:read requires a user token.');
      console.log('Token type:', searchToken.substring(0, 5));
    }

    console.log('✅ Found Slack tokens:');
    console.log('   - user_access_token:', slackSettings.user_access_token ? `${slackSettings.user_access_token.substring(0, 10)}...` : 'NOT SET');
    console.log('   - bot_access_token:', slackSettings.bot_access_token ? `${slackSettings.bot_access_token.substring(0, 10)}...` : 'NOT SET');
    console.log('   - access_token:', slackSettings.access_token ? `${slackSettings.access_token.substring(0, 10)}...` : 'NOT SET');
    console.log('🔑 Using token for search:', searchToken?.substring(0, 10) || 'none');
    console.log('📋 User scopes:', slackSettings.user_scopes || 'NOT SET');
    console.log('📋 Bot scopes:', slackSettings.bot_scopes || 'NOT SET');

    // Search messages using Slack API
    // Note: This requires the 'search:read' USER scope
    const response = await axios.get('https://slack.com/api/search.messages', {
      params: {
        query: query,
        count: parseInt(count),
        sort: 'score',
        sort_dir: 'desc'
      },
      headers: {
        'Authorization': `Bearer ${searchToken}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.data.ok) {
      console.error('❌ Slack API error:', response.data.error);
      
      // Specific error handling for missing scope
      if (response.data.error === 'missing_scope') {
        return res.status(403).json({ 
          success: false, 
          error: 'Missing search:read scope. Please re-authenticate Slack with search permissions.',
          messages: []
        });
      }
      
      return res.status(400).json({ 
        success: false, 
        error: response.data.error,
        messages: []
      });
    }

    // Process search results
    const matches = response.data.messages?.matches || [];
    
    console.log(`✅ Found ${matches.length} matching messages`);

    // Format messages for the frontend
    const messages = matches.map(match => ({
      text: match.text,
      username: match.username,
      user_name: match.username,
      channel_id: match.channel?.id,
      channel_name: match.channel?.name,
      timestamp: match.ts,
      permalink: match.permalink,
      team: match.team
    }));

    // Group by channel for easier consumption
    const channels = {};
    messages.forEach(msg => {
      const channelId = msg.channel_id || 'unknown';
      if (!channels[channelId]) {
        channels[channelId] = {
          id: channelId,
          name: msg.channel_name || 'Unknown Channel',
          messages: []
        };
      }
      channels[channelId].messages.push(msg);
    });

    return res.json({ 
      success: true, 
      messages,
      channels: Object.values(channels),
      total: response.data.messages?.total || 0,
      query: query
    });

  } catch (error) {
    console.error('❌ Slack search error:', error.response?.data || error.message);
    return res.status(500).json({ 
      success: false, 
      error: error.message,
      messages: []
    });
  }
};

