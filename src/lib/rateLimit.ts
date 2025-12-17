/**
 * Simple in-memory rate limiting
 * Note: This resets on server restart and doesn't work across multiple servers
 * For production with multiple servers, use Redis-based rate limiting
 */

interface RateLimitEntry {
  count: number;
  resetAt: number; // timestamp
}

// In-memory store
const store = new Map<string, RateLimitEntry>();

// Cleanup old entries every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetAt < now) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

export interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number; // Time window in milliseconds
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

/**
 * Check if request should be rate limited
 * @param identifier - Unique identifier (IP address, user ID, etc.)
 * @param key - Rate limit key (e.g., 'login', 'register')
 * @param config - Rate limit configuration
 */
export function checkRateLimit(
  identifier: string,
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const rateLimitKey = `${key}:${identifier}`;
  const now = Date.now();

  let entry = store.get(rateLimitKey);

  if (!entry || entry.resetAt < now) {
    // Create new entry or reset expired entry
    entry = {
      count: 1,
      resetAt: now + config.windowMs,
    };
    store.set(rateLimitKey, entry);

    return {
      success: true,
      remaining: config.maxAttempts - 1,
      resetAt: entry.resetAt,
    };
  }

  // Entry exists and is still valid
  if (entry.count >= config.maxAttempts) {
    return {
      success: false,
      remaining: 0,
      resetAt: entry.resetAt,
    };
  }

  // Increment count
  entry.count++;
  store.set(rateLimitKey, entry);

  return {
    success: true,
    remaining: config.maxAttempts - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Reset rate limit for a specific identifier and key
 */
export function resetRateLimit(identifier: string, key: string): void {
  const rateLimitKey = `${key}:${identifier}`;
  store.delete(rateLimitKey);
}

/**
 * Get current rate limit status without incrementing
 */
export function getRateLimitStatus(
  identifier: string,
  key: string,
  config: RateLimitConfig
): RateLimitResult {
  const rateLimitKey = `${key}:${identifier}`;
  const now = Date.now();

  const entry = store.get(rateLimitKey);

  if (!entry || entry.resetAt < now) {
    return {
      success: true,
      remaining: config.maxAttempts,
      resetAt: now + config.windowMs,
    };
  }

  return {
    success: entry.count < config.maxAttempts,
    remaining: Math.max(0, config.maxAttempts - entry.count),
    resetAt: entry.resetAt,
  };
}

// Pre-defined rate limit configurations
export const RATE_LIMITS = {
  REGISTER: {
    maxAttempts: 5,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
  LOGIN: {
    maxAttempts: 10,
    windowMs: 15 * 60 * 1000, // 15 minutes
  },
  PASSWORD_CHANGE: {
    maxAttempts: 3,
    windowMs: 60 * 60 * 1000, // 1 hour
  },
  EMAIL_VERIFICATION: {
    maxAttempts: 1,
    windowMs: 5 * 60 * 1000, // 5 minutes
  },
} as const;
