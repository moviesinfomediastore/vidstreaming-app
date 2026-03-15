import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, range',
  'Access-Control-Expose-Headers': 'content-range, accept-ranges, content-length, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

const CHUNK_SIZE = 45 * 1024 * 1024; // 45MB — must match the upload chunk size

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const videoId = url.searchParams.get('id');
    const sessionToken = url.searchParams.get('token');
    const accessType = url.searchParams.get('access') || 'preview';

    if (!videoId) {
      return new Response('Missing video id', { status: 400, headers: corsHeaders });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch video metadata
    const { data: video, error } = await supabase
      .from('videos')
      .select('video_path, chunk_count, total_bytes, chunk_prefix, is_published, preview_duration_seconds')
      .eq('id', videoId)
      .single();

    if (error || !video) {
      return new Response('Video not found', { status: 404, headers: corsHeaders });
    }

    // --- Access control ---
    let isFullAccess = false;
    if (accessType === 'full') {
      if (!sessionToken) {
        return new Response('Payment required', { status: 403, headers: corsHeaders });
      }
      const { data: payment } = await supabase
        .from('payments')
        .select('id')
        .eq('video_id', videoId)
        .eq('session_token', sessionToken)
        .eq('status', 'completed')
        .single();

      if (!payment) {
        return new Response('Invalid session', { status: 403, headers: corsHeaders });
      }
      isFullAccess = true;
    }

    // --- Legacy single-file videos: redirect to signed URL ---
    if (!video.chunk_count || !video.chunk_prefix) {
      const expirySeconds = isFullAccess ? 3600 : 60;
      const { data: signedUrl } = await supabase.storage
        .from('videos')
        .createSignedUrl(video.video_path, expirySeconds);

      if (!signedUrl) {
        return new Response('Could not generate URL', { status: 500, headers: corsHeaders });
      }
      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, 'Location': signedUrl.signedUrl },
      });
    }

    // --- Chunked video: handle Range requests ---
    const totalBytes = Number(video.total_bytes);
    const chunkCount = video.chunk_count;
    const prefix = video.chunk_prefix;

    // Parse Range header
    const rangeHeader = req.headers.get('Range');
    let start = 0;
    let end = Math.min(totalBytes - 1, CHUNK_SIZE - 1); // Default: first chunk worth

    if (rangeHeader) {
      const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
      if (match) {
        start = parseInt(match[1], 10);
        end = match[2] ? parseInt(match[2], 10) : Math.min(start + CHUNK_SIZE - 1, totalBytes - 1);
      }
    }

    // Clamp end
    if (end >= totalBytes) end = totalBytes - 1;

    // --- Backend Preview Security (Byte-Range Clipping) ---
    // If user hasn't paid, we block them from downloading the rest of the video
    if (!isFullAccess) {
      // Allow 3 MB per second of preview (very high bitrate safety margin)
      const previewDuration = video.preview_duration_seconds || 60;
      const maxAllowedBytes = previewDuration * 3 * 1024 * 1024;
      const moovAtomSafetyLimit = totalBytes - (1 * 1024 * 1024); // Last 1MB (for moov atom)

      // If the start byte is in the restricted middle zone, reject it
      if (start > maxAllowedBytes && start < moovAtomSafetyLimit) {
        console.warn(`Preview security blocked range request: start=${start}, allowed=${maxAllowedBytes}`);
        return new Response('Preview restrict: out of bounds', {
          status: 403,
          headers: corsHeaders,
        });
      }

      // If they request a range that crosses the boundary, clamp the end
      if (start <= maxAllowedBytes && end > maxAllowedBytes) {
        end = maxAllowedBytes;
      }
    }

    // Determine which chunk contains 'start'
    const chunkIndex = Math.floor(start / CHUNK_SIZE);
    const chunkFileName = `chunk_${String(chunkIndex).padStart(4, '0')}`;
    const storagePath = `${prefix}${chunkFileName}`;

    // Byte offset within this chunk
    const chunkStart = start - (chunkIndex * CHUNK_SIZE);
    // Don't read beyond this chunk's boundary for simplicity
    const chunkEnd = Math.min(end - (chunkIndex * CHUNK_SIZE), CHUNK_SIZE - 1);
    // Adjust 'end' to not cross chunk boundary
    const actualEnd = chunkIndex * CHUNK_SIZE + chunkEnd;

    // Download the chunk from Supabase storage
    const { data: chunkData, error: downloadError } = await supabase.storage
      .from('videos')
      .download(storagePath);

    if (downloadError || !chunkData) {
      console.error('Download error:', downloadError, 'path:', storagePath);
      return new Response('Chunk not found', { status: 404, headers: corsHeaders });
    }

    // Slice the exact bytes needed from this chunk
    const buffer = await chunkData.arrayBuffer();
    const slice = buffer.slice(chunkStart, chunkEnd + 1);

    const responseHeaders = {
      ...corsHeaders,
      'Content-Type': 'video/mp4',
      'Content-Length': String(slice.byteLength),
      'Content-Range': `bytes ${start}-${actualEnd}/${totalBytes}`,
      'Accept-Ranges': 'bytes',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    };

    return new Response(slice, {
      status: 206,
      headers: responseHeaders,
    });
  } catch (err) {
    console.error('Stream error:', err);
    return new Response(String(err), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
