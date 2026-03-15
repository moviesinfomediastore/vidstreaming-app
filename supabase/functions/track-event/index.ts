import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// In-memory geo cache to avoid duplicate lookups within a single invocation
const geoCache = new Map<string, any>();

async function resolveGeo(ip: string) {
  // Skip private/local IPs
  if (!ip || ip === '127.0.0.1' || ip === '::1' || ip.startsWith('192.168.') || ip.startsWith('10.')) {
    return { country: 'Unknown', countryCode: 'XX', region: '', city: '', timezone: '' };
  }

  if (geoCache.has(ip)) return geoCache.get(ip);

  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=country,countryCode,regionName,city,timezone`);
    if (res.ok) {
      const data = await res.json();
      if (data.country) {
        const geo = {
          country: data.country,
          countryCode: data.countryCode,
          region: data.regionName || '',
          city: data.city || '',
          timezone: data.timezone || '',
        };
        geoCache.set(ip, geo);
        return geo;
      }
    }
  } catch {
    // Geo lookup failed — continue without it
  }
  return { country: 'Unknown', countryCode: 'XX', region: '', city: '', timezone: '' };
}

serve(async (req: any) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const {
      video_id, event_type, watch_duration_seconds = 0, visitor_id, session_id,
      event_data = {}, device_type, browser, os, screen_resolution, language,
      referrer, utm_source, utm_medium, utm_campaign,
    } = body;

    if (!video_id || !event_type) {
      return new Response(JSON.stringify({ error: 'video_id and event_type are required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Resolve IP from request headers
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || req.headers.get('x-real-ip')
      || '';

    const geo = await resolveGeo(ip);

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { error } = await supabase.from('video_analytics').insert({
      video_id,
      event_type,
      watch_duration_seconds,
      visitor_id: visitor_id || null,
      session_id: session_id || null,
      event_data,
      // Geo (server-side)
      country: geo.country,
      country_code: geo.countryCode,
      region: geo.region,
      city: geo.city,
      timezone: geo.timezone,
      // Device (client-side)
      device_type: device_type || null,
      browser: browser || null,
      os: os || null,
      screen_resolution: screen_resolution || null,
      language: language || null,
      // Traffic source (client-side)
      referrer: referrer || null,
      utm_source: utm_source || null,
      utm_medium: utm_medium || null,
      utm_campaign: utm_campaign || null,
    });

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
