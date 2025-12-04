/**
 * Sync JIRA Tasks
 * Fetches tasks from JIRA and stores them in Supabase with sprint data
 */

const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    res.status(200);
    return res.end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  try {
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
      return res.status(401).json({ error: 'JIRA not connected' });
    }

    const jiraSettings = userData.integration_settings.jira;
    let accessToken = jiraSettings.access_token;
    const refreshToken = jiraSettings.refresh_token;
    const cloudId = jiraSettings.cloud_id;

    if (!cloudId || !accessToken) {
      return res.status(401).json({ error: 'JIRA credentials incomplete' });
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
        return res.status(401).json({ error: 'Failed to refresh JIRA token. Please reconnect JIRA.' });
      }
    }

    // Fetch issues from JIRA (with sprint info)
    // Note: Sprint is often in customfield_10020 (Scrum) or customfield_10021 (Kanban)
    const jql = 'ORDER BY updated DESC';
    const fields = 'summary,status,priority,issuetype,assignee,duedate,labels,description,sprint,parent,project,updated,created,customfield_10020,customfield_10021';
    
    console.log('Fetching JIRA issues...');
    const issuesResponse = await axios.get(
      `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search`,
      {
        headers: { 
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        },
        params: {
          jql,
          fields,
          maxResults: 100
        }
      }
    );

    const issues = issuesResponse.data.issues || [];
    console.log(`Fetched ${issues.length} issues from JIRA`);

    // Process and store each issue
    let synced = 0;
    let errors = 0;

    for (const issue of issues) {
      try {
        const fields = issue.fields;
        
        // Extract sprint info (can be in different fields depending on JIRA config)
        let sprintData = null;
        
        // Try direct sprint field first
        if (fields.sprint && typeof fields.sprint === 'object') {
          sprintData = {
            id: fields.sprint.id,
            name: fields.sprint.name,
            state: fields.sprint.state
          };
        }
        
        // Try customfield_10020 (most common for Scrum boards)
        if (!sprintData && fields.customfield_10020) {
          const sprintField = fields.customfield_10020;
          if (Array.isArray(sprintField) && sprintField.length > 0) {
            // Get active sprint or most recent
            const activeSprint = sprintField.find(s => s.state === 'active') || sprintField[sprintField.length - 1];
            if (activeSprint) {
              sprintData = {
                id: activeSprint.id,
                name: activeSprint.name,
                state: activeSprint.state
              };
            }
          } else if (typeof sprintField === 'object' && sprintField.name) {
            sprintData = {
              id: sprintField.id,
              name: sprintField.name,
              state: sprintField.state
            };
          } else if (typeof sprintField === 'string') {
            // Some JIRA returns sprint as a string like "com.atlassian.greenhopper.service.sprint.Sprint@..."
            const nameMatch = sprintField.match(/name=([^,\]]+)/);
            if (nameMatch) {
              sprintData = { name: nameMatch[1] };
            }
          }
        }
        
        // Try customfield_10021 (alternative sprint field)
        if (!sprintData && fields.customfield_10021) {
          const sprintField = fields.customfield_10021;
          if (Array.isArray(sprintField) && sprintField.length > 0) {
            const activeSprint = sprintField.find(s => s.state === 'active') || sprintField[sprintField.length - 1];
            if (activeSprint) {
              sprintData = {
                id: activeSprint.id,
                name: activeSprint.name,
                state: activeSprint.state
              };
            }
          } else if (typeof sprintField === 'object' && sprintField.name) {
            sprintData = {
              id: sprintField.id,
              name: sprintField.name,
              state: sprintField.state
            };
          }
        }
        
        console.log(`Issue ${issue.key}: sprint=${sprintData?.name || 'none'}`);  // Debug log

        // Extract description as text
        let description = '';
        if (fields.description) {
          if (typeof fields.description === 'string') {
            description = fields.description;
          } else if (fields.description.content) {
            // ADF format - extract text
            description = extractTextFromADF(fields.description);
          }
        }

        // Get epic info from parent
        let epicKey = null;
        let epicName = null;
        if (fields.parent && fields.parent.key) {
          epicKey = fields.parent.key;
          epicName = fields.parent.fields?.summary;
        }

        const taskData = {
          user_id: userId,
          session_title: fields.summary,
          external_key: issue.key,
          external_source: 'jira',
          external_url: `https://${jiraSettings.cloud_name || 'atlassian'}.atlassian.net/browse/${issue.key}`,
          workflow_type: 'task',
          is_completed: fields.status?.statusCategory?.key === 'done',
          jira_project_key: fields.project?.key,
          jira_cloud_id: cloudId,
          epic_key: epicKey,
          epic_name: epicName,
          workflow_metadata: {
            status: fields.status?.name,
            status_category: fields.status?.statusCategory?.key,
            priority: fields.priority?.name,
            type: fields.issuetype?.name,
            assignee: fields.assignee?.displayName,
            due_date: fields.duedate,
            labels: fields.labels || [],
            description: description,
            sprint: sprintData,
            project_key: fields.project?.key,
            project_name: fields.project?.name,
            updated_at: fields.updated,
            created_at: fields.created
          },
          updated_at: new Date().toISOString()
        };

        // Upsert the task
        const { error: upsertError } = await supabase
          .from('conversation_sessions')
          .upsert(taskData, { 
            onConflict: 'user_id,external_key',
            ignoreDuplicates: false
          });

        if (upsertError) {
          console.error(`Failed to upsert ${issue.key}:`, upsertError);
          errors++;
        } else {
          synced++;
        }
      } catch (issueError) {
        console.error(`Error processing ${issue.key}:`, issueError.message);
        errors++;
      }
    }

    console.log(`Sync complete: ${synced} synced, ${errors} errors`);

    return res.status(200).json({
      success: true,
      synced,
      errors,
      total: issues.length
    });

  } catch (error) {
    console.error('JIRA sync error:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: error.response?.data?.message || error.message
    });
  }
};

// Helper to extract text from Atlassian Document Format
function extractTextFromADF(adf) {
  if (!adf || !adf.content) return '';
  
  let text = '';
  const processContent = (content) => {
    if (!content) return;
    for (const item of content) {
      if (item.type === 'text') {
        text += item.text;
      } else if (item.type === 'hardBreak') {
        text += '\n';
      } else if (item.content) {
        processContent(item.content);
      }
      if (item.type === 'paragraph' || item.type === 'heading') {
        text += '\n';
      }
    }
  };
  
  processContent(adf.content);
  return text.trim();
}

