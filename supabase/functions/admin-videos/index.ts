import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ADMIN_PASSWORD = Deno.env.get('ADMIN_PASSWORD') || 'admin123';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { action, adminToken, id, video, videoId } = body;

    if (!adminToken || adminToken.length < 10) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    if (action === 'list') {
      const { data: videos } = await supabase
        .from('videos')
        .select('*')
        .order('created_at', { ascending: false });

      // Get analytics summary for each video
      const analyticsMap: Record<string, any> = {};
      if (videos) {
        for (const v of videos) {
          const { data: events } = await supabase
            .from('video_analytics')
            .select('event_type, watch_duration_seconds')
            .eq('video_id', v.id);

          if (events) {
            const pageVisits = events.filter(e => e.event_type === 'page_visit').length;
            const playStarts = events.filter(e => e.event_type === 'play_start').length;
            const paywallHits = events.filter(e => e.event_type === 'paywall_reached').length;
            const payments = events.filter(e => e.event_type === 'payment_completed').length;
            const watchDurations = events.filter(e => e.watch_duration_seconds > 0).map(e => e.watch_duration_seconds);
            const avgWatch = watchDurations.length > 0
              ? Math.round(watchDurations.reduce((a, b) => a + b, 0) / watchDurations.length)
              : 0;

            analyticsMap[v.id] = {
              video_id: v.id,
              page_visits: pageVisits,
              play_starts: playStarts,
              paywall_hits: paywallHits,
              payments,
              avg_watch: avgWatch,
            };
          }
        }
      }

      return new Response(JSON.stringify({ videos, analytics: analyticsMap }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'create') {
      const { data, error } = await supabase.from('videos').insert(video).select().single();
      if (error) return new Response(JSON.stringify({ error: error.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
      return new Response(JSON.stringify({ video: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'update') {
      const { data, error } = await supabase.from('videos').update(video).eq('id', id).select().single();
      if (error) return new Response(JSON.stringify({ error: error.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
      return new Response(JSON.stringify({ video: data }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'delete') {
      await supabase.from('videos').delete().eq('id', id);
      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'analytics') {
      // Get daily breakdown for a specific video
      const { data: events } = await supabase
        .from('video_analytics')
        .select('event_type, created_at')
        .eq('video_id', videoId)
        .order('created_at', { ascending: true });

      if (!events) {
        return new Response(JSON.stringify({ analytics: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Group by date
      const dailyMap: Record<string, { visits: number; payments: number }> = {};
      for (const e of events) {
        const date = e.created_at.split('T')[0];
        if (!dailyMap[date]) dailyMap[date] = { visits: 0, payments: 0 };
        if (e.event_type === 'page_visit') dailyMap[date].visits++;
        if (e.event_type === 'payment_completed') dailyMap[date].payments++;
      }

      const analytics = Object.entries(dailyMap).map(([date, data]) => ({ date, ...data }));

      return new Response(JSON.stringify({ analytics }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (action === 'transactions') {
      // Fetch all payments with video titles
      const { data: payments } = await supabase
        .from('payments')
        .select('id, video_id, paypal_order_id, amount, status, payer_email, session_token, created_at')
        .order('created_at', { ascending: false });

      if (!payments) {
        return new Response(JSON.stringify({ transactions: [] }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Get video titles for each unique video_id
      const videoIds = [...new Set(payments.map(p => p.video_id))];
      const { data: videos } = await supabase
        .from('videos')
        .select('id, title')
        .in('id', videoIds);

      const titleMap: Record<string, string> = {};
      if (videos) {
        for (const v of videos) titleMap[v.id] = v.title;
      }

      const transactions = payments.map(p => ({
        ...p,
        video_title: titleMap[p.video_id] || 'Unknown Video',
      }));

      return new Response(JSON.stringify({ transactions }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Unknown action' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
