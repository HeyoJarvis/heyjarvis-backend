/**
 * Save JIRA Workspace Selection
 * Called from workspace selector HTML to save the selected workspace to Supabase
 * Desktop app polling will detect this change
 */

module.exports = async (req, res) => {
  try {
    const { userId, tokens, workspaces, selectedWorkspaceId } = req.body;
    
    console.log('💾 Saving selected JIRA workspace:', { userId, selectedWorkspaceId });
    
    if (!userId || !tokens || !workspaces || !selectedWorkspaceId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required parameters'
      });
    }
    
    // Find the selected workspace
    const selectedWorkspace = workspaces.find(w => w.id === selectedWorkspaceId);
    
    if (!selectedWorkspace) {
      return res.status(400).json({
        success: false,
        error: 'Selected workspace not found'
      });
    }
    
    console.log('✅ Workspace found:', {
      id: selectedWorkspace.id,
      name: selectedWorkspace.name,
      url: selectedWorkspace.url
    });
    
    // Save to Supabase
    const { createClient } = require('@supabase/supabase-js');
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );
    
    // Get current integration settings
    const { data: userData, error: fetchError } = await supabase
      .from('users')
      .select('integration_settings')
      .eq('id', userId)
      .single();
    
    if (fetchError) {
      console.error('❌ Failed to fetch user:', fetchError);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch user data'
      });
    }
    
    // Update integration settings with selected workspace
    const integrationSettings = userData?.integration_settings || {};
    integrationSettings.jira = {
      authenticated: true,
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expiry: new Date(Date.now() + (tokens.expires_in * 1000)).toISOString(),
      cloud_id: selectedWorkspace.id,
      site_url: selectedWorkspace.url,
      workspace_name: selectedWorkspace.name,
      connected_at: new Date().toISOString()
    };
    
    const { error: updateError } = await supabase
      .from('users')
      .update({ integration_settings: integrationSettings })
      .eq('id', userId);
    
    if (updateError) {
      console.error('❌ Failed to save workspace:', updateError);
      return res.status(500).json({
        success: false,
        error: 'Failed to save workspace selection'
      });
    }
    
    console.log('✅ JIRA workspace saved successfully:', {
      userId,
      workspace: selectedWorkspace.name,
      url: selectedWorkspace.url
    });
    
    // Return success
    res.json({
      success: true,
      workspace: {
        id: selectedWorkspace.id,
        name: selectedWorkspace.name,
        url: selectedWorkspace.url
      }
    });
    
  } catch (error) {
    console.error('❌ Error saving workspace:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
};

