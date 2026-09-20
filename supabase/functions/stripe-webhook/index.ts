import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import Stripe from 'npm:stripe@17.3.1';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const stripeSecret = Deno.env.get("STRIPE_SECRET_KEY");
    const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");

    if (!stripeSecret || !webhookSecret) {
      return new Response(JSON.stringify({ error: "Stripe webhook not configured" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = new Stripe(stripeSecret, { apiVersion: "2024-12-18.acacia" });
    const supabase = createClient(supabaseUrl, supabaseKey);

    const sig = req.headers.get("stripe-signature");
    if (!sig) {
      return new Response(JSON.stringify({ error: "Missing stripe-signature header" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawBody = await req.text();
    let event: Stripe.Event;
    try {
      event = await stripe.webhooks.constructEventAsync(rawBody, sig, webhookSecret);
    } catch (err) {
      return new Response(JSON.stringify({ error: `Webhook signature verification failed: ${err.message}` }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const tenantId = session.metadata?.tenant_id;
        const planId = session.metadata?.plan_id;
        const customerId = session.customer as string;
        const subscriptionId = session.subscription as string;

        if (tenantId && planId) {
          // Retrieve subscription for period dates
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);

          await supabase.from('tenant_subscriptions').upsert({
            tenant_id: tenantId,
            plan_id: parseInt(planId),
            status: 'active',
            stripe_customer_id: customerId,
            stripe_subscription_id: subscriptionId,
            current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
            current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
            cancelled_at: null,
          }, { onConflict: 'tenant_id' });

          await supabase.from('tenants').update({ status: 'active' }).eq('id', tenantId);

          // Log audit
          await supabase.rpc('log_audit_action', {
            p_tenant_id: tenantId,
            p_actor_id: null,
            p_action: 'subscription_activated',
            p_entity: 'subscription',
            p_entity_id: subscriptionId,
            p_details: { plan_id: parseInt(planId) },
          });
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object as Stripe.Subscription;
        const { data: existing } = await supabase
          .from('tenant_subscriptions')
          .select('id, tenant_id')
          .eq('stripe_subscription_id', sub.id)
          .maybeSingle();

        if (existing) {
          const status = sub.status === 'active' ? 'active' :
                         sub.status === 'past_due' ? 'past_due' :
                         sub.status === 'canceled' ? 'cancelled' :
                         sub.status === 'trialing' ? 'trialing' : 'suspended';

          await supabase.from('tenant_subscriptions').update({
            status,
            current_period_start: sub.current_period_start ? new Date(sub.current_period_start * 1000).toISOString() : null,
            current_period_end: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
            cancelled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
          }).eq('id', existing.id);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await supabase.from('tenant_subscriptions')
          .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
          .eq('stripe_subscription_id', sub.id);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        await supabase.from('tenant_subscriptions')
          .update({ status: 'past_due' })
          .eq('stripe_customer_id', invoice.customer as string);
        break;
      }
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
