/**
 * JIRA Project Metadata API Endpoint
 * Gets project creation metadata (issue types, priorities, components, versions)
 * Uses same approach as sync-jira.js
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
      return res.status(200).json({ 
        success: false, 
        metadata: { issueTypes: [], priorities: [], components: [], versions: [] },
        error: 'Missing userId or projectKey' 
      });
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
      return res.status(200).json({ 
        success: false, 
        metadata: { issueTypes: [], priorities: [], components: [], versions: [] },
        error: 'JIRA not connected' 
      });
    }

    const jiraSettings = userData.integration_settings.jira;
    let accessToken = jiraSettings.access_token;
    const refreshToken = jiraSettings.refresh_token;
    const cloudId = jiraSettings.cloud_id;

    if (!cloudId || !accessToken) {
      return res.status(200).json({ 
        success: false, 
        metadata: { issueTypes: [], priorities: [], components: [], versions: [] },
        error: 'JIRA credentials incomplete' 
      });
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
        return res.status(200).json({ 
          success: false, 
          metadata: { issueTypes: [], priorities: [], components: [], versions: [] },
          error: 'Token refresh failed. Please reconnect JIRA.' 
        });
      }
    }


    // Fetch project details, priorities, and issue types in parallel
    const [projectResponse, prioritiesResponse, issueTypesResponse] = await Promise.all([
      // Get project details (includes components and versions)
      axios.get(
        `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/project/${projectKey}`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      ).catch(e => ({ data: null, error: e })),
      
      // Get all priorities
      axios.get(
        `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/priority`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      ).catch(e => ({ data: [], error: e })),
      
      // Get all issue types
      axios.get(
        `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/issuetype`,
        {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
          }
        }
      ).catch(e => ({ data: [], error: e }))
    ]);

    // Parse project data
    let project = { key: projectKey, name: projectKey, id: '' };
    let components = [];
    let versions = [];
    
    if (projectResponse.data) {
      const projectData = projectResponse.data;
      project = {
        key: projectData.key,
        name: projectData.name,
        id: projectData.id
      };
      components = (projectData.components || []).map(c => ({
        id: c.id,
        name: c.name
      }));
      versions = (projectData.versions || []).map(v => ({
        id: v.id,
        name: v.name,
        released: v.released
      }));
    }

    // Parse priorities
    let priorities = [];
    if (prioritiesResponse.data && Array.isArray(prioritiesResponse.data)) {
      priorities = prioritiesResponse.data.map(p => ({
        id: p.id,
        name: p.name
      }));
    }

    // Parse issue types
    let issueTypes = [];
    if (issueTypesResponse.data && Array.isArray(issueTypesResponse.data)) {
      issueTypes = issueTypesResponse.data.map(it => ({
        id: it.id,
        name: it.name,
        subtask: it.subtask || false
      }));
    }


    return res.status(200).json({
      success: true,
      metadata: {
        issueTypes,
        priorities,
        components,
        versions,
        project
      }
    });

  } catch (error) {
    console.error('Get project metadata error:', error.response?.data || error.message);
    return res.status(200).json({
      success: false,
      metadata: { issueTypes: [], priorities: [], components: [], versions: [] },
      error: error.response?.data?.message || error.message
    });
  }
};
