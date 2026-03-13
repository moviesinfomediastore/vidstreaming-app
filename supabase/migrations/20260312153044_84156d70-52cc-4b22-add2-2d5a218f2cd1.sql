
-- Create videos table
CREATE TABLE public.videos (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  slug TEXT NOT NULL UNIQUE,
  price NUMERIC(10,2) NOT NULL DEFAULT 1.99,
  preview_duration_seconds INTEGER NOT NULL DEFAULT 10,
  video_path TEXT,
  thumbnail_path TEXT,
  duration_minutes NUMERIC(5,1),
  is_published BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create payments table
CREATE TABLE public.payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  paypal_order_id TEXT,
  amount NUMERIC(10,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  payer_email TEXT,
  session_token TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create video_analytics table
CREATE TABLE public.video_analytics (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  video_id UUID NOT NULL REFERENCES public.videos(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  watch_duration_seconds INTEGER DEFAULT 0,
  visitor_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_analytics ENABLE ROW LEVEL SECURITY;

-- Videos: public read for published videos
CREATE POLICY "Published videos are viewable by everyone"
  ON public.videos FOR SELECT
  USING (is_published = true);

-- Payments: no direct public access
CREATE POLICY "Payments are managed server-side"
  ON public.payments FOR SELECT
  USING (false);

-- Analytics: insert allowed, select restricted
CREATE POLICY "Anyone can insert analytics"
  ON public.video_analytics FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Analytics readable server-side only"
  ON public.video_analytics FOR SELECT
  USING (false);

-- Indexes
CREATE INDEX idx_videos_slug ON public.videos(slug);
CREATE INDEX idx_payments_video_id ON public.payments(video_id);
CREATE INDEX idx_payments_session_token ON public.payments(session_token);
CREATE INDEX idx_analytics_video_id ON public.video_analytics(video_id);
CREATE INDEX idx_analytics_event_type ON public.video_analytics(event_type);

-- Updated_at trigger
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_videos_updated_at
  BEFORE UPDATE ON public.videos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('videos', 'videos', false);
INSERT INTO storage.buckets (id, name, public) VALUES ('thumbnails', 'thumbnails', true);

-- Thumbnails publicly readable
CREATE POLICY "Thumbnails are publicly accessible"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'thumbnails');
