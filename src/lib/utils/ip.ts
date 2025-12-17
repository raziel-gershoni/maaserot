/**
 * Extract client IP address from Next.js request
 * Handles proxies and various deployment environments
 */
export function getClientIp(request: Request): string {
  // Get headers
  const headers = request.headers;

  // Try various headers that might contain the real IP
  const forwardedFor = headers.get('x-forwarded-for');
  if (forwardedFor) {
    // x-forwarded-for can contain multiple IPs, get the first one
    return forwardedFor.split(',')[0].trim();
  }

  const realIp = headers.get('x-real-ip');
  if (realIp) {
    return realIp.trim();
  }

  const cfConnectingIp = headers.get('cf-connecting-ip'); // Cloudflare
  if (cfConnectingIp) {
    return cfConnectingIp.trim();
  }

  const trueClientIp = headers.get('true-client-ip'); // Akamai
  if (trueClientIp) {
    return trueClientIp.trim();
  }

  // Fallback to unknown if no IP found
  return 'unknown';
}
