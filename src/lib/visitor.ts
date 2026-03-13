const VISITOR_KEY = 'ppv_visitor_id';

export function getVisitorId(): string {
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id = crypto.randomUUID();
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
