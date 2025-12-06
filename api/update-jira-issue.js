/**
 * Update JIRA Issue
 * Updates an existing JIRA issue with new field values
 */

const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, issueKey, updates } = req.body;

    if (!userId || !issueKey || !updates) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user's JIRA settings
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('integration_settings')
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      return res.status(404).json({ error: 'User not found' });
    }

    const jiraSettings = userData?.integration_settings?.jira;
    if (!jiraSettings || !jiraSettings.access_token) {
      return res.status(401).json({ error: 'JIRA not connected' });
    }

    const { access_token, cloud_id } = jiraSettings;

    // Build JIRA API update payload
    const fields = {};

    if (updates.summary) {
      fields.summary = updates.summary;
    }

    if (updates.description !== undefined) {
      // Convert description to ADF format if it's a plain string
      if (typeof updates.description === 'string') {
        fields.description = {
          type: 'doc',
          version: 1,
          content: [
            {
              type: 'paragraph',
              content: [
                {
                  type: 'text',
                  text: updates.description
                }
              ]
            }
          ]
        };
      } else {
        // Assume it's already in ADF format
        fields.description = updates.description;
      }
    }

    if (updates.priority) {
      fields.priority = { name: updates.priority };
    }

    if (updates.assignee !== undefined) {
      // Handle assignee - if it's empty, set to null (unassigned)
      // If it's provided, assume it's an accountId
      if (!updates.assignee || updates.assignee === '' || updates.assignee === 'Unassigned') {
        fields.assignee = null;
      } else {
        fields.assignee = { accountId: updates.assignee };
      }
    }

    if (updates.dueDate !== undefined) {
      fields.duedate = updates.dueDate || null;
    }

    if (updates.labels) {
      fields.labels = updates.labels;
    }

    // Update issue via JIRA API
    const updateResponse = await axios.put(
      `https://api.atlassian.com/ex/jira/${cloud_id}/rest/api/3/issue/${issueKey}`,
      { fields },
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Handle special fields that require separate API calls

    // Update story points (custom field)
    if (updates.storyPoints !== undefined) {
      try {
        // Try common story points field IDs
        const storyPointsFields = ['customfield_10016', 'customfield_10026', 'customfield_10002'];
        for (const fieldId of storyPointsFields) {
          try {
            await axios.put(
              `https://api.atlassian.com/ex/jira/${cloud_id}/rest/api/3/issue/${issueKey}`,
              {
                fields: {
                  [fieldId]: updates.storyPoints ? parseFloat(updates.storyPoints) : null
                }
              },
              {
                headers: {
                  'Authorization': `Bearer ${access_token}`,
                  'Content-Type': 'application/json'
                }
              }
            );
            break; // Success, exit loop
          } catch (err) {
            // Try next field ID
            continue;
          }
        }
      } catch (err) {
        console.error('Failed to update story points:', err.message);
      }
    }

    // Update sprint
    if (updates.sprintId !== undefined) {
      try {
        if (updates.sprintId) {
          // Add to sprint using Agile API
          await axios.post(
            `https://api.atlassian.com/ex/jira/${cloud_id}/rest/agile/1.0/sprint/${updates.sprintId}/issue`,
            {
              issues: [issueKey]
            },
            {
              headers: {
                'Authorization': `Bearer ${access_token}`,
                'Content-Type': 'application/json'
              }
            }
          );
        } else {
          // Remove from sprint by setting custom field to null
          // Try common sprint field IDs
          const sprintFields = ['customfield_10020', 'customfield_10010', 'customfield_10011'];
          for (const fieldId of sprintFields) {
            try {
              await axios.put(
                `https://api.atlassian.com/ex/jira/${cloud_id}/rest/api/3/issue/${issueKey}`,
                {
                  fields: {
                    [fieldId]: null
                  }
                },
                {
                  headers: {
                    'Authorization': `Bearer ${access_token}`,
                    'Content-Type': 'application/json'
                  }
                }
              );
              break; // Success, exit loop
            } catch (err) {
              // Try next field ID
              continue;
            }
          }
        }
      } catch (err) {
        console.error('Failed to update sprint:', err.response?.data || err.message);
      }
    }

    // Update epic link
    if (updates.epicKey !== undefined) {
      try {
        // Try common epic link field IDs
        const epicLinkFields = ['customfield_10014', 'customfield_10008'];
        for (const fieldId of epicLinkFields) {
          try {
            await axios.put(
              `https://api.atlassian.com/ex/jira/${cloud_id}/rest/api/3/issue/${issueKey}`,
              {
                fields: {
                  [fieldId]: updates.epicKey || null
                }
              },
              {
                headers: {
                  'Authorization': `Bearer ${access_token}`,
                  'Content-Type': 'application/json'
                }
              }
            );
            break; // Success, exit loop
          } catch (err) {
            // Try next field ID
            continue;
          }
        }
      } catch (err) {
        console.error('Failed to update epic link:', err.message);
      }
    }

    // Update issue type
    if (updates.issueType) {
      try {
        await axios.put(
          `https://api.atlassian.com/ex/jira/${cloud_id}/rest/api/3/issue/${issueKey}`,
          {
            fields: {
              issuetype: { name: updates.issueType }
            }
          },
          {
            headers: {
              'Authorization': `Bearer ${access_token}`,
              'Content-Type': 'application/json'
            }
          }
        );
      } catch (err) {
        console.error('Failed to update issue type:', err.message);
      }
    }

    return res.status(200).json({
      success: true,
      issueKey,
      message: 'Issue updated successfully'
    });

  } catch (error) {
    console.error('❌ Update JIRA issue error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      issueKey: req.body?.issueKey,
      updates: req.body?.updates
    });
    return res.status(500).json({
      success: false,
      error: error.response?.data?.errorMessages?.[0] || error.response?.data?.message || error.message || 'Failed to update issue',
      details: error.response?.data
    });
  }
};

