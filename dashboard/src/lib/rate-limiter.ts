import { NextRequest, NextResponse } from 'next/server';

export type RateLimitMode = 'testing' | 'production';
export type RouteType = 'read' | 'write' | 'auth';

export interface RateLimitConfig {
  type?: RouteType;
  // Overrides for testing mode
  testingMaxRequests?: number;
  testingWindowMs?: number;
  // Overrides for production mode
  productionMaxRequests?: number;
  productionWindowMs?: number;
}

// In-memory store for rate limiting
// Key: identifier (IP), Value: array of timestamps
const rateLimitStore = new Map<string, number[]>();

// Cleanup stale entries every 60 seconds to prevent huge memory leaks
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    // Use the max possible window (60s) for cleanup
    const maxWindowMs = 60000;

    for (const [key, timestamps] of rateLimitStore.entries()) {
      const validTimestamps = timestamps.filter(t => now - t < maxWindowMs);
      if (validTimestamps.length === 0) {
        rateLimitStore.delete(key);
      } else {
        rateLimitStore.set(key, validTimestamps);
      }
    }
  }, 60000); // 1 minute
}

/**
 * Programmatically clears all rate limit tracking data.
 * Useful for resetting during testing or development server restarts.
 */
export function clearRateLimits() {
  rateLimitStore.clear();
}

export async function applyRateLimit(
  request: NextRequest,
  handler: (request: NextRequest) => Promise<NextResponse>,
  config?: RateLimitConfig
): Promise<NextResponse> {
  const requestPath = request.nextUrl.pathname;

  // Determine mode
  // 1. Determine mode based on environment or explicit header override
  let mode: RateLimitMode = 'production';
  if (process.env.NODE_ENV === 'development' || request.headers.get('x-rate-limit-mode') === 'testing') {
    mode = 'testing';
  }

  // Determine limits based on mode and route type
  const routeType = config?.type || 'read'; // Default to read

  let maxRequests = 60;
  let windowMs = 60000; // 60 seconds

  if (mode === 'testing') {
    // Testing mode: allow bursts, short cooldown
    if (routeType === 'auth') {
      maxRequests = config?.testingMaxRequests || 50;
      windowMs = config?.testingWindowMs || 5000;     // 50 per 5 seconds
    } else {
      maxRequests = config?.testingMaxRequests || 200;
      windowMs = config?.testingWindowMs || 5000;     // 200 per 5 seconds
    }
  } else {
    // Production mode
    if (routeType === 'auth') {
      // Strict limits for authentication endpoints (A-02 remediation)
      maxRequests = config?.productionMaxRequests || 5;
      windowMs = config?.productionWindowMs || 60000; // 5 per minute
    } else if (routeType === 'write') {
      // Stricter limits for mutating data
      maxRequests = config?.productionMaxRequests || 20;
      windowMs = config?.productionWindowMs || 60000; // 20 per minute
    } else {
      // Standard limits for reads
      maxRequests = config?.productionMaxRequests || 60;
      windowMs = config?.productionWindowMs || 60000; // 60 per minute
    }
  }

  const ipHeader = request.headers.get('x-forwarded-for');
  const identifier = ipHeader ? ipHeader.split(',')[0].trim() : "127.0.0.1";

  if (!identifier) {
    return handler(request);
  }

  const now = Date.now();
  // Use composite key config.type + IP
  const routeTypeKey = config?.type || 'read';
  const storeKey = `${identifier}:${routeTypeKey}`;
  const timestamps = rateLimitStore.get(storeKey) || [];

  // Prune old requests outside the current window
  const validTimestamps = timestamps.filter(t => now - t < windowMs);

  // Calculate specific rate limit headers
  const remaining = Math.max(0, maxRequests - validTimestamps.length);
  const oldestTimestamp = validTimestamps.length > 0 ? validTimestamps[0] : now;
  const resetTime = oldestTimestamp + windowMs;

  if (validTimestamps.length >= maxRequests) {
    console.warn(`[RATE LIMITER] Blocked ${storeKey} on ${requestPath}. Mode: ${mode}`);
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      {
        status: 429,
        headers: {
          'X-RateLimit-Limit': maxRequests.toString(),
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': resetTime.toString(),
          'Retry-After': Math.ceil((resetTime - now) / 1000).toString()
        },
      }
    );
  }

  // Record this request
  validTimestamps.push(now);
  rateLimitStore.set(storeKey, validTimestamps);

  // Add rate limit headers to the successful response
  const response = await handler(request);
  response.headers.set('X-RateLimit-Limit', maxRequests.toString());
  response.headers.set('X-RateLimit-Remaining', (remaining - 1).toString());
  response.headers.set('X-RateLimit-Reset', resetTime.toString());

  return response;
}
