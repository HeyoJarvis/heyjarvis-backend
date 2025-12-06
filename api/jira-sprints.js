/**
 * JIRA Sprints API Endpoint
 * Gets sprints for a project by extracting from issues (same approach as sync-jira.js)
 * Falls back to agile board API if available
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
    // Accept either boardId (old way) or projectKey (new way)
    const { userId, boardId, projectKey, state = 'active,future' } = req.query;

    if (!userId) {
      return res.status(200).json({ success: false, sprints: [], error: 'Missing userId' });
    }

    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get user's JIRA settings
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('integration_settings')
      .eq('id', userId)
      .single();

    if (userError || !userData?.integration_settings?.jira) {
      return res.status(200).json({ success: false, sprints: [], error: 'JIRA not connected' });
    }

    const jiraSettings = userData.integration_settings.jira;
    let accessToken = jiraSettings.access_token;
    const refreshToken = jiraSettings.refresh_token;
    const cloudId = jiraSettings.cloud_id;

    if (!cloudId || !accessToken) {
      return res.status(200).json({ success: false, sprints: [], error: 'JIRA credentials incomplete' });
    }

    // Check if token is expired and refresh if needed
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
        return res.status(200).json({ success: false, sprints: [], error: 'Token refresh failed' });
      }
    }

    // If boardId is provided, try the agile API first
    if (boardId) {
      try {
        console.log('Fetching sprints for board:', boardId);
        const response = await axios.get(
          `https://api.atlassian.com/ex/jira/${cloudId}/rest/agile/1.0/board/${boardId}/sprint?state=${state}`,
          {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Accept': 'application/json'
            }
          }
        );

        const sprints = (response.data.values || []).map(s => ({
          id: s.id,
          name: s.name,
          state: s.state,
          startDate: s.startDate,
          endDate: s.endDate
        }));

        console.log(`Found ${sprints.length} sprints for board ${boardId}`);
        return res.status(200).json({ success: true, sprints });
      } catch (boardError) {
        console.log('Board sprint API failed, will try extracting from issues:', boardError.response?.status);
        // Fall through to extract from issues
      }
    }

    // Extract sprints from issues (same approach as sync-jira.js)
    // This works even when agile board API is not available
    const targetProject = projectKey || 'all';
    const jql = targetProject !== 'all' 
      ? `project = ${targetProject} AND sprint IS NOT EMPTY ORDER BY updated DESC`
      : 'sprint IS NOT EMPTY ORDER BY updated DESC';
    
    const params = new URLSearchParams({
      jql,
      maxResults: '100',
      fields: 'sprint,customfield_10020,customfield_10010,customfield_10011'
    });

    console.log('Fetching sprints from issues for project:', targetProject);

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
    const sprintMap = new Map();

    // Extract unique sprints from issues (same logic as sync-jira.js)
    for (const issue of issues) {
      const fields = issue.fields;
      
      // Try direct sprint field
      if (fields.sprint && typeof fields.sprint === 'object') {
        const s = fields.sprint;
        if (s.name && !sprintMap.has(s.id)) {
          sprintMap.set(s.id, { id: s.id, name: s.name, state: s.state });
        }
      }
      
      // Try customfield_10020 (most common)
      const sprintFields = [
        fields.customfield_10020,
        fields.customfield_10010,
        fields.customfield_10011
      ];
      
      for (const sprintField of sprintFields) {
        if (!sprintField) continue;
        
        if (Array.isArray(sprintField)) {
          for (const s of sprintField) {
            if (s && s.name && !sprintMap.has(s.id)) {
              sprintMap.set(s.id, { id: s.id, name: s.name, state: s.state });
            }
          }
        } else if (typeof sprintField === 'object' && sprintField.name) {
          if (!sprintMap.has(sprintField.id)) {
            sprintMap.set(sprintField.id, { 
              id: sprintField.id, 
              name: sprintField.name, 
              state: sprintField.state 
            });
          }
        }
      }
    }

    const sprints = Array.from(sprintMap.values());
    
    // Sort: active first, then future, then closed
    sprints.sort((a, b) => {
      const order = { active: 0, future: 1, closed: 2 };
      return (order[a.state] || 3) - (order[b.state] || 3);
    });

    console.log(`Found ${sprints.length} unique sprints from ${issues.length} issues`);
    return res.status(200).json({ success: true, sprints });

  } catch (error) {
    console.error('Get sprints error:', error.response?.data || error.message);
    return res.status(200).json({ success: false, sprints: [], error: error.response?.data?.message || error.message });
  }
};
