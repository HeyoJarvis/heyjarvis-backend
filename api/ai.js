const Anthropic = require('@anthropic-ai/sdk');

module.exports = async function handler(req, res) {
  // Enable CORS for your Electron app and mobile app
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { 
      messages, 
      system,
      model = 'claude-sonnet-4-20250514', 
      max_tokens = 4096 
    } = req.body;

    if (!messages || !Array.isArray(messages)) {
      return res.status(400).json({ error: 'Messages array is required' });
    }

    const anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Build request with optional system prompt
    const requestParams = {
      model,
      max_tokens,
      messages,
    };

    // Add system prompt if provided
    if (system) {
      requestParams.system = system;
    }

    const response = await anthropic.messages.create(requestParams);

    return res.status(200).json(response);
  } catch (error) {
    console.error('Anthropic API error:', error);
    return res.status(500).json({ 
      error: 'Failed to process AI request',
      message: error.message 
    });
  }
};

