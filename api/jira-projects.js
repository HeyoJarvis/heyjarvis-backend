/**
 * JIRA Projects API Endpoint
 * Gets all accessible JIRA projects
 */

const { ensureValidJiraToken } = require('../lib/jira-token-refresh');

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

    // Get valid JIRA token (refreshes if needed)
    const { access_token, cloud_id } = await ensureValidJiraToken(userId);

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
