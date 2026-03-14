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
    const { adminToken, bucket, storagePath, storagePaths, contentType } = await req.json();

    if (!adminToken || adminToken.length < 10) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!bucket) {
      return new Response(JSON.stringify({ error: 'Missing bucket' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // If an array of paths is provided (e.g. for batch HLS uploads)
    if (storagePaths && Array.isArray(storagePaths)) {
      const results = await Promise.all(
        storagePaths.map(async (path) => {
          const { data, error } = await supabase.storage
            .from(bucket)
            .createSignedUploadUrl(path);
          return { path, signedUrl: data?.signedUrl, token: data?.token, error: error?.message };
        })
      );
      return new Response(JSON.stringify({ urls: results }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Default legacy single file upload
    if (!storagePath) {
      return new Response(JSON.stringify({ error: 'Missing storage path' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Create a signed upload URL so the client can upload directly to storage
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUploadUrl(storagePath);

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ signedUrl: data.signedUrl, token: data.token, path: data.path }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
