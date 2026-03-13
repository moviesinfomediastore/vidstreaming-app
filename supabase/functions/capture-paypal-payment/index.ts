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
    const { orderId, videoId } = await req.json();
    console.log('Capturing payment for order:', orderId, 'video:', videoId);

    const PAYPAL_CLIENT_ID = Deno.env.get('PAYPAL_CLIENT_ID');
    const PAYPAL_SECRET = Deno.env.get('PAYPAL_SECRET');
    const PAYPAL_API = Deno.env.get('PAYPAL_API') || 'https://api-m.sandbox.paypal.com';

    if (!PAYPAL_CLIENT_ID || !PAYPAL_SECRET) {
      return new Response(JSON.stringify({ error: 'PayPal not configured' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get video
    const { data: video } = await supabase
      .from('videos')
      .select('price')
      .eq('id', videoId)
      .single();

    if (!video) {
      return new Response(JSON.stringify({ error: 'Video not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get access token
    const tokenRes = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${btoa(`${PAYPAL_CLIENT_ID}:${PAYPAL_SECRET}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'grant_type=client_credentials',
    });
    const tokenData = await tokenRes.json();
    console.log('PayPal token status:', tokenRes.status);

    if (!tokenData.access_token) {
      console.error('PayPal token error:', JSON.stringify(tokenData));
      return new Response(JSON.stringify({ error: 'Failed to authenticate with PayPal' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Capture payment
    const captureRes = await fetch(`${PAYPAL_API}/v2/checkout/orders/${orderId}/capture`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${tokenData.access_token}`,
        'Content-Type': 'application/json',
      },
    });
    const capture = await captureRes.json();
    console.log('PayPal capture status:', captureRes.status, 'result:', JSON.stringify(capture).substring(0, 500));

    if (capture.status !== 'COMPLETED') {
      const errorDetail = capture.details?.[0]?.description || capture.message || 'Payment not completed';
      console.error('Capture failed:', errorDetail);
      return new Response(JSON.stringify({ error: errorDetail }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Generate session token
    const sessionToken = crypto.randomUUID();
    const payerEmail = capture.payer?.email_address || null;

    // Record payment
    await supabase.from('payments').insert({
      video_id: videoId,
      paypal_order_id: orderId,
      amount: video.price,
      status: 'completed',
      payer_email: payerEmail,
      session_token: sessionToken,
    });

    console.log('Payment recorded successfully for order:', orderId);

    return new Response(JSON.stringify({
      success: true,
      sessionToken,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('capture-paypal-payment error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
