/**
 * JIRA Project Metadata API Endpoint
 * Gets project creation metadata (issue types, priorities, etc.)
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
    const { userId, projectKey } = req.query;

    if (!userId || !projectKey) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required parameters: userId, projectKey' 
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

    console.log('Fetching JIRA project metadata:', { projectKey });

    // Get project creation metadata
    const metadataResponse = await fetch(
      `https://api.atlassian.com/ex/jira/${cloud_id}/rest/api/3/issue/createmeta?projectKeys=${projectKey}&expand=projects.issuetypes.fields`,
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!metadataResponse.ok) {
      const errorText = await metadataResponse.text();
      console.error('JIRA API error:', errorText);
      return res.status(metadataResponse.status).json({
        success: false,
        error: `JIRA API error: ${errorText}`
      });
    }

    const metadata = await metadataResponse.json();

    if (!metadata.projects || metadata.projects.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Project not found or no permissions'
      });
    }

    const project = metadata.projects[0];
    const issueTypes = project.issuetypes || [];

    // Extract priorities from the first issue type (they're usually the same across types)
    let priorities = [];
    if (issueTypes.length > 0 && issueTypes[0].fields?.priority?.allowedValues) {
      priorities = issueTypes[0].fields.priority.allowedValues.map(p => ({
        id: p.id,
        name: p.name
      }));
    }

    // Extract issue types
    const formattedIssueTypes = issueTypes.map(it => ({
      id: it.id,
      name: it.name,
      subtask: it.subtask || false
    }));

    console.log('Project metadata fetched:', {
      projectKey,
      issueTypesCount: formattedIssueTypes.length,
      prioritiesCount: priorities.length
    });

    return res.status(200).json({
      success: true,
      issueTypes: formattedIssueTypes,
      priorities: priorities,
      project: {
        key: project.key,
        name: project.name,
        id: project.id
      }
    });

  } catch (error) {
    console.error('Get project metadata error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

