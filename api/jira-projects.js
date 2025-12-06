/**
 * JIRA Projects API Endpoint
 * Gets all accessible JIRA projects
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required parameter: userId' 
      });
    }

    // Initialize Supabase client
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user's JIRA settings
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('integration_settings')
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      console.error('Failed to fetch user:', userError);
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    const jiraSettings = userData.integration_settings?.jira;
    if (!jiraSettings || !jiraSettings.access_token) {
      return res.status(401).json({ success: false, error: 'JIRA not connected' });
    }

    const { access_token, cloud_id } = jiraSettings;

    console.log('Fetching JIRA projects');

    // Get all projects
    const projectsResponse = await fetch(
      `https://api.atlassian.com/ex/jira/${cloud_id}/rest/api/3/project/search?maxResults=100`,
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!projectsResponse.ok) {
      const errorText = await projectsResponse.text();
      console.error('JIRA API error:', errorText);
      return res.status(projectsResponse.status).json({
        success: false,
        error: `JIRA API error: ${errorText}`
      });
    }

    const projectsData = await projectsResponse.json();
    const projects = (projectsData.values || []).map(p => ({
      id: p.id,
      key: p.key,
      name: p.name,
      avatarUrl: p.avatarUrls?.['48x48'],
      projectTypeKey: p.projectTypeKey,
      style: p.style
    }));

    console.log('JIRA projects fetched:', projects.length);

    return res.status(200).json({
      success: true,
      projects
    });

  } catch (error) {
    console.error('Get JIRA projects error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

