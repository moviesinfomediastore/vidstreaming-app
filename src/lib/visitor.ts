const VISITOR_KEY = 'ppv_visitor_id';

export function generateUUID(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
      return crypto.randomUUID();
    } catch (e) {
      // fallback if it fails
    }
  }
  // Fallback for older browsers or non-secure contexts (like Facebook in-app browser)
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

export function getVisitorId(): string {
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id = generateUUID();
    localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

export function getSessionToken(videoId: string): string | null {
  return localStorage.getItem(`ppv_session_${videoId}`);
}

export function setSessionToken(videoId: string, token: string): void {
  localStorage.setItem(`ppv_session_${videoId}`, token);
}
