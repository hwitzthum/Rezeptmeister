import { handlers } from "@/auth";
import { NextResponse } from "next/server";
import { checkRateLimit, getClientIp, AUTH_LIMIT } from "@/lib/rate-limit";

// Rate-limit POST requests (login attempts) to prevent brute force attacks.
// GET requests (session checks, CSRF token) are not rate-limited.
const originalPOST = handlers.POST;

async function POST(request: Request, context: unknown) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`nextauth-post:${ip}`, AUTH_LIMIT);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return originalPOST(request, context as any);
}

export { POST };
export const GET = handlers.GET;
