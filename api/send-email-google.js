/**
 * Send Email via Google Gmail API
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

    // Get user's Google tokens
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('integration_settings')
      .eq('id', userId)
      .single();

    if (userError || !userData?.integration_settings?.google?.access_token) {
      return res.status(401).json({ error: 'Google not connected or access token missing' });
    }

    let accessToken = userData.integration_settings.google.access_token;
    const refreshToken = userData.integration_settings.google.refresh_token;

    // Check if token is expired and refresh if needed
    const tokenExpiry = new Date(userData.integration_settings.google.token_expiry);
    if (tokenExpiry < new Date() && refreshToken) {
      console.log('Google token expired, refreshing...');
      try {
        const refreshResponse = await axios.post('https://oauth2.googleapis.com/token', {
          client_id: process.env.GOOGLE_CLIENT_ID,
          client_secret: process.env.GOOGLE_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: 'refresh_token'
        });

        accessToken = refreshResponse.data.access_token;

        // Update tokens in database
        const integrationSettings = userData.integration_settings;
        integrationSettings.google.access_token = accessToken;
        integrationSettings.google.token_expiry = new Date(Date.now() + (refreshResponse.data.expires_in * 1000)).toISOString();

        await supabase
          .from('users')
          .update({ integration_settings: integrationSettings })
          .eq('id', userId);

        console.log('Google token refreshed successfully');
      } catch (refreshError) {
        console.error('Failed to refresh Google token:', refreshError.response?.data || refreshError.message);
        return res.status(401).json({ error: 'Failed to refresh Google token. Please reconnect Google.' });
      }
    }

    // Build the email message
    const recipients = Array.isArray(to) ? to.join(', ') : to;
    const boundary = '----=_Part_' + Date.now().toString(36);
    
    let emailContent = '';
    
    if (attachments.length > 0) {
      // Multipart email with attachments
      emailContent = [
        `To: ${recipients}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        `Content-Type: multipart/mixed; boundary="${boundary}"`,
        '',
        `--${boundary}`,
        `Content-Type: ${isHtml ? 'text/html' : 'text/plain'}; charset="UTF-8"`,
        'Content-Transfer-Encoding: 7bit',
        '',
        body,
      ];

      // Add attachments
      for (const attachment of attachments) {
        if (attachment.content) {
          emailContent.push(
            `--${boundary}`,
            `Content-Type: ${attachment.contentType || 'application/octet-stream'}; name="${attachment.filename}"`,
            'Content-Transfer-Encoding: base64',
            `Content-Disposition: attachment; filename="${attachment.filename}"`,
            '',
            attachment.content // Already base64 encoded
          );
        }
      }

      emailContent.push(`--${boundary}--`);
      emailContent = emailContent.join('\r\n');
    } else {
      // Simple email without attachments
      emailContent = [
        `To: ${recipients}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        `Content-Type: ${isHtml ? 'text/html' : 'text/plain'}; charset="UTF-8"`,
        '',
        body
      ].join('\r\n');
    }

    // Encode the email in base64url format
    const encodedEmail = Buffer.from(emailContent)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Send the email via Gmail API
    const sendResponse = await axios.post(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      { raw: encodedEmail },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('Email sent successfully via Gmail:', sendResponse.data.id);

    return res.status(200).json({
      success: true,
      messageId: sendResponse.data.id,
      threadId: sendResponse.data.threadId
    });

  } catch (error) {
    console.error('Send email via Google error:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: error.response?.data?.error?.message || error.message
    });
  }
};

