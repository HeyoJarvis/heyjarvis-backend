/**
 * Send Email via Google Gmail or Microsoft Graph API
 * Unified endpoint - use 'service' param: 'google' or 'microsoft'
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
    res.status(200);
    return res.end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, to, subject, body, isHtml = false, attachments = [], service = 'google' } = req.body;

  if (!userId || !to || !subject || !body) {
    return res.status(400).json({ error: 'Missing required fields: userId, to, subject, body' });
  }

  try {
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('integration_settings')
      .eq('id', userId)
      .single();

    if (userError) {
      return res.status(401).json({ error: 'User not found' });
    }

    if (service === 'microsoft') {
      return await sendViaMicrosoft(res, userData, userId, supabase, { to, subject, body, isHtml, attachments });
    } else {
      return await sendViaGoogle(res, userData, userId, supabase, { to, subject, body, isHtml, attachments });
    }

  } catch (error) {
    console.error('Send email error:', error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      error: error.response?.data?.error?.message || error.message
    });
  }
};

async function sendViaGoogle(res, userData, userId, supabase, { to, subject, body, isHtml, attachments }) {
  if (!userData?.integration_settings?.google?.access_token) {
    return res.status(401).json({ error: 'Google not connected or access token missing' });
  }

  let accessToken = userData.integration_settings.google.access_token;
  const refreshToken = userData.integration_settings.google.refresh_token;

  // Refresh token if expired
  const tokenExpiry = new Date(userData.integration_settings.google.token_expiry);
  if (tokenExpiry < new Date() && refreshToken) {
    try {
      const refreshResponse = await axios.post('https://oauth2.googleapis.com/token', {
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        refresh_token: refreshToken,
        grant_type: 'refresh_token'
      });

      accessToken = refreshResponse.data.access_token;
      const integrationSettings = userData.integration_settings;
      integrationSettings.google.access_token = accessToken;
      integrationSettings.google.token_expiry = new Date(Date.now() + (refreshResponse.data.expires_in * 1000)).toISOString();

      await supabase.from('users').update({ integration_settings: integrationSettings }).eq('id', userId);
    } catch (refreshError) {
      return res.status(401).json({ error: 'Failed to refresh Google token. Please reconnect Google.' });
    }
  }

  // Build email
  const recipients = Array.isArray(to) ? to.join(', ') : to;
  const boundary = '----=_Part_' + Date.now().toString(36);
  
  let emailContent = '';
  if (attachments.length > 0) {
    emailContent = [
      `To: ${recipients}`, `Subject: ${subject}`, 'MIME-Version: 1.0',
      `Content-Type: multipart/mixed; boundary="${boundary}"`, '',
      `--${boundary}`, `Content-Type: ${isHtml ? 'text/html' : 'text/plain'}; charset="UTF-8"`,
      'Content-Transfer-Encoding: 7bit', '', body,
    ];
    for (const att of attachments) {
      if (att.content) {
        emailContent.push(`--${boundary}`, `Content-Type: ${att.contentType || 'application/octet-stream'}; name="${att.filename}"`,
          'Content-Transfer-Encoding: base64', `Content-Disposition: attachment; filename="${att.filename}"`, '', att.content);
      }
    }
    emailContent.push(`--${boundary}--`);
    emailContent = emailContent.join('\r\n');
  } else {
    emailContent = [`To: ${recipients}`, `Subject: ${subject}`, 'MIME-Version: 1.0',
      `Content-Type: ${isHtml ? 'text/html' : 'text/plain'}; charset="UTF-8"`, '', body].join('\r\n');
  }

  const encodedEmail = Buffer.from(emailContent).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const sendResponse = await axios.post('https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
    { raw: encodedEmail }, { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } });

  return res.status(200).json({ success: true, messageId: sendResponse.data.id });
}

async function sendViaMicrosoft(res, userData, userId, supabase, { to, subject, body, isHtml, attachments }) {
  if (!userData?.integration_settings?.microsoft?.access_token) {
    return res.status(401).json({ error: 'Microsoft not connected or access token missing' });
  }

  let accessToken = userData.integration_settings.microsoft.access_token;
  const refreshToken = userData.integration_settings.microsoft.refresh_token;

  // Refresh token if expired
  const tokenExpiry = new Date(userData.integration_settings.microsoft.token_expiry);
  if (tokenExpiry < new Date() && refreshToken) {
    try {
      const refreshResponse = await axios.post('https://login.microsoftonline.com/common/oauth2/v2.0/token',
        new URLSearchParams({
          client_id: process.env.MICROSOFT_CLIENT_ID, client_secret: process.env.MICROSOFT_CLIENT_SECRET,
          refresh_token: refreshToken, grant_type: 'refresh_token', scope: 'openid email profile offline_access Mail.Send'
        }), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });

      accessToken = refreshResponse.data.access_token;
      const integrationSettings = userData.integration_settings;
      integrationSettings.microsoft.access_token = accessToken;
      if (refreshResponse.data.refresh_token) integrationSettings.microsoft.refresh_token = refreshResponse.data.refresh_token;
      integrationSettings.microsoft.token_expiry = new Date(Date.now() + (refreshResponse.data.expires_in * 1000)).toISOString();

      await supabase.from('users').update({ integration_settings: integrationSettings }).eq('id', userId);
    } catch (refreshError) {
      return res.status(401).json({ error: 'Failed to refresh Microsoft token. Please reconnect Microsoft.' });
    }
  }

  const recipients = (Array.isArray(to) ? to : [to]).map(email => ({ emailAddress: { address: email.trim() } }));
  const emailMessage = {
    message: { subject, body: { contentType: isHtml ? 'HTML' : 'Text', content: body }, toRecipients: recipients },
    saveToSentItems: true
  };

  if (attachments.length > 0) {
    emailMessage.message.attachments = attachments.map(att => ({
      '@odata.type': '#microsoft.graph.fileAttachment', name: att.filename,
      contentType: att.contentType || 'application/octet-stream', contentBytes: att.content
    }));
  }

  await axios.post('https://graph.microsoft.com/v1.0/me/sendMail', emailMessage,
    { headers: { 'Authorization': `Bearer ${accessToken}`, 'Content-Type': 'application/json' } });

  return res.status(200).json({ success: true, message: 'Email sent successfully' });
}

