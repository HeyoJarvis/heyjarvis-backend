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
    const { userId, spaceKey, query, limit = 25 } = req.query;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    // Get user's JIRA tokens
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

    // Build search URL
    let searchUrl = `https://api.atlassian.com/ex/confluence/${jiraSettings.cloud_id}/wiki/api/v2/pages`;
    const params = new URLSearchParams();
    
    if (query) params.append('title', query);
    if (spaceKey) params.append('space-key', spaceKey);
    params.append('limit', limit);
    params.append('expand', 'body.storage,space,parent');
    
    const queryString = params.toString();
    if (queryString) searchUrl += `?${queryString}`;

    // Call Confluence API
    const response = await fetch(searchUrl, {
      headers: {
        'Authorization': `Bearer ${jiraSettings.access_token}`,
        'Accept': 'application/json'
      }
    });

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
      results: (data.results || []).map(page => ({
        id: page.id,
        title: page.title,
        type: page.type,
        spaceKey: page.space?.key,
        spaceName: page.space?.name,
        parentTitle: page.parent?.title,
        parentId: page.parent?.id,
        status: page.status,
        _links: page._links
      }))
    });
  } catch (error) {
    console.error('Confluence pages error:', error);
    return res.status(500).json({ 
      error: 'Failed to fetch Confluence pages',
      message: error.message 
    });
  }
};

