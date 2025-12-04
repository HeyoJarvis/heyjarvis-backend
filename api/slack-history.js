/**
 * Slack Channel History API Endpoint
 * Fetches message history for a specific Slack channel
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
    const { channelId, limit = 20, userId } = req.query;
    
    if (!channelId || !userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing channelId or userId parameter',
        messages: []
      });
    }

    console.log('📋 Fetching Slack history for channel:', channelId);

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
    
    if (!slackSettings?.access_token) {
      return res.status(400).json({ success: false, error: 'Slack not connected', messages: [] });
    }

    console.log('✅ Found Slack token, fetching channel history...');

    // Fetch channel history from Slack API
    const response = await axios.get('https://slack.com/api/conversations.history', {
      params: {
        channel: channelId,
        limit: parseInt(limit)
      },
      headers: {
        'Authorization': `Bearer ${slackSettings.access_token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!response.data.ok) {
      console.error('❌ Slack API error:', response.data.error);
      return res.status(400).json({ 
        success: false, 
        error: response.data.error,
        messages: []
      });
    }

    // Process messages to extract user info
    const messages = (response.data.messages || []).map(msg => ({
      user: msg.user,
      text: msg.text,
      timestamp: msg.ts ? new Date(parseFloat(msg.ts) * 1000).toISOString() : null,
      subtype: msg.subtype,
      user_display_name: msg.user_profile?.display_name,
      user_real_name: msg.user_profile?.real_name,
      user_name: msg.username
    }));

    console.log(`✅ Found ${messages.length} messages`);

    return res.json({ 
      success: true, 
      messages,
      count: messages.length
    });

  } catch (error) {
    console.error('❌ Slack history error:', error.response?.data || error.message);
    return res.status(500).json({ 
      success: false, 
      error: error.message,
      messages: []
    });
  }
};

