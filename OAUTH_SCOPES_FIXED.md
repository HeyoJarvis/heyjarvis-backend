# OAuth Scopes Persistence Fix

## Problem
Confluence scopes were disappearing on app restart because OAuth scopes were not being saved to the database during initial authentication or token refresh operations.

## Solution
Updated all OAuth handlers to save the `scope` field returned from OAuth providers. This ensures that granted permissions (including Confluence access) persist across app restarts.

## Files Modified

### 1. **api/auth-jira.js**
- Added `scope: tokens.scope` to the JIRA integration settings
- This includes Confluence permissions granted during JIRA OAuth flow

### 2. **api/auth-google.js**
- Added `scope: tokens.scope` to the Google integration settings
- Preserves granted Google API scopes (Calendar, Gmail, etc.)

### 3. **api/auth-microsoft.js**
- Added `scope: tokens.scope` to the Microsoft integration settings
- Preserves granted Microsoft Graph API scopes (Calendar, Outlook, etc.)

### 4. **api/sync-jira.js**
- Added scope preservation during token refresh
- When refreshing JIRA tokens, now saves `refreshResponse.data.scope` if present

### 5. **lib/jira-token-refresh.js**
- Added scope preservation during token refresh
- Uses `tokenData.scope || jiraSettings.scope` to preserve existing scopes if new ones aren't returned

## What Gets Saved

For JIRA/Confluence:
```javascript
integrationSettings.jira = {
  authenticated: true,
  access_token: tokens.access_token,
  refresh_token: tokens.refresh_token,
  token_expiry: new Date(Date.now() + (tokens.expires_in * 1000)).toISOString(),
  scope: tokens.scope, // ✅ NOW SAVED - includes Confluence permissions
  cloud_id: cloudId,
  site_url: siteUrl,
  connected_at: new Date().toISOString()
};
```

The `scope` field typically contains values like:
- `read:jira-work`
- `read:jira-user`
- `write:jira-work`
- `read:confluence-content.all` ✅ Confluence access
- `read:confluence-space.summary` ✅ Confluence access
- etc.

## Impact

### Before Fix
1. User authenticates with JIRA/Confluence
2. Scopes granted but not saved to database
3. App restart → scopes lost
4. Confluence features stop working
5. User has to re-authenticate

### After Fix
1. User authenticates with JIRA/Confluence
2. Scopes granted AND saved to database ✅
3. App restart → scopes persist ✅
4. Confluence features continue working ✅
5. Token refresh preserves scopes ✅

## Testing

To verify the fix:

1. **Fresh OAuth Flow:**
   ```bash
   # Connect JIRA/Confluence from the app
   # Check database:
   SELECT integration_settings->'jira'->'scope' FROM users WHERE id = '<user_id>';
   # Should show the granted scopes
   ```

2. **After App Restart:**
   ```bash
   # Restart the app
   # Confluence pages should still be accessible
   # Check that API calls include proper scopes
   ```

3. **After Token Refresh:**
   ```bash
   # Wait for token expiry or force refresh
   # Scopes should persist in the refreshed token
   ```

## Related Files

- **api/auth-slack.js** - Already saves scopes correctly (no changes needed)
- All other JIRA endpoints (jira-boards, jira-epics, etc.) use the token refresh helpers

## Deployment

No database migration needed - the `integration_settings` column is already JSONB and can store the new `scope` field.

Users who previously connected JIRA/Confluence will need to:
1. Disconnect JIRA integration
2. Reconnect JIRA integration
3. Scopes will now be saved properly

## Notes

- Slack OAuth already had proper scope storage (`scopes`, `user_scopes`, `bot_scopes`)
- This fix ensures consistency across all OAuth providers
- Token refresh operations now preserve scopes even if the refresh response doesn't include them

