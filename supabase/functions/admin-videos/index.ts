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
      const { timeRange = 'all' } = body;
      
      let query = supabase
        .from('video_analytics')
        .select('*')
        .eq('video_id', videoId)
        .order('created_at', { ascending: true });

      if (timeRange !== 'all') {
        const now = new Date();
        let ms = 0;
        if (timeRange === '5m') ms = 5 * 60 * 1000;
        else if (timeRange === '30m') ms = 30 * 60 * 1000;
        else if (timeRange === '1h') ms = 60 * 60 * 1000;
        else if (timeRange === '10h') ms = 10 * 60 * 60 * 1000;
        else if (timeRange === '12h') ms = 12 * 60 * 60 * 1000;
        else if (timeRange === '24h') ms = 24 * 60 * 60 * 1000;
        else if (timeRange === '7d') ms = 7 * 24 * 60 * 60 * 1000;
        else if (timeRange === '1d') ms = 24 * 60 * 60 * 1000; // alias for 24h

        if (ms > 0) {
          const limitDate = new Date(now.getTime() - ms);
          query = query.gte('created_at', limitDate.toISOString());
        }
      }

      const { data: events } = await query;

      if (!events || events.length === 0) {
        return new Response(JSON.stringify({ trend: [], funnel: {}, errors: [], engagement: {} }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const trendMap: Record<string, { visits: number; payments: number }> = {};
      const funnel = { visits: 0, starts: 0, paywalls: 0, payment_clicks: 0, successes: 0 };
      const errors: any[] = [];
      let totalTimeOnPage = 0;
      let pageLeaveCount = 0;
      const progress = { '25': 0, '50': 0, '75': 0 };

      // Determine grouping format based on time range
      const isMinutes = ['5m', '30m', '1h'].includes(timeRange);
      const isHours = ['10h', '12h', '24h', '1d'].includes(timeRange);

      for (const e of events) {
        // Grouping: Day by default, Hour or Minute if zooming in
        let timeKey = e.created_at.split('T')[0];
        if (isMinutes) {
          timeKey = e.created_at.substring(0, 16).replace('T', ' '); // YYYY-MM-DD HH:mm
        } else if (isHours) {
          timeKey = e.created_at.substring(0, 13).replace('T', ' ') + ':00'; // YYYY-MM-DD HH:00
        }

        if (!trendMap[timeKey]) trendMap[timeKey] = { visits: 0, payments: 0 };

        switch (e.event_type) {
          case 'page_visit': 
            trendMap[timeKey].visits++; 
            funnel.visits++; 
            break;
          case 'payment_completed': 
            trendMap[timeKey].payments++; 
            funnel.successes++; 
            break;
          case 'play_start': 
            funnel.starts++; 
            break;
          case 'paywall_reached': 
            funnel.paywalls++; 
            break;
          case 'payment_initiated': 
            funnel.payment_clicks++; 
            break;
          case 'payment_error':
            errors.push({
              id: e.id,
              created_at: e.created_at,
              session_id: e.session_id,
              message: e.event_data?.error_message || 'Unknown error'
            });
            break;
          case 'page_leave':
            if (e.watch_duration_seconds > 0) {
              totalTimeOnPage += e.watch_duration_seconds;
              pageLeaveCount++;
            }
            break;
          case 'play_progress':
            if (e.event_data?.percentage === 25) progress['25']++;
            if (e.event_data?.percentage === 50) progress['50']++;
            if (e.event_data?.percentage === 75) progress['75']++;
            break;
        }
      }

      const trend = Object.entries(trendMap).map(([date, data]) => ({ date, ...data }));
      const engagement = {
        avg_time_on_page: pageLeaveCount > 0 ? Math.round(totalTimeOnPage / pageLeaveCount) : 0,
        progress
      };

      // Sort errors newest first
      errors.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

      return new Response(JSON.stringify({ trend, funnel, errors, engagement }), {
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
