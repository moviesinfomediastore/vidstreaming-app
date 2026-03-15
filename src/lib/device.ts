// Device, browser, OS detection + UTM parameter extraction
// Lightweight — no external libraries needed

interface DeviceInfo {
  device_type: 'mobile' | 'tablet' | 'desktop';
  browser: string;
  os: string;
  screen_resolution: string;
  language: string;
}

interface TrafficSource {
  referrer: string;
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
}

export function getDeviceInfo(): DeviceInfo {
  const ua = navigator.userAgent || '';

  // Device type
  let device_type: 'mobile' | 'tablet' | 'desktop' = 'desktop';
  if (/iPad|Android(?!.*Mobile)|Tablet/i.test(ua)) {
    device_type = 'tablet';
  } else if (/iPhone|iPod|Android.*Mobile|webOS|BlackBerry|Opera Mini|IEMobile/i.test(ua)) {
    device_type = 'mobile';
  }

  // Browser detection
  let browser = 'Unknown';
  if (/EdgA?\/(\d+)/i.test(ua)) browser = 'Edge ' + ua.match(/EdgA?\/(\d+)/i)?.[1];
  else if (/OPR\/(\d+)/i.test(ua)) browser = 'Opera ' + ua.match(/OPR\/(\d+)/i)?.[1];
  else if (/SamsungBrowser\/(\d+)/i.test(ua)) browser = 'Samsung ' + ua.match(/SamsungBrowser\/(\d+)/i)?.[1];
  else if (/FBAN|FBAV/i.test(ua)) browser = 'Facebook';
  else if (/Instagram/i.test(ua)) browser = 'Instagram';
  else if (/CriOS\/(\d+)/i.test(ua)) browser = 'Chrome ' + ua.match(/CriOS\/(\d+)/i)?.[1];
  else if (/FxiOS\/(\d+)/i.test(ua)) browser = 'Firefox ' + ua.match(/FxiOS\/(\d+)/i)?.[1];
  else if (/Chrome\/(\d+)/i.test(ua) && !/Chromium/i.test(ua)) browser = 'Chrome ' + ua.match(/Chrome\/(\d+)/i)?.[1];
  else if (/Safari\/(\d+)/i.test(ua) && !/Chrome/i.test(ua)) browser = 'Safari';
  else if (/Firefox\/(\d+)/i.test(ua)) browser = 'Firefox ' + ua.match(/Firefox\/(\d+)/i)?.[1];

  // OS detection
  let os = 'Unknown';
  if (/Windows NT 10/i.test(ua)) os = 'Windows 10+';
  else if (/Windows/i.test(ua)) os = 'Windows';
  else if (/iPhone OS (\d+[._]\d+)/i.test(ua)) os = 'iOS ' + (ua.match(/iPhone OS (\d+[._]\d+)/i)?.[1] || '').replace('_', '.');
  else if (/iPad.*OS (\d+[._]\d+)/i.test(ua)) os = 'iPadOS ' + (ua.match(/OS (\d+[._]\d+)/i)?.[1] || '').replace('_', '.');
  else if (/Mac OS X/i.test(ua)) os = 'macOS';
  else if (/Android (\d+(\.\d+)?)/i.test(ua)) os = 'Android ' + (ua.match(/Android (\d+(\.\d+)?)/i)?.[1] || '');
  else if (/Linux/i.test(ua)) os = 'Linux';
  else if (/CrOS/i.test(ua)) os = 'ChromeOS';

  // Screen resolution
  const screen_resolution = `${window.screen.width}x${window.screen.height}`;

  // Language
  const language = navigator.language || 'unknown';

  return { device_type, browser, os, screen_resolution, language };
}

export function getTrafficSource(): TrafficSource {
  // Check sessionStorage first (persists UTMs across in-site navigation)
  let utm_source = sessionStorage.getItem('ppv_utm_source') || '';
  let utm_medium = sessionStorage.getItem('ppv_utm_medium') || '';
  let utm_campaign = sessionStorage.getItem('ppv_utm_campaign') || '';

  // Extract from URL if this is the landing page
  const params = new URLSearchParams(window.location.search);
  if (params.get('utm_source')) {
    utm_source = params.get('utm_source') || '';
    utm_medium = params.get('utm_medium') || '';
    utm_campaign = params.get('utm_campaign') || '';
    // Persist for the session
    sessionStorage.setItem('ppv_utm_source', utm_source);
    sessionStorage.setItem('ppv_utm_medium', utm_medium);
    sessionStorage.setItem('ppv_utm_campaign', utm_campaign);
  }

  // Get referrer — classify common sources
  let referrer = document.referrer || '';
  if (referrer && referrer.includes(window.location.hostname)) {
    referrer = ''; // Internal navigation — not a real referrer
  }

  return { referrer, utm_source, utm_medium, utm_campaign };
}
