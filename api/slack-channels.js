/**
 * Slack Channels API Endpoint
 * Fetches user's Slack channels using stored access token
 */

const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ success: false, error: 'Missing userId parameter' });
    }

    console.log('📋 Fetching Slack channels for user:', userId);

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
      return res.status(400).json({ success: false, error: 'Failed to fetch user data' });
    }

    const slackSettings = userData?.integration_settings?.slack;
    
    if (!slackSettings?.access_token) {
      return res.status(400).json({ success: false, error: 'Slack not connected', channels: [] });
    }

    console.log('✅ Found Slack token, fetching channels...');

    // Fetch channels from Slack API
    const axios = require('axios');
    const response = await axios.get('https://slack.com/api/conversations.list', {
      params: {
        types: 'public_channel,private_channel',
        limit: 200,
        exclude_archived: true
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
        channels: []
      });
    }

    const channels = (response.data.channels || []).map(ch => ({
      id: ch.id,
      name: ch.name,
      isPrivate: ch.is_private,
      isMember: ch.is_member,
      numMembers: ch.num_members,
      topic: ch.topic?.value,
      purpose: ch.purpose?.value
    }));

    console.log(`✅ Found ${channels.length} Slack channels`);

    return res.json({ 
      success: true, 
      channels,
      count: channels.length
    });

  } catch (error) {
    console.error('❌ Slack channels error:', error.response?.data || error.message);
    return res.status(500).json({ 
      success: false, 
      error: error.message,
      channels: []
    });
  }
};

