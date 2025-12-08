// Vercel Serverless Function - Handle Stripe Webhooks
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('❌ Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  console.log('📨 Received Stripe webhook:', event.type);

  // Handle the event
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata.userId;
        const seats = parseInt(session.metadata.seats);
        const billingCycle = session.metadata.billingCycle;

        console.log('✅ Checkout completed for user:', userId);

        // Update user subscription in database
        const subscriptionEndDate = new Date();
        subscriptionEndDate.setMonth(
          subscriptionEndDate.getMonth() + (billingCycle === 'annual' ? 12 : 1)
        );

        await supabase
          .from('users')
          .update({
            subscription_plan: 'professional', // Database enum accepts: trial, starter, professional, enterprise
            subscription_ends_at: subscriptionEndDate.toISOString(),
            trial_ends_at: null // Clear trial
          })
          .eq('id', userId);

        console.log('✅ User subscription updated');
        break;
      }

      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        // Find user by Stripe customer ID
        const { data: users } = await supabase
          .from('users')
          .select('id, integration_settings')
          .filter('integration_settings->stripe->>customer_id', 'eq', customerId);

        if (users && users.length > 0) {
          const user = users[0];
          const isActive = subscription.status === 'active';

          console.log(`${isActive ? '✅' : '❌'} Subscription ${event.type} for user:`, user.id);

          if (isActive) {
            const subscriptionEndDate = new Date(subscription.current_period_end * 1000);
            await supabase
              .from('users')
              .update({
                subscription_ends_at: subscriptionEndDate.toISOString()
              })
              .eq('id', user.id);
          } else {
            // Subscription cancelled or expired - revert to trial
            await supabase
              .from('users')
              .update({
                subscription_plan: 'trial',
                subscription_ends_at: null
              })
              .eq('id', user.id);
          }
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        console.log('✅ Payment succeeded for invoice:', invoice.id);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        console.log('❌ Payment failed for invoice:', invoice.id);
        // TODO: Send email notification to user
        break;
      }

      default:
        console.log(`ℹ️ Unhandled event type: ${event.type}`);
    }

    res.status(200).json({ received: true });
  } catch (error) {
    console.error('❌ Error processing webhook:', error);
    res.status(500).json({ error: error.message });
  }
};

