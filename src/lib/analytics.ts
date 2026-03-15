import { supabase } from '@/integrations/supabase/client';
import { getVisitorId } from './visitor';

export type EventType = 
  | 'page_visit' 
  | 'play_start' 
  | 'play_progress' 
  | 'paywall_reached' 
  | 'payment_initiated'
  | 'payment_error'
  | 'payment_completed'
  | 'page_leave';

// Generate or retrieve a session ID for tracking a user's single funnel journey
export function getSessionId(): string {
  let sessionId = sessionStorage.getItem('analytics_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    sessionStorage.setItem('analytics_session_id', sessionId);
  }
  return sessionId;
}

export async function trackEvent(
  videoId: string,
  eventType: EventType,
  watchDurationSeconds: number = 0,
  eventData: Record<string, any> = {}
) {
  try {
    const payload = {
      video_id: videoId,
      event_type: eventType,
      watch_duration_seconds: watchDurationSeconds,
      visitor_id: getVisitorId(),
      session_id: getSessionId(),
      event_data: eventData,
    };

    if (eventType === 'page_leave') {
      // Use keepalive fetch to ensure payload is sent when tab is closing
      const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/video_analytics`;
      const key = import.meta.env.VITE_SUPABASE_ANON_KEY;
      fetch(url, {
        method: 'POST',
        headers: {
          'apikey': key,
          'Authorization': `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(console.error);
    } else {
      await supabase.from('video_analytics').insert(payload);
    }
  } catch (e) {
    console.error('Analytics tracking error:', e);
  }
}
