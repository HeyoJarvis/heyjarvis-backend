/**
 * JIRA Create Issue API Endpoint
 * Creates a new JIRA issue via the JIRA REST API
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

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    const { userId, projectKey, issueData } = req.body;

    if (!userId || !projectKey || !issueData) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing required fields: userId, projectKey, issueData' 
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

    const { access_token, cloud_id, cloud_name } = jiraSettings;

    // Build JIRA API payload
    const payload = {
      fields: {
        project: { key: projectKey },
        summary: issueData.summary,
        issuetype: { name: issueData.issueType || 'Task' }
      }
    };

    // Add description (JIRA uses ADF format)
    if (issueData.description) {
      payload.fields.description = {
        type: 'doc',
        version: 1,
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: issueData.description
              }
            ]
          }
        ]
      };
    }

    // Add priority
    if (issueData.priority) {
      payload.fields.priority = { name: issueData.priority };
    }

    // Add assignee
    if (issueData.assigneeId) {
      payload.fields.assignee = { id: issueData.assigneeId };
    }

    // Add labels
    if (issueData.labels && issueData.labels.length > 0) {
      payload.fields.labels = issueData.labels;
    }

    // Add due date
    if (issueData.dueDate) {
      payload.fields.duedate = issueData.dueDate;
    }

    // Add epic link (if provided)
    if (issueData.epicKey) {
      payload.fields.parent = { key: issueData.epicKey };
    }

    // Add sprint (if provided)
    if (issueData.sprintId) {
      // Sprint is added via a custom field, typically customfield_10020
      payload.fields.customfield_10020 = issueData.sprintId;
    }

    // Add story points (if provided)
    if (issueData.storyPoints) {
      // Story points custom field, typically customfield_10016
      payload.fields.customfield_10016 = issueData.storyPoints;
    }

    console.log('Creating JIRA issue:', {
      projectKey,
      summary: issueData.summary,
      issueType: issueData.issueType
    });

    // Call JIRA API to create issue
    const jiraResponse = await fetch(
      `https://api.atlassian.com/ex/jira/${cloud_id}/rest/api/3/issue`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      }
    );

    if (!jiraResponse.ok) {
      const errorText = await jiraResponse.text();
      console.error('JIRA API error:', errorText);
      return res.status(jiraResponse.status).json({
        success: false,
        error: `JIRA API error: ${errorText}`
      });
    }

    const result = await jiraResponse.json();

    console.log('JIRA issue created:', {
      issueKey: result.key,
      issueId: result.id
    });

    return res.status(200).json({
      success: true,
      issueKey: result.key,
      issueId: result.id,
      url: `https://${cloud_name}.atlassian.net/browse/${result.key}`
    });

  } catch (error) {
    console.error('Create JIRA issue error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

