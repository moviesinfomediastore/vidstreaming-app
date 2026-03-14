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
      .select('video_path, is_published, preview_duration_seconds')
      .eq('id', videoId)
      .single();

    if (error || !video || !video.video_path) {
      return new Response(JSON.stringify({ error: 'Video not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Determine access level and URL expiry
    let isFullAccess = false;

    if (fullAccess && sessionToken) {
      // Validate payment session for full access
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
      isFullAccess = true;
    } else if (fullAccess) {
      // Full access requested but no valid session token
      return new Response(JSON.stringify({ error: 'Payment required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Preview: short-lived URL
    // Full access: longer URL (2 hours) for comfortable viewing
    const expirySeconds = isFullAccess ? 7200 : 60;

    // Legacy MP4 handling
    if (!video.video_path.endsWith('.m3u8')) {
      const { data: signedUrl, error: signError } = await supabase.storage
        .from('videos')
        .createSignedUrl(video.video_path, expirySeconds, { download: false });

      if (signError || !signedUrl) {
        return new Response(JSON.stringify({ error: 'Could not generate URL' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(JSON.stringify({
        url: signedUrl.signedUrl,
        expiresIn: expirySeconds,
        isFullAccess,
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // New HLS Pipeline
    // 1. Download Master Playlist
    const { data: fileData, error: fileError } = await supabase.storage
      .from('videos')
      .download(video.video_path);
      
    if (fileError || !fileData) {
      return new Response(JSON.stringify({ error: 'Could not read playlist' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const m3u8Text = await fileData.text();
    const folderPath = video.video_path.split('/').slice(0, -1).join('/');
    
    // 2. Parse and Enforce Paywall Duration
    const lines = m3u8Text.split('\n');
    const tsFilesToSign: string[] = [];
    const parsedLines: { type: 'header' | 'extinf' | 'ts' | 'end', val: string, time?: number }[] = [];

    let accumulatedTime = 0;
    const MAX_PREVIEW_DURATION = video.preview_duration_seconds || 10;

    for (let i = 0; i < lines.length; i++) {
       const line = lines[i].trim();
       if (!line) continue;
       
       if (line.startsWith('#EXTINF:')) {
          const time = parseFloat(line.split(':')[1].split(',')[0]);
          if (!isFullAccess && accumulatedTime >= MAX_PREVIEW_DURATION) {
             break; // STOP processing chunks! The paywall is enforced right here.
          }
          accumulatedTime += time;
          parsedLines.push({ type: 'extinf', val: line, time });
       } else if (line.endsWith('.ts')) {
          const fullTsPath = `${folderPath}/${line}`;
          tsFilesToSign.push(fullTsPath);
          parsedLines.push({ type: 'ts', val: fullTsPath });
       } else {
          parsedLines.push({ type: 'header', val: line });
       }
    }
    
    // Explicitly cap the stream for players
    parsedLines.push({ type: 'end', val: '#EXT-X-ENDLIST' });

    // 3. Bulk Sign Allowed Chunk URLs
    const { data: signedUrlsData, error: signError } = await supabase.storage
      .from('videos')
      .createSignedUrls(tsFilesToSign, expirySeconds);

    if (signError || !signedUrlsData) {
      return new Response(JSON.stringify({ error: 'Failed to sign chunks' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const signedUrlMap = new Map();
    signedUrlsData.forEach(item => {
      if (item.signedUrl) signedUrlMap.set(item.path, item.signedUrl);
    });

    // 4. Reconstruct Secure Temporary Playlist
    let finalM3u8 = '';
    for (const p of parsedLines) {
      if (p.type === 'ts') {
         const signedUrl = signedUrlMap.get(p.val);
         if (!signedUrl) continue;
         finalM3u8 += signedUrl + '\n';
      } else if (p.type === 'extinf' || p.type === 'end') {
         finalM3u8 += p.val + '\n';
      } else if (p.type === 'header') {
         if (p.val !== '#EXT-X-ENDLIST') finalM3u8 += p.val + '\n';
      }
    }

    // 5. Return Playlist Text to Client
    return new Response(JSON.stringify({
      playlistText: finalM3u8,
      expiresIn: expirySeconds,
      isFullAccess,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
