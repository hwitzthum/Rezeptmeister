import { handlers } from "@/auth";
import { NextResponse, type NextRequest } from "next/server";
import { checkRateLimit, checkAuthRateLimitRedis, getClientIp, AUTH_LIMIT } from "@/lib/rate-limit";

// Rate-limit POST requests (login attempts) to prevent brute force attacks.
// Redis check runs first (cross-instance on Vercel); in-memory is a fallback.
// GET requests (session checks, CSRF token) are not rate-limited.
const originalPOST = handlers.POST;

async function POST(request: NextRequest) {
  const ip = getClientIp(request);
  const key = `nextauth-post:${ip}`;

  const redis = await checkAuthRateLimitRedis(key);
  if (redis.limited) {
    return NextResponse.json(
      { error: "Zu viele Anmeldeversuche. Bitte warten Sie einen Moment." },
      { status: 429, headers: { "Retry-After": "900" } },
    );
  }

  const rl = checkRateLimit(key, AUTH_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Zu viele Anmeldeversuche. Bitte warten Sie einen Moment." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 0) / 1_000)),
        },
      },
    );
  }
  return originalPOST(request);
}

export { POST };
export const GET = handlers.GET;
