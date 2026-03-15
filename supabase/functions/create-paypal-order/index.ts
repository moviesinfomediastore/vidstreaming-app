import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { videoId, slug } = await req.json();

    const PAYPAL_CLIENT_ID = Deno.env.get('PAYPAL_CLIENT_ID');
    const PAYPAL_SECRET = Deno.env.get('PAYPAL_SECRET');
    const PAYPAL_API = Deno.env.get('PAYPAL_API') || 'https://api-m.sandbox.paypal.com';
    const PAYPAL_CURRENCY = Deno.env.get('PAYPAL_CURRENCY') || 'USD';

    if (!PAYPAL_CLIENT_ID || !PAYPAL_SECRET) {
      return new Response(JSON.stringify({
        message: 'PayPal not configured. Demo mode: payment will be simulated.',
        demo: true,
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get video price
    const { data: video } = await supabase
      .from('videos')
      .select('price, title, slug')
      .eq('id', videoId)
      .single();

    if (!video) {
      return new Response(JSON.stringify({ error: 'Video not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get PayPal access token
    const tokenRes = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const tokenData = await tokenRes.json();
    console.log('PayPal token response status:', tokenRes.status);

    if (!tokenData.access_token) {
      console.error('PayPal token error:', JSON.stringify(tokenData));
      return new Response(JSON.stringify({ error: 'Failed to authenticate with PayPal' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const origin = req.headers.get('origin') || req.headers.get('referer')?.replace(/\/$/, '') || '';
    const videoSlug = slug || video.slug;

    // Create order
    const orderBody = {
      intent: 'CAPTURE',
      purchase_units: [{
        amount: {
          currency_code: PAYPAL_CURRENCY,
          value: video.price.toFixed(2),
        },
        description: `Video access: ${video.title}`,
      }],
      application_context: {
        brand_name: 'VidStreaming',
        return_url: `${origin}/video/${videoSlug}`,
        cancel_url: `${origin}/video/${videoSlug}?cancelled=true`,
        user_action: 'PAY_NOW',
        shipping_preference: 'NO_SHIPPING',
      },
    };
    console.log('Creating PayPal order with currency:', PAYPAL_CURRENCY, 'amount:', video.price.toFixed(2));

    const orderRes = await fetch(`${PAYPAL_API}/v2/checkout/orders`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderBody),
    });
    const order = await orderRes.json();
    console.log('PayPal order response status:', orderRes.status);

    if (!orderRes.ok || !order.id) {
      console.error('PayPal order creation failed:', JSON.stringify(order));
      const errorDetail = order.details?.[0]?.description || order.message || 'PayPal rejected the order';
      return new Response(JSON.stringify({ error: errorDetail }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const approvalUrl = order.links?.find((l: any) => l.rel === 'approve')?.href;

    if (!approvalUrl) {
      console.error('No approval URL in PayPal response:', JSON.stringify(order));
      return new Response(JSON.stringify({ error: 'PayPal did not return an approval URL' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('PayPal order created successfully:', order.id);

    return new Response(JSON.stringify({
      orderId: order.id,
      approvalUrl,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('create-paypal-order error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
