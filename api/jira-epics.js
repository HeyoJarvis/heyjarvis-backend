/**
 * JIRA Epics API Endpoint
 * Gets epics for a project
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
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
      return res.status(400).json({ success: false, error: 'Missing userId or projectKey' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: userData } = await supabase
      .from('users')
      .select('integration_settings')
      .eq('id', userId)
      .single();

    const jiraSettings = userData?.integration_settings?.jira;
    if (!jiraSettings?.access_token) {
      return res.status(401).json({ success: false, error: 'JIRA not connected' });
    }

    const { access_token, cloud_id } = jiraSettings;

    // Search for epics in the project
    const response = await fetch(
      `https://api.atlassian.com/ex/jira/${cloud_id}/rest/api/3/search?jql=project=${projectKey} AND issuetype=Epic&maxResults=100`,
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Accept': 'application/json'
        }
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('JIRA API error:', errorText);
      return res.status(response.status).json({ success: false, error: errorText });
    }

    const data = await response.json();
    const epics = (data.issues || []).map(issue => ({
      id: issue.id,
      key: issue.key,
      name: issue.fields.summary
    }));

    return res.status(200).json({ success: true, epics });
  } catch (error) {
    console.error('Get epics error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
};

