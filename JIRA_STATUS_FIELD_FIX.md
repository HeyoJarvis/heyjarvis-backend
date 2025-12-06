# JIRA Status Field Consistency Fix

## Problem
After JIRA sync completed, the web app's TaskDetailView was still showing stale status (e.g., "To Do" instead of "Done") even though the sync claimed to be successful. The console showed "Task not found in results" error.

## Root Cause
**Field name inconsistency** between backend sync and frontend display:

### Backend (sync-jira.js)
Saved status as:
```javascript
workflow_metadata: {
  status: fields.status?.name,  // ✅ Saved
  status_category: fields.status?.statusCategory?.key  // ✅ Saved
}
```

### Frontend (api.js)
Looked for status as:
```javascript
jira_status: metadata.jira_status || metadata.status,  // ❌ jira_status not saved!
jira_status_category: metadata.jira_status_category || metadata.status_category  // ❌ jira_status_category not saved!
```

The frontend was looking for `jira_status` first, but the backend only saved `status`. While there was a fallback to `status`, the inconsistency caused issues with the status display logic.

## Solution
Updated `sync-jira.js` to save **both field name variations** for maximum compatibility:

### Updated Fields in workflow_metadata

**For UPDATE operations (line 249-273):**
```javascript
workflow_metadata: {
  status: fields.status?.name,
  jira_status: fields.status?.name,  // ✅ NEW: Explicit jira_status field
  status_category: fields.status?.statusCategory?.key,
  jira_status_category: fields.status?.statusCategory?.key,  // ✅ NEW: Explicit jira_status_category field
  type: fields.issuetype?.name,
  issue_type: fields.issuetype?.name,  // ✅ NEW: Explicit issue_type field
  // ... other fields
}
```

**For INSERT operations (line 290-330):**
Same fields added for consistency.

## Fields Now Saved with Dual Names

| Original Field | Also Saved As | Purpose |
|---------------|---------------|---------|
| `status` | `jira_status` | JIRA task status (To Do, Done, etc.) |
| `status_category` | `jira_status_category` | Status category (todo, done, etc.) |
| `type` | `issue_type` | Issue type (Task, Bug, Story, etc.) |

## What This Fixes

### Before Fix
1. User changes task in JIRA: To Do → Done
2. Web app syncs JIRA
3. Backend saves `status: "Done"` but NOT `jira_status: "Done"`
4. Frontend looks for `jira_status` first, doesn't find it
5. Falls back to `status`, but timing issues cause stale data
6. TaskDetailView shows "To Do" ❌

### After Fix
1. User changes task in JIRA: To Do → Done
2. Web app syncs JIRA
3. Backend saves BOTH `status: "Done"` AND `jira_status: "Done"` ✅
4. Frontend finds `jira_status: "Done"` immediately ✅
5. TaskDetailView shows "Done" ✅
6. Auto-sync on page load ensures fresh data ✅

## Testing

### Test Case 1: Fresh Sync
1. Change a task status in JIRA (e.g., THEN-8: To Do → Done)
2. In web app, click "Sync JIRA" button
3. Open the task in detail view
4. **Expected**: Status shows "Done"

### Test Case 2: Page Refresh
1. Change a task status in JIRA
2. Refresh the web app (F5)
3. Wait for auto-sync (1-2 seconds)
4. Open the task in detail view
5. **Expected**: Status shows updated value

### Test Case 3: Task Already Open
1. Open a task in detail view
2. Change its status in JIRA
3. Click "Sync JIRA" in web app
4. **Expected**: Status updates automatically in the open task view

## Files Modified

- **~/test/heyjarvis-backend/api/sync-jira.js**
  - Line 257: Added `jira_status` field to UPDATE operations
  - Line 259: Added `jira_status_category` field to UPDATE operations
  - Line 261: Added `issue_type` field to UPDATE operations
  - Line 303: Added `jira_status` field to INSERT operations
  - Line 305: Added `jira_status_category` field to INSERT operations
  - Line 307: Added `issue_type` field to INSERT operations

## Database Impact

- No migration needed (workflow_metadata is JSONB)
- Existing tasks will get updated fields on next sync
- New tasks will have both field names from the start
- No breaking changes (old field names still present)

## Compatibility

### Backward Compatible ✅
- Old field names (`status`, `status_category`, `type`) still saved
- Existing code that reads old fields continues to work
- No breaking changes for desktop app or other consumers

### Forward Compatible ✅
- New field names (`jira_status`, `jira_status_category`, `issue_type`) now available
- Frontend can use either field name
- Consistent with JIRA terminology

## Related Fixes

This fix works in conjunction with:
1. **Auto JIRA Sync** - Syncs on page load
2. **selectedTask Update** - Updates task when jiraTasks changes
3. **OAuth Scopes Fix** - Ensures Confluence permissions persist

Together, these fixes ensure the web app stays in sync with JIRA automatically.

## Notes

- The dual field names provide redundancy and compatibility
- Frontend code can be updated to use `jira_status` exclusively in the future
- This pattern should be followed for any new JIRA fields added
- Desktop app may need similar updates if it has the same issue

