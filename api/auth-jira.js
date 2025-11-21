/**
 * JIRA OAuth Callback Handler
 * Handles OAuth callback from Atlassian and redirects back to desktop app
 */

const axios = require('axios');
const oauthStore = require('../lib/oauth-store');

module.exports = async (req, res) => {
  try {
    const { code, state, error } = req.query;
    
    // Handle OAuth errors
    if (error) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>JIRA Authentication Failed</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .container { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; }
            h1 { color: #de350b; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ Authentication Failed</h1>
            <p>Error: ${error}</p>
            <p>Please close this window and try again.</p>
          </div>
        </body>
        </html>
      `);
    }
    
    if (!code) {
      return res.status(400).send('Missing authorization code');
    }

    console.log('🔐 JIRA OAuth callback received, exchanging code for tokens...');

    // Get the redirect URI - use the actual host from the request
    const redirectUri = `https://${req.headers.host}/api/auth-jira`;
    
    // Extract code_verifier from state parameter (PKCE)
    let codeVerifier = null;
    if (state) {
      try {
        const stateData = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
        codeVerifier = stateData.code_verifier;
        console.log('✅ Extracted code_verifier from state');
      } catch (err) {
        console.error('❌ Failed to parse state:', err.message);
      }
    }
    
    if (!codeVerifier) {
      throw new Error('Missing code_verifier in state parameter. PKCE is required for JIRA OAuth.');
    }
    
    console.log('Token exchange params:', {
      redirectUri,
      hasCode: !!code,
      hasCodeVerifier: !!codeVerifier
    });

    // Exchange code for tokens (with PKCE)
    const tokenResponse = await axios.post('https://auth.atlassian.com/oauth/token', {
      grant_type: 'authorization_code',
      client_id: process.env.JIRA_CLIENT_ID,
      client_secret: process.env.JIRA_CLIENT_SECRET,
      code: code,
      redirect_uri: redirectUri,
      code_verifier: codeVerifier
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    const tokens = tokenResponse.data;
    console.log('✅ Tokens received from Atlassian');

    // Get accessible resources (cloud IDs)
    const resourcesResponse = await axios.get('https://api.atlassian.com/oauth/token/accessible-resources', {
      headers: { 
        Authorization: `Bearer ${tokens.access_token}`,
        Accept: 'application/json'
      }
    });

    const resource = resourcesResponse.data[0];
    if (!resource) {
      throw new Error('No accessible JIRA resources found');
    }

    const cloudId = resource.id;
    const siteUrl = resource.url;

    console.log('✅ JIRA site info retrieved:', { cloudId, siteUrl });

    // Extract user_id and session_id from state
    let userId = null;
    let sessionId = 'default';
    if (state) {
      try {
        const stateData = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
        userId = stateData.user_id;
        sessionId = stateData.session_id || 'default';
        console.log('✅ Extracted from state:', { userId, sessionId });
      } catch (err) {
        console.error('❌ Could not extract data from state:', err.message);
      }
    }

    if (!userId) {
      throw new Error('Missing user_id in OAuth state');
    }

    // Save tokens directly to Supabase
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    console.log('💾 Saving JIRA tokens to Supabase for user:', userId);

    // Get current integration settings
    const { data: userData, error: fetchError } = await supabase
      .from('users')
      .select('integration_settings')
      .eq('id', userId)
      .single();

    if (fetchError) {
      console.error('❌ Failed to fetch user:', fetchError);
      throw new Error('Failed to fetch user data');
    }

    // Update integration settings with JIRA tokens
    const integrationSettings = userData?.integration_settings || {};
    integrationSettings.jira = {
      authenticated: true,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry: new Date(Date.now() + (tokens.expires_in * 1000)).toISOString(),
      cloud_id: cloudId,
      site_url: siteUrl,
      connected_at: new Date().toISOString()
    };

    const { error: updateError } = await supabase
      .from('users')
      .update({ integration_settings: integrationSettings })
      .eq('id', userId);

    if (updateError) {
      console.error('❌ Failed to save tokens:', updateError);
      throw new Error('Failed to save JIRA tokens');
    }

    console.log('✅ JIRA tokens saved to Supabase successfully');

    // Show success page
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>JIRA Connected</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; 
            text-align: center; 
            padding: 50px; 
            background: linear-gradient(135deg, #0052CC 0%, #0065FF 100%);
            color: white;
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container { 
            background: white; 
            color: #172B4D;
            padding: 40px; 
            border-radius: 12px; 
            box-shadow: 0 8px 24px rgba(0,0,0,0.2); 
            max-width: 500px;
          }
          h1 { color: #0052CC; margin-top: 0; }
          .checkmark {
            width: 80px;
            height: 80px;
            margin: 0 auto 20px;
          }
          .checkmark-circle {
            stroke-dasharray: 166;
            stroke-dashoffset: 166;
            stroke-width: 2;
            stroke-miterlimit: 10;
            stroke: #0052CC;
            fill: none;
            animation: stroke 0.6s cubic-bezier(0.65, 0, 0.45, 1) forwards;
          }
          .checkmark-check {
            transform-origin: 50% 50%;
            stroke-dasharray: 48;
            stroke-dashoffset: 48;
            animation: stroke 0.3s cubic-bezier(0.65, 0, 0.45, 1) 0.8s forwards;
          }
          @keyframes stroke {
            100% { stroke-dashoffset: 0; }
          }
          .site { 
            background: #F4F5F7; 
            padding: 10px; 
            border-radius: 6px; 
            margin: 20px 0;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52">
            <circle class="checkmark-circle" cx="26" cy="26" r="25" fill="none"/>
            <path class="checkmark-check" fill="none" stroke="#0052CC" stroke-width="3" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
          </svg>
          <h1>JIRA Connected!</h1>
          <div class="site">
            <strong>Site:</strong> ${siteUrl}
          </div>
          <p style="color: #42526E; margin-top: 20px;">Return to HeyJarvis to continue.</p>
          <p style="font-size: 12px; color: #6B778C;">You can close this window now.</p>
        </div>
        <script>
          // Auto-close after 3 seconds
          setTimeout(() => {
            window.close();
          }, 3000);
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    console.error('❌ JIRA OAuth error:', error.response?.data || error.message);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>JIRA Authentication Error</title>
        <style>
          body { font-family: Arial; text-align: center; padding: 50px; background: #f5f5f5; }
          .container { background: white; padding: 40px; border-radius: 8px; max-width: 500px; margin: 0 auto; }
          h1 { color: #de350b; }
          .error { background: #FFEBE6; padding: 15px; border-radius: 6px; margin: 20px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>❌ Authentication Failed</h1>
          <div class="error">
            <strong>Error:</strong> ${error.message}
          </div>
          <p>Please close this window and try again.</p>
        </div>
      </body>
      </html>
    `);
  }
};


