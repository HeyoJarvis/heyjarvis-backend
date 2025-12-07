// Vercel Serverless Function - Create Stripe Checkout Session
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  // Enable CORS for all origins (including localhost)
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId, seats, billingCycle, priceId } = req.body;

  if (!userId || !seats || !priceId) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    console.log('💳 Creating Stripe checkout session for user:', userId);
    
    // Get user data from existing users table
    const { data: userData, error: userError } = await supabase
      .from('users')
      .select('email, integration_settings')
      .eq('id', userId)
      .single();

    if (userError) {
      console.error('❌ Error fetching user:', userError);
      return res.status(400).json({ error: 'User not found' });
    }

    console.log('✅ User found:', userData.email);

    // Check if user already has a Stripe customer ID
    let customerId = userData?.integration_settings?.stripe?.customer_id;
    const email = userData?.email;

    // Create or retrieve Stripe customer
    if (!customerId) {
      console.log('📝 Creating new Stripe customer...');
      const customer = await stripe.customers.create({
        email,
        metadata: { userId }
      });
      customerId = customer.id;
      console.log('✅ Stripe customer created:', customerId);

      // Save customer ID in integration_settings
      const currentSettings = userData?.integration_settings || {};
      await supabase
        .from('users')
        .update({ 
          integration_settings: {
            ...currentSettings,
            stripe: { customer_id: customerId }
          }
        })
        .eq('id', userId);
    } else {
      console.log('✅ Using existing Stripe customer:', customerId);
    }

    // Create checkout session
    console.log('💳 Creating checkout session...');
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: seats
        }
      ],
      mode: 'subscription',
      success_url: `https://jarvis-website.vercel.app/dashboard?success=true`,
      cancel_url: `https://jarvis-website.vercel.app/pricing?canceled=true`,
      subscription_data: {
        metadata: {
          userId,
          seats
        }
      },
      metadata: {
        userId,
        seats,
        billingCycle
      }
    });

    console.log('✅ Checkout session created:', session.id);
    return res.status(200).json({ sessionId: session.id });
  } catch (error) {
    console.error('❌ Checkout session error:', error);
    return res.status(500).json({ error: error.message });
  }
};

