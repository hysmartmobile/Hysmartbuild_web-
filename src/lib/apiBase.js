/**
 * Normalize the single backend origin used by the browser. VITE_API_URL must
 * never be a comma-separated list; CORS origins belong in the backend config.
 */
export function resolveApiBase(rawValue, { isDev = false, isProd = false } = {}) {
  let value = String(rawValue ?? '').trim();
  if (!value && isDev) value = 'http://localhost:3001';
  if (!value) {
    return { base: '', error: isProd ? 'VITE_API_URL is missing. Set it to https://hysmart-build.onrender.com in Vercel and redeploy.' : null };
  }
  if (value.includes(',')) {
    return { base: '', error: 'VITE_API_URL must contain exactly one backend URL. Remove comma-separated URLs and keep https://hysmart-build.onrender.com in Vercel.' };
  }
  let url;
  try { url = new URL(value); } catch {
    return { base: '', error: 'VITE_API_URL must be a valid absolute backend URL, such as https://hysmart-build.onrender.com.' };
  }
  if (!['https:', 'http:'].includes(url.protocol)) {
    return { base: '', error: 'VITE_API_URL must use HTTP or HTTPS.' };
  }
  if (isProd && url.protocol !== 'https:') {
    return { base: '', error: 'Production VITE_API_URL must use HTTPS.' };
  }
  if (isProd && ['localhost', '127.0.0.1', '::1'].includes(url.hostname.toLowerCase())) {
    return { base: '', error: 'Production VITE_API_URL must point to the deployed backend, not localhost.' };
  }
  if (url.username || url.password || url.search || url.hash) {
    return { base: '', error: 'VITE_API_URL must be a backend origin only; do not include credentials, query parameters, or a hash.' };
  }
  const pathname = url.pathname.replace(/\/+$/, '');
  if (pathname && pathname.toLowerCase() !== '/api/v1') {
    return { base: '', error: 'VITE_API_URL must be the backend origin (without an API path); the app appends /api/v1 automatically.' };
  }
  return { base: url.origin, error: null };
}
