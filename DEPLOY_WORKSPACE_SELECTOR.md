# Quick Deployment Guide - JIRA Workspace Selector

## 🚀 Ready to Deploy!

The JIRA workspace selector has been implemented and is ready for deployment to Vercel.

## Files Changed
- ✅ `api/auth-jira.js` - Modified (workspace detection + selector UI)
- ✅ `api/auth-jira-select.js` - Created (selection endpoint)
- ✅ `JIRA_WORKSPACE_SELECTOR_IMPLEMENTATION.md` - Documentation

## Deployment Steps

### 1. Review Changes (Optional)
```bash
cd ~/test/heyjarvis-backend
git status
git diff api/auth-jira.js
```

### 2. Commit Changes
```bash
git add api/auth-jira.js api/auth-jira-select.js
git add JIRA_WORKSPACE_SELECTOR_IMPLEMENTATION.md DEPLOY_WORKSPACE_SELECTOR.md
git commit -m "feat: Add JIRA workspace selector for multiple workspaces

- Detect when user has multiple JIRA workspaces
- Show beautiful selector UI for workspace choice
- Auto-select for single workspace (backward compatible)
- Store selection temporarily in oauthStore
- Save selected workspace to Supabase
- Add workspace name to integration settings"
```

### 3. Push to Vercel
```bash
git push origin main
```

### 4. Monitor Deployment
1. Go to https://vercel.com/dashboard
2. Watch for deployment to complete (usually 30-60 seconds)
3. Check deployment logs for any errors

### 5. Test the Feature

#### Test with Single Workspace Account
```bash
# Expected: Auto-connects without selector (same as before)
1. Open HeyJarvis desktop app
2. Go to Settings
3. Click "Connect" on JIRA
4. Complete OAuth in browser
5. Should auto-connect without showing selector
```

#### Test with Multiple Workspace Account
```bash
# Expected: Shows workspace selector
1. Open HeyJarvis desktop app
2. Go to Settings
3. Click "Connect" on JIRA
4. Complete OAuth in browser
5. Should see workspace selector with all workspaces
6. Click a workspace
7. Should see success page with workspace name
8. Return to app
9. Should see tasks from selected workspace
```

## Verification

### Check Vercel Logs
```bash
# Look for these logs in Vercel dashboard:
✅ Found JIRA workspaces: { count: 2, workspaces: [...] }
🏢 Multiple workspaces detected, storing data and showing selector
🏢 Workspace selection received: { workspace_id: '...', session_id: '...' }
✅ Workspace selected: { id: '...', name: '...', url: '...' }
✅ JIRA tokens saved to Supabase successfully
```

### Check Supabase Database
```sql
-- Verify workspace_name is being saved
SELECT 
  email,
  integration_settings->'jira'->>'workspace_name' as workspace,
  integration_settings->'jira'->>'site_url' as url,
  integration_settings->'jira'->>'cloud_id' as cloud_id
FROM users
WHERE integration_settings->'jira' IS NOT NULL
ORDER BY email;
```

## Rollback (If Needed)

If something goes wrong, you can quickly rollback:

```bash
# Revert the commit
git revert HEAD

# Push the revert
git push origin main
```

Or in Vercel dashboard:
1. Go to Deployments
2. Find previous working deployment
3. Click "Promote to Production"

## Success Indicators ✅

After deployment, you should see:
- ✅ Deployment succeeds in Vercel
- ✅ No errors in Vercel function logs
- ✅ Single workspace users connect normally
- ✅ Multiple workspace users see selector
- ✅ Selected workspace saved to database
- ✅ Tasks load from correct workspace

## Support

### If Deployment Fails
1. Check Vercel deployment logs for errors
2. Verify all environment variables are set:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `JIRA_CLIENT_ID`
   - `JIRA_CLIENT_SECRET`
3. Check Node.js version compatibility

### If Selector Doesn't Appear
1. Check Vercel function logs for errors
2. Verify user has multiple workspaces in Atlassian
3. Check browser console for JavaScript errors
4. Verify `oauthStore` is working (check logs)

### If Selection Fails
1. Check if session expired (>10 min)
2. Verify `oauthStore` data exists
3. Check Supabase permissions
4. Review Vercel function logs

## Next Steps

After successful deployment:
1. ✅ Test with real users
2. ✅ Monitor Vercel logs for any issues
3. ✅ Collect user feedback
4. 📋 Consider Phase 2: Workspace switcher in Settings
5. 📋 Consider Phase 3: Multi-workspace support

## Questions?

Refer to `JIRA_WORKSPACE_SELECTOR_IMPLEMENTATION.md` for:
- Detailed technical documentation
- User experience flows
- Security features
- Future enhancement ideas
- Troubleshooting guide

---

**Ready to deploy?** Just run the commands above! 🚀


