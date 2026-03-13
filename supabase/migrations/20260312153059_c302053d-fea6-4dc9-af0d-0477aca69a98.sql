
-- Replace overly permissive analytics insert policy with a more restrictive one
DROP POLICY "Anyone can insert analytics" ON public.video_analytics;

CREATE POLICY "Anyone can insert valid analytics events"
  ON public.video_analytics FOR INSERT
  WITH CHECK (
    event_type IN ('page_visit', 'play_start', 'play_progress', 'paywall_reached', 'payment_completed')
    AND video_id IS NOT NULL
  );
