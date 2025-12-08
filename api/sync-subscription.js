// Vercel Serverless Function - Sync subscription status from Stripe
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  // Enable CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'Missing userId' });
  }

  try {
    console.log('🔄 Syncing subscription for user:', userId);

    // Get user's email from database
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('email, integration_settings, subscription_plan')
      .eq('id', userId)
      .single();

    if (userError || !userData) {
      console.error('User not found:', userError);
      return res.status(400).json({ error: 'User not found' });
    }

    console.log('📧 User email:', userData.email);
    console.log('📋 Current plan:', userData.subscription_plan);

    // Try to find customer by email in Stripe
    const customers = await stripe.customers.list({
      email: userData.email,
      limit: 1
    });

    if (customers.data.length === 0) {
      console.log('❌ No Stripe customer found');
      return res.status(200).json({ 
        success: false,
        message: 'No Stripe customer found for this email',
        current_plan: userData.subscription_plan || 'trial'
      });
    }

    const customerId = customers.data[0].id;
    console.log('✅ Found customer:', customerId);

    // Get active subscriptions for this customer
    const subscriptions = await stripe.subscriptions.list({
      customer: customerId,
      status: 'active',
      limit: 1
    });

    if (subscriptions.data.length === 0) {
      console.log('❌ No active subscription found');
      return res.status(200).json({ 
        success: false,
        message: 'No active subscription found',
        current_plan: userData.subscription_plan || 'trial'
      });
    }

    const subscription = subscriptions.data[0];
    
    // Safely parse subscription end date
    let subscriptionEnd;
    try {
      // Stripe returns Unix timestamp in seconds
      const timestamp = subscription.current_period_end;
      subscriptionEnd = new Date(timestamp * 1000);
      
      // Validate the date
      if (isNaN(subscriptionEnd.getTime())) {
        console.log('⚠️ Invalid date, using 1 year from now');
        subscriptionEnd = new Date();
        subscriptionEnd.setFullYear(subscriptionEnd.getFullYear() + 1);
      }
    } catch (e) {
      console.log('⚠️ Date parsing error, using 1 year from now');
      subscriptionEnd = new Date();
      subscriptionEnd.setFullYear(subscriptionEnd.getFullYear() + 1);
    }
    
    // Use 'pro' as the plan name - database enum only accepts: trial, basic, pro, enterprise
    const planName = 'pro';
    
    console.log('✅ Found active subscription:', subscription.id);
    console.log('📅 Raw period end:', subscription.current_period_end);
    console.log('📅 Subscription ends:', subscriptionEnd.toISOString());
    console.log('📋 Billing interval:', billingInterval);
    console.log('📋 Plan:', planName);

    // Update user's subscription in database
    const { error: updateError } = await supabase
      .from('users')
      .update({
        subscription_plan: planName,
        subscription_ends_at: subscriptionEnd.toISOString(),
        trial_ends_at: null,
        integration_settings: {
          ...userData.integration_settings,
          stripe: {
            ...(userData.integration_settings?.stripe || {}),
            customer_id: customerId,
            subscription_id: subscription.id
          }
        }
      })
      .eq('id', userId);

    if (updateError) {
      console.error('❌ Database update error:', updateError);
      return res.status(500).json({ error: 'Failed to update subscription' });
    }

    console.log('✅ Successfully updated to', planName);
    return res.status(200).json({
      success: true,
      message: 'Subscription synced successfully!',
      subscription_plan: planName,
      subscription_ends_at: subscriptionEnd.toISOString()
    });

  } catch (error) {
    console.error('❌ Sync subscription error:', error);
    return res.status(500).json({ error: error.message });
  }
};
