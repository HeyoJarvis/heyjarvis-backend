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

    const resources = resourcesResponse.data;
    if (!resources || resources.length === 0) {
      throw new Error('No accessible JIRA resources found');
    }

    console.log('✅ Found JIRA workspaces:', {
      count: resources.length,
      workspaces: resources.map(r => ({ id: r.id, name: r.name, url: r.url }))
    });

    // Extract user_id, session_id, and mobile_redirect from state
    let userId = null;
    let sessionId = 'default';
    let mobileRedirect = null;
    let platform = null;
    if (state) {
      try {
        const stateData = JSON.parse(Buffer.from(state, 'base64url').toString('utf-8'));
        userId = stateData.user_id;
        sessionId = stateData.session_id || 'default';
        mobileRedirect = stateData.mobile_redirect;
        platform = stateData.platform;
        console.log('✅ Extracted from state:', { userId, sessionId, mobileRedirect: mobileRedirect ? 'SET' : 'NOT SET', platform });
      } catch (err) {
        console.error('❌ Could not extract data from state:', err.message);
      }
    }

    if (!userId) {
      throw new Error('Missing user_id in OAuth state');
    }
    
    // Helper function to generate mobile/desktop success response
    const sendSuccessResponse = (siteName, siteUrl, redirectUrl) => {
      if (redirectUrl) {
        // Mobile: show success with Done button (auto-redirect often doesn't work in mobile Safari)
        const callbackUrl = `${redirectUrl}?success=true&provider=jira&site=${encodeURIComponent(siteName || '')}`;
        console.log('📱 Mobile success page with redirect URL:', callbackUrl);
        return res.send(`
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>JIRA Connected</title>
            <style>
              * { margin: 0; padding: 0; box-sizing: border-box; }
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
                background: linear-gradient(135deg, #0052CC 0%, #2684FF 100%);
                min-height: 100vh;
                display: flex;
                align-items: center;
                justify-content: center;
                padding: 20px;
              }
              .card {
                background: white;
                border-radius: 20px;
                padding: 40px;
                max-width: 400px;
                text-align: center;
                box-shadow: 0 10px 40px rgba(0,0,0,0.2);
              }
              .icon { font-size: 72px; margin-bottom: 16px; }
              h1 { color: #22C55E; font-size: 28px; margin-bottom: 8px; }
              .site { color: #64748B; font-size: 16px; margin-bottom: 32px; }
              .btn {
                display: block;
                background: #0052CC;
                color: white;
                padding: 18px 32px;
                border-radius: 14px;
                text-decoration: none;
                font-weight: 600;
                font-size: 18px;
                margin-bottom: 16px;
                transition: transform 0.2s, box-shadow 0.2s;
              }
              .btn:active {
                transform: scale(0.98);
              }
              .hint { color: #94A3B8; font-size: 13px; }
            </style>
          </head>
          <body>
            <div class="card">
              <div class="icon">✅</div>
              <h1>Connected!</h1>
              <p class="site">${siteName || siteUrl}</p>
              <a href="${callbackUrl}" class="btn" id="doneBtn">Done</a>
              <p class="hint">Tap Done to return to HeyJarvis</p>
            </div>
            <script>
              // Try auto-redirect after short delay
              setTimeout(function() {
                window.location.href = "${callbackUrl}";
              }, 300);
            </script>
          </body>
          </html>
        `);
      }
      // Desktop: show close window message
      return null; // Let the existing code handle desktop
    };

    // If multiple workspaces, show selector
    if (resources.length > 1) {
      console.log('🏢 Multiple workspaces detected, showing selector');
      return res.send(generateWorkspaceSelectorHTML(resources, tokens, userId, req.headers.host, mobileRedirect));
    }

    // Single workspace - auto-select
    const resource = resources[0];
    const cloudId = resource.id;
    const siteUrl = resource.url;

    console.log('✅ Single workspace, auto-selecting:', { cloudId, siteUrl });

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

    // Check if this is a mobile request - if so, redirect to app
    if (mobileRedirect) {
      return sendSuccessResponse(resource.name, siteUrl, mobileRedirect);
    }

    // Desktop: Show success page with auto-close
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

/**
 * Generate HTML for workspace selector
 * User clicks workspace → calls save endpoint → redirects to app (mobile) or closes (desktop)
 */
function generateWorkspaceSelectorHTML(workspaces, tokens, userId, host, mobileRedirect = null) {
  const workspaceCards = workspaces.map(workspace => `
    <div class="workspace-card" onclick="selectWorkspace('${workspace.id}', '${workspace.name.replace(/'/g, "\\'")}', '${workspace.url}')">
      <div class="workspace-icon">
        ${workspace.avatarUrl ? `<img src="${workspace.avatarUrl}" alt="${workspace.name}" />` : '🏢'}
      </div>
      <div class="workspace-info">
        <h3>${workspace.name}</h3>
        <p>${workspace.url}</p>
      </div>
    </div>
  `).join('');

  // Embed tokens and data as JSON for the save call
  const saveData = JSON.stringify({
    userId,
    mobileRedirect: mobileRedirect || null,
    tokens: {
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      expires_in: tokens.expires_in
    },
    workspaces: workspaces.map(w => ({
      id: w.id,
      name: w.name,
      url: w.url,
      avatarUrl: w.avatarUrl,
      scopes: w.scopes
    }))
  });

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Select JIRA Workspace</title>
        <style>
          * { margin: 0; padding: 0; box-sizing: border-box; }
          
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: linear-gradient(135deg, #0052CC 0%, #0065FF 100%);
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
          }
          
          .container {
            background: white;
            border-radius: 16px;
            padding: 40px;
            max-width: 600px;
            width: 100%;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          }
          
          h1 {
            color: #172B4D;
            margin-bottom: 10px;
            font-size: 28px;
            text-align: center;
          }
          
          .subtitle {
            color: #6B778C;
            text-align: center;
            margin-bottom: 30px;
            font-size: 14px;
          }
          
          .workspaces {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }
          
          .workspace-card {
            display: flex;
            align-items: center;
            padding: 16px;
            border: 2px solid #DFE1E6;
            border-radius: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
            background: white;
          }
          
          .workspace-card:hover {
            border-color: #0052CC;
            background: #DEEBFF;
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0, 82, 204, 0.15);
          }
          
          .workspace-icon {
            width: 48px;
            height: 48px;
            border-radius: 8px;
            background: #F4F5F7;
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            margin-right: 16px;
            flex-shrink: 0;
          }
          
          .workspace-icon img {
            width: 100%;
            height: 100%;
            border-radius: 8px;
            object-fit: cover;
          }
          
          .workspace-info {
            flex: 1;
          }
          
          .workspace-info h3 {
            color: #172B4D;
            font-size: 16px;
            margin-bottom: 4px;
          }
          
          .workspace-info p {
            color: #6B778C;
            font-size: 13px;
          }
          
          .loading {
            display: none;
            text-align: center;
            padding: 20px;
            color: #0052CC;
          }
          
          .loading.active {
            display: block;
          }
          
          .spinner {
            border: 3px solid #F4F5F7;
            border-top: 3px solid #0052CC;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 1s linear infinite;
            margin: 0 auto 10px;
          }
          
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }

          .error {
            display: none;
            background: #FFEBE6;
            color: #DE350B;
            padding: 15px;
            border-radius: 8px;
            margin-top: 20px;
            text-align: center;
          }

          .error.active {
            display: block;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🏢 Select Your JIRA Workspace</h1>
          <p class="subtitle">You have access to multiple workspaces. Please select the one you want to connect.</p>
          
          <div class="workspaces" id="workspaces">
            ${workspaceCards}
          </div>
          
          <div class="loading" id="loading">
            <div class="spinner"></div>
            <p>Connecting to workspace...</p>
          </div>

          <div class="error" id="error">
            <strong>Connection failed.</strong> Please try again.
          </div>
        </div>
        
        <script>
          const saveData = ${saveData};
          
          async function selectWorkspace(workspaceId, workspaceName, workspaceUrl) {
            console.log('Selected workspace:', workspaceId, workspaceName, workspaceUrl);
            
            // Show loading
            document.getElementById('workspaces').style.display = 'none';
            document.getElementById('loading').classList.add('active');
            document.getElementById('error').classList.remove('active');
            
            try {
              // Call save endpoint
              const response = await fetch('https://${host}/api/save-jira-workspace', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  ...saveData,
                  selectedWorkspaceId: workspaceId
                })
              });
              
              const result = await response.json();
              
              if (result.success) {
                // Check if we have a mobile redirect
                const mobileRedirectUrl = saveData.mobileRedirect;
                
                if (mobileRedirectUrl) {
                  // Mobile: show Done button
                  const callbackUrl = mobileRedirectUrl + '?success=true&provider=jira&site=' + encodeURIComponent(workspaceName);
                  console.log('📱 Mobile redirect to:', callbackUrl);
                  
                  document.getElementById('loading').innerHTML = \`
                    <div style="text-align: center;">
                      <div style="font-size: 64px; margin-bottom: 16px;">✅</div>
                      <h2 style="color: #22C55E; font-size: 24px; margin-bottom: 8px;">Connected!</h2>
                      <p style="color: #6B778C; margin-bottom: 24px;">\${workspaceName}</p>
                      <a href="\${callbackUrl}" style="display: block; background: #0052CC; color: white; padding: 18px 32px; border-radius: 14px; text-decoration: none; font-weight: 600; font-size: 18px; margin-bottom: 12px;">Done</a>
                      <p style="color: #94A3B8; font-size: 13px;">Tap Done to return to HeyJarvis</p>
                    </div>
                  \`;
                  
                  // Try auto redirect
                  setTimeout(() => {
                    window.location.href = callbackUrl;
                  }, 300);
                } else {
                  // Desktop: show success and auto-close
                  document.getElementById('loading').innerHTML = \`
                    <div style="text-align: center;">
                      <div style="font-size: 48px; margin-bottom: 10px;">✅</div>
                      <h2 style="color: #0052CC; margin-bottom: 10px;">Connected!</h2>
                      <p style="color: #6B778C; margin-bottom: 5px;">\${workspaceName}</p>
                      <p style="color: #6B778C; font-size: 12px;">Return to HeyJarvis to continue</p>
                    </div>
                  \`;
                  
                  // Auto-close after 2 seconds
                  setTimeout(() => {
                    window.close();
                  }, 2000);
                }
              } else {
                throw new Error(result.error || 'Failed to save workspace');
              }
            } catch (error) {
              console.error('Error saving workspace:', error);
              document.getElementById('loading').classList.remove('active');
              document.getElementById('error').classList.add('active');
              document.getElementById('workspaces').style.display = 'flex';
            }
          }
        </script>
      </body>
    </html>
  `;
}

