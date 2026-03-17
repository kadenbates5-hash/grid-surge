// Auth helpers — no localStorage, use React context + in-memory
let _token: string | null = null;
let _rememberToken: string | null = null;

export function setToken(t: string) { _token = t; }
export function getToken() { return _token; }
export function clearToken() { _token = null; }

// Remember token stored as a simple module-level var (persists for session)
// In real deployment would use httpOnly cookie via backend
export function setRememberToken(t: string) { _rememberToken = t; }
export function getRememberToken() { return _rememberToken; }
export function clearRememberToken() { _rememberToken = null; }
