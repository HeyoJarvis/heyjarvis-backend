/**
 * JIRA Boards API Endpoint
 * Gets boards for a project - uses same approach as sync-jira.js
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
      return res.status(200).json({ success: false, boards: [], error: 'Missing userId or projectKey' });
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
      return res.status(200).json({ success: false, boards: [], error: 'JIRA not connected' });
    }

    const jiraSettings = userData.integration_settings.jira;
    let accessToken = jiraSettings.access_token;
    const refreshToken = jiraSettings.refresh_token;
    const cloudId = jiraSettings.cloud_id;

    if (!cloudId || !accessToken) {
      return res.status(200).json({ success: false, boards: [], error: 'JIRA credentials incomplete' });
    }

    // Check if token is expired and refresh if needed (same as sync-jira.js)
    const tokenExpiry = jiraSettings.token_expiry ? new Date(jiraSettings.token_expiry) : null;
    if (tokenExpiry && tokenExpiry < new Date() && refreshToken) {
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

      } catch (refreshError) {
        console.error('Failed to refresh JIRA token:', refreshError.response?.data || refreshError.message);
        return res.status(200).json({ success: false, boards: [], error: 'Token refresh failed. Please reconnect JIRA.' });
      }
    }


    // Get boards for the project using agile API
    const response = await axios.get(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/agile/1.0/board?projectKeyOrId=${projectKey}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        }
      }
    );

    const boards = (response.data.values || []).map(b => ({
      id: b.id,
      name: b.name,
      type: b.type
    }));

    return res.status(200).json({ success: true, boards });

  } catch (error) {
    console.error('Get boards error:', error.response?.data || error.message);
    
    // If it's a 404, the project might not have agile boards (company-managed project)
    if (error.response?.status === 404) {
      return res.status(200).json({ success: true, boards: [], message: 'No agile boards for this project' });
    }
    
    return res.status(200).json({ success: false, boards: [], error: error.response?.data?.message || error.message });
  }
};
