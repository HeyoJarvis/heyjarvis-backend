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
      max_tokens = 4096,
      stream = false  // New parameter to enable streaming
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

    // STREAMING MODE - Send chunks as they arrive
    if (stream) {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');

      const streamResponse = anthropic.messages.stream(requestParams);

      streamResponse.on('text', (text) => {
        // Send each text chunk as SSE
        res.write(`data: ${JSON.stringify({ type: 'content_block_delta', text })}\n\n`);
      });

      streamResponse.on('message', (message) => {
        // Send final message with full response
        res.write(`data: ${JSON.stringify({ type: 'message_stop', message })}\n\n`);
        res.end();
      });

      streamResponse.on('error', (error) => {
        console.error('Stream error:', error);
        res.write(`data: ${JSON.stringify({ type: 'error', error: error.message })}\n\n`);
        res.end();
      });

      return;
    }

    // NON-STREAMING MODE - Original behavior for backward compatibility
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

