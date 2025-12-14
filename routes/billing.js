import express from 'express';
import Stripe from 'stripe';
import { authMiddleware } from '../middleware/auth.js';
import { tenantIsolation, requireRole } from '../middleware/tenantIsolation.js';
import Organization from '../models/Organization.js';
import { auditLogger } from '../middleware/auditLogger.js';

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Subscription plan mapping
const PLAN_PRICES = {
  free: null,
  starter: process.env.STRIPE_STARTER_PRICE_ID,
  professional: process.env.STRIPE_PROFESSIONAL_PRICE_ID,
  enterprise: process.env.STRIPE_ENTERPRISE_PRICE_ID
};

// Create Stripe customer and subscription
router.post('/create-subscription',
  authMiddleware,
  tenantIsolation,
  requireRole(['owner']),
  auditLogger('subscription_created', 'billing'),
  async (req, res) => {
    try {
      const { plan, paymentMethodId } = req.body;
      const org = req.organization;

      if (!['starter', 'professional', 'enterprise'].includes(plan)) {
        return res.status(400).json({ error: 'Invalid plan' });
      }

      // Create Stripe customer if doesn't exist
      let customerId = org.billing?.stripeCustomerId;
      
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: req.user.email,
          name: org.name,
          metadata: {
            organizationId: org._id.toString()
          }
        });
        customerId = customer.id;
      }

      // Attach payment method
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: customerId
      });

      // Set as default payment method
      await stripe.customers.update(customerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      });

      // Create subscription
      const subscription = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: PLAN_PRICES[plan] }],
        expand: ['latest_invoice.payment_intent']
      });

      // Update organization
      org.billing = {
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscription.id,
        paymentMethodId: paymentMethodId
      };
      org.subscription.plan = plan;
      org.subscription.status = subscription.status === 'active' ? 'active' : 'pending';
      org.subscription.currentPeriodStart = new Date(subscription.current_period_start * 1000);
      org.subscription.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
      
      // Update limits based on plan
      org.updateLimitsForPlan(plan);
      
      await org.save();

      res.json({
        success: true,
        subscription: {
          id: subscription.id,
          status: subscription.status,
          plan: plan
        }
      });
    } catch (error) {
      console.error('Subscription creation error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Update subscription (upgrade/downgrade)
router.post('/update-subscription',
  authMiddleware,
  tenantIsolation,
  requireRole(['owner']),
  auditLogger('subscription_updated', 'billing'),
  async (req, res) => {
    try {
      const { plan } = req.body;
      const org = req.organization;

      if (!org.billing?.stripeSubscriptionId) {
        return res.status(400).json({ error: 'No active subscription' });
      }

      if (!['starter', 'professional', 'enterprise'].includes(plan)) {
        return res.status(400).json({ error: 'Invalid plan' });
      }

      // Get current subscription
      const subscription = await stripe.subscriptions.retrieve(
        org.billing.stripeSubscriptionId
      );

      // Update subscription
      const updatedSubscription = await stripe.subscriptions.update(
        subscription.id,
        {
          items: [{
            id: subscription.items.data[0].id,
            price: PLAN_PRICES[plan]
          }],
          proration_behavior: 'create_prorations'
        }
      );

      // Update organization
      org.subscription.plan = plan;
      org.subscription.status = updatedSubscription.status === 'active' ? 'active' : 'pending';
      org.updateLimitsForPlan(plan);
      
      await org.save();

      res.json({
        success: true,
        subscription: {
          id: updatedSubscription.id,
          status: updatedSubscription.status,
          plan: plan
        }
      });
    } catch (error) {
      console.error('Subscription update error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Cancel subscription
router.post('/cancel-subscription',
  authMiddleware,
  tenantIsolation,
  requireRole(['owner']),
  auditLogger('subscription_cancelled', 'billing'),
  async (req, res) => {
    try {
      const org = req.organization;

      if (!org.billing?.stripeSubscriptionId) {
        return res.status(400).json({ error: 'No active subscription' });
      }

      // Cancel at period end
      const subscription = await stripe.subscriptions.update(
        org.billing.stripeSubscriptionId,
        {
          cancel_at_period_end: true
        }
      );

      // Update organization
      org.subscription.status = 'cancelled';
      org.subscription.cancelAtPeriodEnd = true;
      
      await org.save();

      res.json({
        success: true,
        message: 'Subscription will be cancelled at period end',
        periodEnd: new Date(subscription.current_period_end * 1000)
      });
    } catch (error) {
      console.error('Subscription cancellation error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Add/Update payment method
router.post('/payment-method',
  authMiddleware,
  tenantIsolation,
  requireRole(['owner']),
  auditLogger('payment_method_updated', 'billing'),
  async (req, res) => {
    try {
      const { paymentMethodId } = req.body;
      const org = req.organization;

      if (!org.billing?.stripeCustomerId) {
        return res.status(400).json({ error: 'No Stripe customer found' });
      }

      // Attach payment method
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: org.billing.stripeCustomerId
      });

      // Set as default
      await stripe.customers.update(org.billing.stripeCustomerId, {
        invoice_settings: {
          default_payment_method: paymentMethodId
        }
      });

      // Update organization
      org.billing.paymentMethodId = paymentMethodId;
      await org.save();

      res.json({
        success: true,
        message: 'Payment method updated'
      });
    } catch (error) {
      console.error('Payment method error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Get invoices
router.get('/invoices',
  authMiddleware,
  tenantIsolation,
  async (req, res) => {
    try {
      const org = req.organization;

      if (!org.billing?.stripeCustomerId) {
        return res.json({ invoices: [] });
      }

      const invoices = await stripe.invoices.list({
        customer: org.billing.stripeCustomerId,
        limit: 12
      });

      const formattedInvoices = invoices.data.map(invoice => ({
        id: invoice.id,
        amount: invoice.amount_paid / 100,
        currency: invoice.currency,
        status: invoice.status,
        date: new Date(invoice.created * 1000),
        pdfUrl: invoice.invoice_pdf,
        hostedUrl: invoice.hosted_invoice_url
      }));

      res.json({ invoices: formattedInvoices });
    } catch (error) {
      console.error('Invoice retrieval error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Get payment methods
router.get('/payment-methods',
  authMiddleware,
  tenantIsolation,
  async (req, res) => {
    try {
      const org = req.organization;

      if (!org.billing?.stripeCustomerId) {
        return res.json({ paymentMethods: [] });
      }

      const paymentMethods = await stripe.paymentMethods.list({
        customer: org.billing.stripeCustomerId,
        type: 'card'
      });

      const formatted = paymentMethods.data.map(pm => ({
        id: pm.id,
        brand: pm.card.brand,
        last4: pm.card.last4,
        expMonth: pm.card.exp_month,
        expYear: pm.card.exp_year,
        isDefault: pm.id === org.billing.paymentMethodId
      }));

      res.json({ paymentMethods: formatted });
    } catch (error) {
      console.error('Payment methods error:', error);
      res.status(500).json({ error: error.message });
    }
  }
);

// Stripe webhook handler
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(
      req.body,
      sig,
      process.env.STRIPE_WEBHOOK_SECRET
    );
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  try {
    switch (event.type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.created': {
        const subscription = event.data.object;
        const org = await Organization.findOne({
          'billing.stripeSubscriptionId': subscription.id
        });

        if (org) {
          org.subscription.status = subscription.status === 'active' ? 'active' : 'pending';
          org.subscription.currentPeriodStart = new Date(subscription.current_period_start * 1000);
          org.subscription.currentPeriodEnd = new Date(subscription.current_period_end * 1000);
          await org.save();
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const org = await Organization.findOne({
          'billing.stripeSubscriptionId': subscription.id
        });

        if (org) {
          org.subscription.status = 'cancelled';
          org.subscription.plan = 'free';
          org.updateLimitsForPlan('free');
          await org.save();
        }
        break;
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        // Log successful payment
        console.log('Payment succeeded:', invoice.id);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const org = await Organization.findOne({
          'billing.stripeCustomerId': invoice.customer
        });

        if (org) {
          org.subscription.status = 'past_due';
          await org.save();
        }
        break;
      }

      default:
        console.log(`Unhandled event type ${event.type}`);
    }

    res.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    res.status(500).json({ error: 'Webhook handler failed' });
  }
});

export default router;
