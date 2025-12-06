/**
 * JIRA Create Issue API Endpoint
 * Creates a new JIRA issue via the JIRA REST API
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

    // Get valid JIRA token (refreshes if needed)
    const { access_token, cloud_id, cloud_name } = await ensureValidJiraToken(userId);

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

    console.log('Creating JIRA issue:', {
      projectKey,
      summary: issueData.summary,
      issueType: issueData.issueType,
      payload: JSON.stringify(payload, null, 2)
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

    // Set story points AFTER creation (custom field varies by JIRA instance)
    if (issueData.storyPoints !== undefined && issueData.storyPoints !== null && issueData.storyPoints !== '') {
      const storyPointFieldIds = ['customfield_10016', 'customfield_10020', 'customfield_10026'];
      for (const fieldId of storyPointFieldIds) {
        try {
          const updateResponse = await fetch(
            `https://api.atlassian.com/ex/jira/${cloud_id}/rest/api/3/issue/${result.key}`,
            {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${access_token}`,
                'Accept': 'application/json',
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                fields: {
                  [fieldId]: parseFloat(issueData.storyPoints)
                }
              })
            }
          );
          if (updateResponse.ok) {
            console.log('Story points set successfully with field:', fieldId);
            break;
          }
        } catch (err) {
          console.log('Failed to set story points with', fieldId, ':', err.message);
        }
      }
    }

    // Add to sprint AFTER creation
    // Try both Agile API and custom field approach
    if (issueData.sprintId) {
      let sprintSet = false;
      
      // Try Agile API first
      try {
        const sprintResponse = await fetch(
          `https://api.atlassian.com/ex/jira/${cloud_id}/rest/agile/1.0/sprint/${issueData.sprintId}/issue`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${access_token}`,
              'Accept': 'application/json',
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              issues: [result.key]
            })
          }
        );
        if (sprintResponse.ok) {
          console.log('✅ Issue added to sprint via Agile API:', issueData.sprintId);
          sprintSet = true;
        } else {
          const errorText = await sprintResponse.text();
          console.log('❌ Agile API failed:', sprintResponse.status, errorText);
        }
      } catch (sprintErr) {
        console.log('❌ Agile API error:', sprintErr.message);
      }
      
      // If Agile API failed, try setting sprint via custom field
      if (!sprintSet) {
        const sprintFieldIds = ['customfield_10020', 'customfield_10010', 'customfield_10011'];
        for (const fieldId of sprintFieldIds) {
          try {
            const updateResponse = await fetch(
              `https://api.atlassian.com/ex/jira/${cloud_id}/rest/api/3/issue/${result.key}`,
              {
                method: 'PUT',
                headers: {
                  'Authorization': `Bearer ${access_token}`,
                  'Accept': 'application/json',
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  fields: {
                    [fieldId]: parseInt(issueData.sprintId)
                  }
                })
              }
            );
            if (updateResponse.ok) {
              console.log('✅ Sprint set via custom field:', fieldId);
              sprintSet = true;
              break;
            } else {
              const errorText = await updateResponse.text();
              console.log(`❌ Failed to set sprint with ${fieldId}:`, errorText);
            }
          } catch (err) {
            console.log(`❌ Error setting sprint with ${fieldId}:`, err.message);
          }
        }
      }
      
      if (!sprintSet) {
        console.log('⚠️ Warning: Could not set sprint. Issue created but not added to sprint.');
      }
    }

    return res.status(200).json({
      success: true,
      issueKey: result.key,
      issueId: result.id,
      url: `https://${cloud_name || 'atlassian'}.atlassian.net/browse/${result.key}`
    });

  } catch (error) {
    console.error('Create JIRA issue error:', error);
    return res.status(500).json({
      success: false,
      error: error.message
    });
  }
};
