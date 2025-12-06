/**
 * JIRA Epics API Endpoint
 * Gets epics for a project - uses same approach as sync-jira.js
 */

const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

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
      return res.status(200).json({ success: false, epics: [], error: 'Missing userId or projectKey' });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get user's JIRA settings (same as sync-jira.js)
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('integration_settings')
      .eq('id', userId)
      .single();

    if (userError || !userData?.integration_settings?.jira) {
      return res.status(200).json({ success: false, epics: [], error: 'JIRA not connected' });
    }

    const jiraSettings = userData.integration_settings.jira;
    let accessToken = jiraSettings.access_token;
    const refreshToken = jiraSettings.refresh_token;
    const cloudId = jiraSettings.cloud_id;

    if (!cloudId || !accessToken) {
      return res.status(200).json({ success: false, epics: [], error: 'JIRA credentials incomplete' });
    }

    // Check if token is expired and refresh if needed (same as sync-jira.js)
    const tokenExpiry = jiraSettings.token_expiry ? new Date(jiraSettings.token_expiry) : null;
    if (tokenExpiry && tokenExpiry < new Date() && refreshToken) {
      console.log('JIRA token expired, refreshing...');
      try {
        const refreshResponse = await axios.post('https://auth.atlassian.com/oauth/token', {
          grant_type: 'refresh_token',
          client_id: process.env.JIRA_CLIENT_ID,
          client_secret: process.env.JIRA_CLIENT_SECRET,
          refresh_token: refreshToken
        });

        accessToken = refreshResponse.data.access_token;

        // Update tokens in database
        const integrationSettings = userData.integration_settings;
        integrationSettings.jira.access_token = accessToken;
        if (refreshResponse.data.refresh_token) {
          integrationSettings.jira.refresh_token = refreshResponse.data.refresh_token;
        }
        integrationSettings.jira.token_expiry = new Date(Date.now() + (refreshResponse.data.expires_in * 1000)).toISOString();

        await supabase
          .from('users')
          .update({ integration_settings: integrationSettings })
          .eq('id', userId);

        console.log('JIRA token refreshed successfully');
      } catch (refreshError) {
        console.error('Failed to refresh JIRA token:', refreshError.response?.data || refreshError.message);
        return res.status(200).json({ success: false, epics: [], error: 'Token refresh failed. Please reconnect JIRA.' });
      }
    }

    // Search for epics using JQL (same pattern as desktop core)
    const jql = `project = ${projectKey} AND issuetype = Epic ORDER BY created DESC`;
    const params = new URLSearchParams({
      jql,
      maxResults: '100',
      fields: 'summary,status,key'
    });

    console.log('Fetching epics for project:', projectKey, 'cloudId:', cloudId);

    // Use /search/jql endpoint (same as desktop core)
    const response = await axios.get(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search/jql?${params.toString()}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    const issues = response.data.issues || [];
    const epics = issues.map(issue => ({
      id: issue.id,
      key: issue.key,
      name: issue.fields.summary
    }));

    console.log(`Found ${epics.length} epics for project ${projectKey}`);
    return res.status(200).json({ success: true, epics });

  } catch (error) {
    console.error('Get epics error:', error.response?.data || error.message);
    
    // If it's a 400 error, the project might not have epics or Epic type doesn't exist
    if (error.response?.status === 400) {
      return res.status(200).json({ success: true, epics: [], message: 'No epics in this project' });
    }
    
    return res.status(200).json({ success: false, epics: [], error: error.response?.data?.message || error.message });
  }
};
