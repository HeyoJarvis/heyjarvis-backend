/**
 * JIRA Token Refresh Helper
 * 
 * NOTE: This file is kept for backwards compatibility but the main endpoints
 * (jira-boards, jira-epics, jira-sprints, etc.) now use the same token refresh
 * pattern as sync-jira.js directly in their handlers.
 */

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const JIRA_CLIENT_ID = process.env.JIRA_CLIENT_ID;
const JIRA_CLIENT_SECRET = process.env.JIRA_CLIENT_SECRET;

/**
 * Ensures JIRA token is valid, refreshes if needed
 * @param {string} userId - User ID
 * @returns {Promise<Object>} { access_token, cloud_id, cloud_name }
 */
async function ensureValidJiraToken(userId) {
  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  // Get user's JIRA settings
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('integration_settings')
    .eq('id', userId)
    .single();

  if (userError || !userData) {
    throw new Error('User not found');
  }

  const jiraSettings = userData?.integration_settings?.jira;
  if (!jiraSettings || !jiraSettings.access_token) {
    throw new Error('JIRA not connected');
  }

  const { access_token, refresh_token, token_expiry, cloud_id, cloud_name } = jiraSettings;

  if (!cloud_id) {
    throw new Error('JIRA workspace not configured');
  }

  // Check if token is expired
  const now = Date.now();
  const expiryTime = token_expiry ? new Date(token_expiry).getTime() : 0;
  const needsRefresh = expiryTime && (now >= expiryTime - 300000);

  if (needsRefresh && refresh_token) {
    
    try {
      const response = await fetch('https://auth.atlassian.com/oauth/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'refresh_token',
          client_id: JIRA_CLIENT_ID,
          client_secret: JIRA_CLIENT_SECRET,
          refresh_token: refresh_token
        })
      });

      if (!response.ok) {
        throw new Error('Token refresh failed');
      }

      const tokenData = await response.json();
      
      const updatedSettings = {
        ...userData.integration_settings,
        jira: {
          ...jiraSettings,
          access_token: tokenData.access_token,
          refresh_token: tokenData.refresh_token || refresh_token,
          token_expiry: new Date(Date.now() + (tokenData.expires_in * 1000)).toISOString(),
          scope: tokenData.scope || jiraSettings.scope // Preserve or update scopes
        }
      };

      await supabase
        .from('users')
        .update({ integration_settings: updatedSettings })
        .eq('id', userId);

      return {
        access_token: tokenData.access_token,
        cloud_id,
        cloud_name
      };
    } catch (refreshError) {
      console.error('Failed to refresh token:', refreshError);
      throw new Error('JIRA token expired. Please reconnect JIRA.');
    }
  }

  return { access_token, cloud_id, cloud_name };
}

module.exports = { ensureValidJiraToken };
