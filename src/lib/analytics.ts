import { getVisitorId, generateUUID } from './visitor';
import { getDeviceInfo, getTrafficSource } from './device';

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
    sessionId = generateUUID();
    sessionStorage.setItem('analytics_session_id', sessionId);
  }
  return sessionId;
}

// Lazily cached device + traffic info (computed once per page load)
let _deviceInfo: ReturnType<typeof getDeviceInfo> | null = null;
let _trafficSource: ReturnType<typeof getTrafficSource> | null = null;

function getClientContext() {
  if (!_deviceInfo) _deviceInfo = getDeviceInfo();
  if (!_trafficSource) _trafficSource = getTrafficSource();
  return { ..._deviceInfo, ..._trafficSource };
}

export async function trackEvent(
  videoId: string,
  eventType: EventType,
  watchDurationSeconds: number = 0,
  eventData: Record<string, any> = {}
) {
  try {
    const ctx = getClientContext();
    const payload = {
      video_id: videoId,
      event_type: eventType,
      watch_duration_seconds: watchDurationSeconds,
      visitor_id: getVisitorId(),
      session_id: getSessionId(),
      event_data: eventData,
      // Device & browser (from client)
      device_type: ctx.device_type,
      browser: ctx.browser,
      os: ctx.os,
      screen_resolution: ctx.screen_resolution,
      language: ctx.language,
      // Traffic source (from client)
      referrer: ctx.referrer,
      utm_source: ctx.utm_source,
      utm_medium: ctx.utm_medium,
      utm_campaign: ctx.utm_campaign,
    };

    const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID;
    const url = `https://${projectId}.supabase.co/functions/v1/track-event`;

    if (eventType === 'page_leave') {
      // Use keepalive fetch to ensure payload is sent when tab is closing
      fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {});
    } else {
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
  } catch (e) {
    console.error('Analytics tracking error:', e);
  }
}
