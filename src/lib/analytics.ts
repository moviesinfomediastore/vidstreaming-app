import { supabase } from '@/integrations/supabase/client';
import { getVisitorId } from './visitor';

type EventType = 'page_visit' | 'play_start' | 'play_progress' | 'paywall_reached' | 'payment_completed';

export async function trackEvent(
  videoId: string,
  eventType: EventType,
  watchDurationSeconds: number = 0
) {
  try {
    await supabase.from('video_analytics').insert({
      video_id: videoId,
      event_type: eventType,
      watch_duration_seconds: watchDurationSeconds,
      visitor_id: getVisitorId(),
    });
  } catch (e) {
    console.error('Analytics tracking error:', e);
  }
}
