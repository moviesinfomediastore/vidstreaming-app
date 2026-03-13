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
    const { videoId, sessionToken, fullAccess } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Get video info
    const { data: video, error } = await supabase
      .from('videos')
      .select('video_path, is_published')
      .eq('id', videoId)
      .single();

    if (error || !video || !video.video_path) {
      return new Response(JSON.stringify({ error: 'Video not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // If full access requested, validate session token
    if (fullAccess && sessionToken) {
      const { data: payment } = await supabase
        .from('payments')
        .select('id')
        .eq('video_id', videoId)
        .eq('session_token', sessionToken)
        .eq('status', 'completed')
        .single();

      if (!payment) {
        return new Response(JSON.stringify({ error: 'Invalid session' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Generate signed URL (1 hour expiry)
    const { data: signedUrl, error: signError } = await supabase.storage
      .from('videos')
      .createSignedUrl(video.video_path, 3600);

    if (signError || !signedUrl) {
      return new Response(JSON.stringify({ error: 'Could not generate URL' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ url: signedUrl.signedUrl }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
