const axios = require('axios');
const { createClient } = require('@supabase/supabase-js');

(async () => {
  const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  const { data: userData } = await supabase.from('users').select('integration_settings').eq('id', 'f2f58a36-1b94-4a9d-8d96-9dc4f006bda6').single();
  const jiraSettings = userData.integration_settings.jira;
  
  console.log('Cloud ID:', jiraSettings.cloud_id);
  console.log('Token exists:', !!jiraSettings.access_token);
  
  console.log('\n=== Testing boards API ===');
  try {
    const response = await axios.get(
      `https://api.atlassian.com/ex/jira/${jiraSettings.cloud_id}/rest/agile/1.0/board?projectKeyOrId=THEN`,
      { headers: { 'Authorization': `Bearer ${jiraSettings.access_token}`, 'Accept': 'application/json' } }
    );
    console.log('✅ Boards:', response.data.values.length);
    if (response.data.values.length > 0) {
      console.log('First board ID:', response.data.values[0].id, 'Name:', response.data.values[0].name);
    }
  } catch (error) {
    console.error('❌ Boards error:', error.response?.status, error.response?.data);
  }
  
  console.log('\n=== Testing search/jql API for sprints ===');
  try {
    const response = await axios.get(
      `https://api.atlassian.com/ex/jira/${jiraSettings.cloud_id}/rest/api/3/search/jql?jql=project = THEN AND sprint IS NOT EMPTY&maxResults=10&fields=sprint,customfield_10020`,
      { headers: { 'Authorization': `Bearer ${jiraSettings.access_token}`, 'Accept': 'application/json' } }
    );
    console.log('✅ Issues with sprints:', response.data.issues.length);
    if (response.data.issues.length > 0) {
      console.log('First issue sprint:', response.data.issues[0].fields.sprint || response.data.issues[0].fields.customfield_10020);
    }
  } catch (error) {
    console.error('❌ Search error:', error.response?.status, error.response?.data);
  }
  
  console.log('\n=== Testing search/jql API for epics ===');
  try {
    const response = await axios.get(
      `https://api.atlassian.com/ex/jira/${jiraSettings.cloud_id}/rest/api/3/search/jql?jql=project = THEN AND issuetype = Epic&maxResults=10&fields=summary,key`,
      { headers: { 'Authorization': `Bearer ${jiraSettings.access_token}`, 'Accept': 'application/json' } }
    );
    console.log('✅ Epics found:', response.data.issues.length);
    if (response.data.issues.length > 0) {
      console.log('First epic:', response.data.issues[0].key, response.data.issues[0].fields.summary);
    }
  } catch (error) {
    console.error('❌ Epic search error:', error.response?.status, error.response?.data);
  }
})();
