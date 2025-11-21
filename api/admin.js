const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { operation, data } = req.body;

    // Create Supabase client with service role (has admin privileges)
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    let result;
    
    switch (operation) {
      case 'create_user':
        result = await supabase.from('users').insert(data).select();
        break;
      
      case 'update_user':
        result = await supabase
          .from('users')
          .update(data.updates)
          .eq('id', data.userId)
          .select();
        break;
      
      case 'delete_user':
        result = await supabase
          .from('users')
          .delete()
          .eq('id', data.userId);
        break;
      
      default:
        return res.status(400).json({ error: 'Invalid operation' });
    }

    if (result.error) {
      throw result.error;
    }

    return res.status(200).json(result.data);
  } catch (error) {
    console.error('Admin API error:', error);
    return res.status(500).json({ 
      error: 'Failed to process admin request',
      message: error.message 
    });
  }
};




