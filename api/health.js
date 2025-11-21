module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  return res.status(200).json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    message: 'HeyJarvis Backend is running!',
    version: '1.0.0'
  });
};




