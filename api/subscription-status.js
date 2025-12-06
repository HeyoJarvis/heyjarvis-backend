/**
 * Check user's subscription/trial status
 * GET /api/subscription-status?userId=xxx
 */
const { createClient } = require('@supabase/supabase-js');

module.exports = async (req, res) => {
  // Enable CORS for Electron app
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    const { userId } = req.query;

    if (!userId) {
      return res.status(400).json({ 
        success: false, 
        error: 'Missing userId' 
      });
    }


    // Initialize Supabase (secrets stay on backend!)
    const supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Get user's subscription info
    const { data: user, error } = await supabase
      .from('users')
      .select('subscription_plan, trial_ends_at, subscription_ends_at, created_at')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('❌ Failed to fetch user:', error);
      return res.status(500).json({ 
        success: false, 
        error: 'Failed to fetch user data' 
      });
    }

    if (!user) {
      console.error('❌ User not found:', userId);
      return res.status(404).json({ 
        success: false, 
        error: 'User not found' 
      });
    }

    const now = new Date();

    // Check trial status
    if (user.subscription_plan === 'trial') {
      const trialEnds = new Date(user.trial_ends_at);
      const msRemaining = trialEnds - now;
      const daysRemaining = Math.floor(msRemaining / (1000 * 60 * 60 * 24));
      const hoursRemaining = Math.floor(msRemaining / (1000 * 60 * 60));

      if (now < trialEnds) {

        return res.json({
          success: true,
          hasAccess: true,
          plan: 'trial',
          daysRemaining: Math.max(0, daysRemaining),
          hoursRemaining: Math.max(0, hoursRemaining),
          trialEndsAt: user.trial_ends_at
        });
      } else {

        return res.json({
          success: true,
          hasAccess: false,
          plan: 'trial',
          reason: 'trial_expired',
          expiredAt: user.trial_ends_at
        });
      }
    }

    // Check paid subscription (for future Stripe integration)
    if (['starter', 'professional', 'enterprise'].includes(user.subscription_plan)) {
      const subEnds = new Date(user.subscription_ends_at);
      
      if (now < subEnds) {

        return res.json({
          success: true,
          hasAccess: true,
          plan: user.subscription_plan,
          expiresAt: user.subscription_ends_at
        });
      } else {

        return res.json({
          success: true,
          hasAccess: false,
          plan: user.subscription_plan,
          reason: 'subscription_expired',
          expiredAt: user.subscription_ends_at
        });
      }
    }

    // No subscription
    return res.json({
      success: true,
      hasAccess: false,
      reason: 'no_subscription'
    });

  } catch (error) {
    console.error('❌ Subscription status error:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
};


