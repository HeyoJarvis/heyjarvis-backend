/**
 * Microsoft OAuth Callback Handler
 * Handles OAuth callback from Microsoft and redirects back to desktop app
 */

const axios = require('axios');

module.exports = async (req, res) => {
  try {
    const { code, error, error_description } = req.query;
    
    // Handle OAuth errors
    if (error) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Microsoft Authentication Failed</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .container { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; }
            h1 { color: #d13438; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ Authentication Failed</h1>
            <p>${error_description || error}</p>
            <p>Please close this window and try again.</p>
          </div>
        </body>
        </html>
      `);
    }
    
    if (!code) {
      return res.status(400).send('Missing authorization code');
    }


    // Get the redirect URI - use the actual host from the request
    const redirectUri = `https://${req.headers.host}/api/auth-microsoft`;
    
    // Extract code_verifier from state parameter (PKCE)
    let codeVerifier = null;
    if (req.query.state) {
      try {
        const stateData = JSON.parse(Buffer.from(req.query.state, 'base64url').toString('utf-8'));
        codeVerifier = stateData.code_verifier;
      } catch (err) {
        console.error('❌ Failed to parse state:', err.message);
      }
    }

    if (!codeVerifier) {
      throw new Error('Missing code_verifier in state parameter. PKCE is required for Microsoft OAuth.');
    }
    

    // Exchange code for tokens (with PKCE)
    const tokenResponse = await axios.post(
      'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      new URLSearchParams({
        client_id: process.env.MICROSOFT_CLIENT_ID,
        client_secret: process.env.MICROSOFT_CLIENT_SECRET,
        code: code,
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier
      }),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    const tokens = tokenResponse.data;

    // Get user info
    const userResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });

    const userData = userResponse.data;

    // Extract user_id from state parameter
    let appUserId = null;
    if (req.query.state) {
      try {
        const stateData = JSON.parse(Buffer.from(req.query.state, 'base64url').toString('utf-8'));
        appUserId = stateData.user_id;
      } catch (err) {
        console.error('❌ Could not extract user_id from state:', err.message);
      }
    }

    if (!appUserId) {
      throw new Error('Missing user_id in OAuth state');
    }

    // Save tokens directly to Supabase
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );


    // Get current integration settings
    const { data: currentUser, error: fetchError } = await supabase
      .from('users')
      .select('integration_settings')
      .eq('id', appUserId)
      .single();

    if (fetchError) {
      console.error('❌ Failed to fetch user:', fetchError);
      throw new Error('Failed to fetch user data');
    }

    // Update integration settings with Microsoft tokens
    const integrationSettings = currentUser?.integration_settings || {};
    integrationSettings.microsoft = {
      authenticated: true,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry: new Date(Date.now() + (tokens.expires_in * 1000)).toISOString(),
      scope: tokens.scope, // Save granted scopes
      email: userData.mail || userData.userPrincipalName,
      name: userData.displayName || '',
      microsoft_user_id: userData.id,
      connected_at: new Date().toISOString()
    };

    const { error: updateError } = await supabase
      .from('users')
      .update({ integration_settings: integrationSettings })
      .eq('id', appUserId);

    if (updateError) {
      console.error('❌ Failed to save tokens:', updateError);
      throw new Error('Failed to save Microsoft tokens');
    }


    // Show success page (no redirect needed - desktop app is polling)
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Microsoft Connected</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; 
            text-align: center; 
            padding: 50px; 
            background: linear-gradient(135deg, #0078D4 0%, #00BCF2 100%);
            color: white;
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container { 
            background: white; 
            color: #323130;
            padding: 40px; 
            border-radius: 12px; 
            box-shadow: 0 8px 24px rgba(0,0,0,0.2); 
            max-width: 500px;
          }
          h1 { color: #0078D4; margin-top: 0; }
          .spinner { 
            border: 4px solid #f3f3f3; 
            border-top: 4px solid #0078D4; 
            border-radius: 50%; 
            width: 40px; 
            height: 40px; 
            animation: spin 1s linear infinite; 
            margin: 20px auto;
          }
          @keyframes spin { 
            0% { transform: rotate(0deg); } 
            100% { transform: rotate(360deg); } 
          }
          .user { 
            background: #F3F2F1; 
            padding: 10px; 
            border-radius: 6px; 
            margin: 20px 0;
            font-size: 14px;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <svg class="checkmark" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 52 52" style="width: 80px; height: 80px; margin: 0 auto 20px;">
            <circle cx="26" cy="26" r="25" fill="none" stroke="#0078D4" stroke-width="2"/>
            <path fill="none" stroke="#0078D4" stroke-width="3" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
          </svg>
          <h1>✅ Microsoft Connected!</h1>
          <div class="user">
            <strong>${userData.displayName || userData.mail}</strong>
          </div>
          <p style="color: #605E5C; margin-top: 20px;">Return to HeyJarvis to continue.</p>
          <p style="font-size: 12px; color: #8A8886;">You can close this window now.</p>
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
    console.error('❌ Microsoft OAuth error:', error.response?.data || error.message);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Microsoft Authentication Error</title>
        <style>
          body { font-family: Arial; text-align: center; padding: 50px; background: #f5f5f5; }
          .container { background: white; padding: 40px; border-radius: 8px; max-width: 500px; margin: 0 auto; }
          h1 { color: #d13438; }
          .error { background: #FDE7E9; padding: 15px; border-radius: 6px; margin: 20px 0; }
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


