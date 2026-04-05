import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { encrypt, decrypt, maskApiKey } from "@/lib/crypto";
import { checkRateLimit, getClientIp, AUTH_LIMIT } from "@/lib/rate-limit";

const apiKeySchema = z.object({
  apiKey: z
    .string()
    .min(10, "API-Schlüssel zu kurz.")
    .max(500, "API-Schlüssel zu lang."),
  provider: z.enum(["gemini", "openai", "claude"]).default("gemini"),
});

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  const user = await db.query.users.findFirst({
    where: eq(users.id, session.user.id),
    columns: { apiKeyEncrypted: true, apiProvider: true },
  });

  if (!user?.apiKeyEncrypted) {
    return NextResponse.json({ hasKey: false, masked: null, provider: null });
  }

  let masked: string;
  try {
    const plaintext = decrypt(user.apiKeyEncrypted);
    masked = maskApiKey(plaintext);
  } catch {
    // Key is corrupted — treat as missing
    return NextResponse.json({ hasKey: false, masked: null, provider: null });
  }

  return NextResponse.json({
    hasKey: true,
    masked,
    provider: user.apiProvider,
  });
}

export async function PUT(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`api-key:${ip}`, AUTH_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Zu viele Anfragen." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 0) / 1_000)),
        },
      },
    );
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  let data: z.infer<typeof apiKeySchema>;
  try {
    const body = await request.json();
    data = apiKeySchema.parse(body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Ungültige Eingaben.", details: err.issues },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  const encrypted = encrypt(data.apiKey);

  await db
    .update(users)
    .set({ apiKeyEncrypted: encrypted, apiProvider: data.provider })
    .where(eq(users.id, session.user.id));

  return NextResponse.json({
    message: "API-Schlüssel gespeichert.",
    masked: maskApiKey(data.apiKey),
    provider: data.provider,
  });
}

export async function DELETE(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`api-key-delete:${ip}`, AUTH_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Nicht angemeldet." }, { status: 401 });
  }

  await db
    .update(users)
    .set({ apiKeyEncrypted: null, apiProvider: null })
    .where(eq(users.id, session.user.id));

  return NextResponse.json({ message: "API-Schlüssel entfernt." });
}
