/**
 * Slack OAuth Callback Handler
 * Handles OAuth callback from Slack and saves tokens directly to Supabase
 */

const axios = require('axios');

module.exports = async (req, res) => {
  try {
    const { code, state, error } = req.query;
    
    // Handle OAuth errors
    if (error) {
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Slack Authentication Failed</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .container { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; }
            h1 { color: #e01e5a; }
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

    console.log('🔐 Slack OAuth callback received, exchanging code for tokens...');

    // Get the redirect URI - use the actual host from the request
    const redirectUri = `https://${req.headers.host}/api/auth-slack`;
    
    // Extract user_id from state parameter
    let userId = null;
    if (state) {
      try {
        // Try to parse as base64url JSON first (new format)
        const stateData = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
        userId = stateData.user_id;
        console.log('📝 Extracted user_id from base64url state:', userId);
      } catch (err) {
        // If that fails, try regular base64 (in case encoding differs)
        try {
          const stateData = JSON.parse(Buffer.from(state, 'base64').toString('utf-8'));
          userId = stateData.user_id;
          console.log('📝 Extracted user_id from base64 state:', userId);
        } catch (err2) {
          // If both fail, treat it as a plain UUID (legacy format from desktop app)
          // Validate it looks like a UUID
          if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(state)) {
            userId = state;
            console.log('📝 Using state as plain user_id (legacy format):', userId);
          } else {
            console.error('❌ Invalid state parameter format:', state);
            return res.status(400).send(`
              <!DOCTYPE html>
              <html>
              <head>
                <title>Slack Authentication Failed</title>
                <style>
                  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
                  .container { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; }
                  h1 { color: #e01e5a; }
                </style>
              </head>
              <body>
                <div class="container">
                  <h1>❌ Authentication Failed</h1>
                  <p>Invalid state parameter format</p>
                  <p>Please close this window and try again.</p>
                </div>
              </body>
              </html>
            `);
          }
        }
      }
    }

    if (!userId) {
      console.error('❌ No user_id found in state parameter');
      return res.status(400).send(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Slack Authentication Failed</title>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
            .container { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; }
            h1 { color: #e01e5a; }
          </style>
        </head>
        <body>
          <div class="container">
            <h1>❌ Authentication Failed</h1>
            <p>Missing user_id in state</p>
            <p>Please close this window and try again.</p>
          </div>
        </body>
        </html>
      `);
    }

    // Exchange code for tokens
    console.log('🔄 Exchanging code for Slack tokens...');
    const tokenResponse = await axios.post('https://slack.com/api/oauth.v2.access', null, {
      params: {
        client_id: process.env.SLACK_CLIENT_ID,
        client_secret: process.env.SLACK_CLIENT_SECRET,
        code: code,
        redirect_uri: redirectUri
      },
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
      }
    });

    const tokenData = tokenResponse.data;
    
    if (!tokenData.ok) {
      console.error('❌ Slack token exchange failed:', tokenData.error);
      throw new Error(`Token exchange failed: ${tokenData.error}`);
    }

    console.log('✅ Slack token exchange successful');
    console.log('📦 Token response summary:');
    console.log('   - authed_user.access_token:', tokenData.authed_user?.access_token ? `${tokenData.authed_user.access_token.substring(0, 10)}... (USER TOKEN)` : 'NOT PROVIDED');
    console.log('   - access_token:', tokenData.access_token ? `${tokenData.access_token.substring(0, 10)}... (BOT TOKEN)` : 'NOT PROVIDED');
    console.log('   - authed_user.scope:', tokenData.authed_user?.scope || 'NOT PROVIDED');
    console.log('   - scope:', tokenData.scope || 'NOT PROVIDED');

    // Extract token information - save BOTH user and bot tokens
    // User token (xoxp-*) is needed for search:read scope
    // Bot token (xoxb-*) is used for channel access and messaging
    const userAccessToken = tokenData.authed_user?.access_token;
    const botAccessToken = tokenData.access_token;
    // Prefer user token for general access, fall back to bot token
    const accessToken = userAccessToken || botAccessToken;
    
    const teamId = tokenData.team?.id;
    const teamName = tokenData.team?.name;
    const slackUserId = tokenData.authed_user?.id || tokenData.user_id;
    const userScopes = tokenData.authed_user?.scope?.split(',') || [];
    const botScopes = tokenData.scope?.split(',') || [];
    const scopes = [...new Set([...userScopes, ...botScopes])];

    if (!accessToken) {
      console.error('❌ No access token in Slack response');
      console.error('Full response:', JSON.stringify(tokenData, null, 2));
      throw new Error('No access token received from Slack');
    }

    // Get user info from Slack
    console.log('👤 Fetching Slack user info...');
    const userInfoResponse = await axios.get('https://slack.com/api/users.info', {
      params: { user: slackUserId },
      headers: { 'Authorization': `Bearer ${accessToken}` }
    });

    const userInfo = userInfoResponse.data;
    const realName = userInfo.user?.real_name || 'Unknown';
    const email = userInfo.user?.profile?.email || '';
    const avatar = userInfo.user?.profile?.image_192 || '';

    console.log('✅ Slack user info retrieved:', { realName, email, teamName });

    // Save tokens to Supabase
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    console.log('💾 Saving Slack tokens to Supabase for user:', userId);

    // Get current integration settings
    const { data: currentUser } = await supabase
      .from('users')
      .select('integration_settings')
      .eq('id', userId)
      .single();

    const integrationSettings = currentUser?.integration_settings || {};
    integrationSettings.slack = {
      authenticated: true,
      access_token: accessToken,
      // Store both tokens for different use cases
      user_access_token: userAccessToken,  // For search:read (xoxp-*)
      bot_access_token: botAccessToken,    // For channels/messaging (xoxb-*)
      team_id: teamId,
      team_name: teamName,
      slack_user_id: slackUserId,
      real_name: realName,
      email: email,
      avatar: avatar,
      scopes: scopes,
      user_scopes: userScopes,
      bot_scopes: botScopes,
      connected_at: new Date().toISOString()
    };

    // Update user's integration settings
    const { error: updateError } = await supabase
      .from('users')
      .update({ integration_settings: integrationSettings })
      .eq('id', userId);

    if (updateError) {
      console.error('❌ Failed to save Slack tokens to Supabase:', updateError);
      throw updateError;
    }

    console.log('✅ Slack tokens saved successfully to Supabase:');
    console.log('   - user_access_token:', userAccessToken ? `${userAccessToken.substring(0, 10)}...` : 'NOT SET');
    console.log('   - bot_access_token:', botAccessToken ? `${botAccessToken.substring(0, 10)}...` : 'NOT SET');
    console.log('   - user_scopes:', userScopes.join(', ') || 'NONE');
    console.log('   - bot_scopes:', botScopes.join(', ') || 'NONE');

    // Return success page
    return res.status(200).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Slack Connected</title>
        <style>
          body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; 
            text-align: center; 
            padding: 50px; 
            background: linear-gradient(135deg, #4a154b 0%, #36c5f0 100%);
            margin: 0;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
          }
          .container { 
            background: white; 
            padding: 40px; 
            border-radius: 12px; 
            box-shadow: 0 4px 20px rgba(0,0,0,0.2); 
            max-width: 500px; 
            width: 90%;
          }
          h1 { 
            color: #4a154b; 
            margin-bottom: 20px;
            font-size: 28px;
          }
          p { 
            color: #666; 
            line-height: 1.6;
            margin: 15px 0;
          }
          .success-icon {
            font-size: 64px;
            margin-bottom: 20px;
          }
          .team-info {
            background: #f8f8f8;
            padding: 15px;
            border-radius: 8px;
            margin: 20px 0;
          }
          .team-info strong {
            color: #4a154b;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="success-icon">✅</div>
          <h1>Slack Connected!</h1>
          <div class="team-info">
            <p><strong>Team:</strong> ${teamName}</p>
            <p><strong>User:</strong> ${realName}</p>
          </div>
          <p>Your Slack workspace has been successfully connected.</p>
          <p><strong>You can now close this window and return to the app.</strong></p>
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
    console.error('❌ Slack OAuth error:', error);
    
    return res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Slack Authentication Error</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif; text-align: center; padding: 50px; background: #f5f5f5; }
          .container { background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); max-width: 500px; margin: 0 auto; }
          h1 { color: #e01e5a; }
          .error-details { background: #fff3cd; padding: 15px; border-radius: 4px; margin: 20px 0; color: #856404; }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>❌ Authentication Error</h1>
          <div class="error-details">
            <p><strong>Error:</strong> ${error.message}</p>
          </div>
          <p>Please close this window and try again.</p>
          <p>If the problem persists, contact support.</p>
        </div>
      </body>
      </html>
    `);
  }
};

