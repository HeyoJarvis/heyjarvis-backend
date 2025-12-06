const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Get user's JIRA tokens (Confluence uses same OAuth)
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('integration_settings')
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      return res.status(404).json({ error: 'User not found' });
    }

    const jiraSettings = userData.integration_settings?.jira;
    
    if (!jiraSettings?.access_token || !jiraSettings?.cloud_id) {
      return res.status(401).json({ error: 'JIRA not connected' });
    }

    // Call Confluence API
    const response = await fetch(
      `https://api.atlassian.com/ex/confluence/${jiraSettings.cloud_id}/wiki/api/v2/spaces`,
      {
        headers: {
          'Authorization': `Bearer ${jiraSettings.access_token}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ 
        error: `Confluence API error: ${response.status}`,
        details: errorText
      });
    }

    const data = await response.json();
    
    return res.status(200).json({
      success: true,
      spaces: (data.results || []).map(space => ({
        key: space.key,
        name: space.name,
        type: space.type,
        id: space.id
      }))
    });
  } catch (error) {
    console.error('Confluence spaces error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch Confluence spaces',
      message: error.message 
    });
  }
};

