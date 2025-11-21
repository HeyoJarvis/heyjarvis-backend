/**
 * Google OAuth Callback Handler
 * Handles OAuth callback from Google and redirects back to desktop app
 */

const axios = require('axios');

module.exports = async (req, res) => {
  try {
    const { code, error } = req.query;
    
    // Handle OAuth errors
    if (error) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Google Authentication Failed</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .container { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; }
            h1 { color: #d93025; }
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

    console.log('🔐 Google OAuth callback received, exchanging code for tokens...');
    
    // Debug: Log environment variables (without secrets)
    console.log('Environment check:', {
      hasClientId: !!process.env.GOOGLE_CLIENT_ID,
      clientIdPrefix: process.env.GOOGLE_CLIENT_ID?.substring(0, 20),
      hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      vercelUrl: process.env.VERCEL_URL,
      host: req.headers.host
    });

    // Get the redirect URI - use the actual host from the request
    const redirectUri = `https://${req.headers.host}/api/auth-google`;
    
    console.log('Token exchange params:', {
      redirectUri,
      hasCode: !!code,
      codeLength: code?.length
    });

    // Exchange code for tokens
    const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      code: code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code'
    });

    const tokens = tokenResponse.data;
    console.log('✅ Tokens received from Google');

    // Get user info
    const userResponse = await axios.get('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${tokens.access_token}` }
    });

    const userData = userResponse.data;
    console.log('✅ User info retrieved:', { email: userData.email });

    // Extract user_id from state parameter
    let appUserId = null;
    if (req.query.state) {
      try {
        const stateData = JSON.parse(Buffer.from(req.query.state, 'base64url').toString('utf-8'));
        appUserId = stateData.user_id;
        console.log('✅ Extracted user_id from state:', appUserId);
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

    console.log('💾 Saving Google tokens to Supabase for user:', appUserId);

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

    // Update integration settings with Google tokens
    const integrationSettings = currentUser?.integration_settings || {};
    integrationSettings.google = {
      authenticated: true,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token || null,
      token_expiry: new Date(Date.now() + (tokens.expires_in * 1000)).toISOString(),
      email: userData.email,
      name: userData.name || '',
      picture: userData.picture || '',
      google_user_id: userData.id,
      connected_at: new Date().toISOString()
    };

    const { error: updateError } = await supabase
      .from('users')
      .update({ integration_settings: integrationSettings })
      .eq('id', appUserId);

    if (updateError) {
      console.error('❌ Failed to save tokens:', updateError);
      throw new Error('Failed to save Google tokens');
    }

    console.log('✅ Google tokens saved to Supabase successfully');

    // Show success page (no redirect needed - desktop app is polling)
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Google Connected</title>
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; 
            text-align: center; 
            padding: 50px; 
            background: linear-gradient(135deg, #4285F4 0%, #34A853 100%);
            color: white;
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container { 
            background: white; 
            color: #202124;
            padding: 40px; 
            border-radius: 12px; 
            box-shadow: 0 8px 24px rgba(0,0,0,0.2); 
            max-width: 500px;
          }
          h1 { color: #4285F4; margin-top: 0; }
          .spinner { 
            border: 4px solid #f3f3f3; 
            border-top: 4px solid #4285F4; 
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
            background: #F1F3F4; 
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
            <circle cx="26" cy="26" r="25" fill="none" stroke="#4285F4" stroke-width="2"/>
            <path fill="none" stroke="#4285F4" stroke-width="3" d="M14.1 27.2l7.1 7.2 16.7-16.8"/>
          </svg>
          <h1>✅ Google Connected!</h1>
          <div class="user">
            <strong>${userData.name || userData.email}</strong>
          </div>
          <p style="color: #5F6368; margin-top: 20px;">Return to HeyJarvis to continue.</p>
          <p style="font-size: 12px; color: #80868B;">You can close this window now.</p>
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
    console.error('❌ Google OAuth error:', {
      message: error.message,
      response: error.response?.data,
      status: error.response?.status,
      stack: error.stack
    });
    
    const errorDetails = error.response?.data 
      ? JSON.stringify(error.response.data, null, 2)
      : error.message;
    
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Google Authentication Error</title>
        <style>
          body { font-family: Arial; text-align: center; padding: 50px; background: #f5f5f5; }
          .container { background: white; padding: 40px; border-radius: 8px; max-width: 600px; margin: 0 auto; }
          h1 { color: #d93025; }
          .error { background: #FCE8E6; padding: 15px; border-radius: 6px; margin: 20px 0; text-align: left; }
          pre { background: #f5f5f5; padding: 10px; border-radius: 4px; overflow-x: auto; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>❌ Authentication Failed</h1>
          <div class="error">
            <strong>Error:</strong>
            <pre>${errorDetails}</pre>
          </div>
          <p>Please close this window and check the Vercel logs for more details.</p>
        </div>
      </body>
      </html>
    `);
  }
};

