/**
 * Send Email via Microsoft Graph API
 */

const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Max-Age', '86400');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, to, subject, body, isHtml = false, attachments = [] } = req.body;

  if (!userId || !to || !subject || !body) {
    return res.status(400).json({ error: 'Missing required fields: userId, to, subject, body' });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get user's Microsoft tokens
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('integration_settings')
      .eq('id', userId)
      .single();

    if (userError || !userData?.integration_settings?.microsoft?.access_token) {
      return res.status(401).json({ error: 'Microsoft not connected or access token missing' });
    }

    let accessToken = userData.integration_settings.microsoft.access_token;
    const refreshToken = userData.integration_settings.microsoft.refresh_token;

    // Check if token is expired and refresh if needed
    const tokenExpiry = new Date(userData.integration_settings.microsoft.token_expiry);
    if (tokenExpiry < new Date() && refreshToken) {
      console.log('Microsoft token expired, refreshing...');
      try {
        const refreshResponse = await axios.post(
          'https://login.microsoftonline.com/common/oauth2/v2.0/token',
          new URLSearchParams({
            client_id: process.env.MICROSOFT_CLIENT_ID,
            client_secret: process.env.MICROSOFT_CLIENT_SECRET,
            refresh_token: refreshToken,
            grant_type: 'refresh_token',
            scope: 'openid email profile offline_access Mail.Send'
          }),
          {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
          }
        );

        accessToken = refreshResponse.data.access_token;

        // Update tokens in database
        const integrationSettings = userData.integration_settings;
        integrationSettings.microsoft.access_token = accessToken;
        if (refreshResponse.data.refresh_token) {
          integrationSettings.microsoft.refresh_token = refreshResponse.data.refresh_token;
        }
        integrationSettings.microsoft.token_expiry = new Date(Date.now() + (refreshResponse.data.expires_in * 1000)).toISOString();

        await supabase
          .from('users')
          .update({ integration_settings: integrationSettings })
          .eq('id', userId);

        console.log('Microsoft token refreshed successfully');
      } catch (refreshError) {
        console.error('Failed to refresh Microsoft token:', refreshError.response?.data || refreshError.message);
        return res.status(401).json({ error: 'Failed to refresh Microsoft token. Please reconnect Microsoft.' });
      }
    }

    // Build the email message for Microsoft Graph API
    const recipients = (Array.isArray(to) ? to : [to]).map(email => ({
      emailAddress: { address: email.trim() }
    }));

    const emailMessage = {
      message: {
        subject: subject,
        body: {
          contentType: isHtml ? 'HTML' : 'Text',
          content: body
        },
        toRecipients: recipients
      },
      saveToSentItems: true
    };

    // Add attachments if any
    if (attachments.length > 0) {
      emailMessage.message.attachments = attachments.map(att => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: att.filename,
        contentType: att.contentType || 'application/octet-stream',
        contentBytes: att.content // Already base64 encoded
      }));
    }

    // Send the email via Microsoft Graph API
    const sendResponse = await axios.post(
      'https://graph.microsoft.com/v1.0/me/sendMail',
      emailMessage,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Email sent successfully via Microsoft');

    return res.status(200).json({
      success: true,
      message: 'Email sent successfully'
    });

  } catch (error) {
    console.error('Send email via Microsoft error:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: error.response?.data?.error?.message || error.message
    });
  }
};

