import { NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { checkRateLimit, getClientIp, AUTH_LIMIT } from "@/lib/rate-limit";

const registerSchema = z.object({
  name: z.string().min(2, "Name muss mindestens 2 Zeichen haben.").max(100),
  email: z
    .string()
    .email("Ungültige E-Mail-Adresse.")
    .max(255)
    .transform((e) => e.toLowerCase().trim()),
  password: z
    .string()
    .min(8, "Passwort muss mindestens 8 Zeichen haben.")
    .max(128),
});

export async function POST(request: Request) {
  // Rate limit: 10 registration attempts per IP per 15 min
  const ip = getClientIp(request);
  const rl = checkRateLimit(`register:${ip}`, AUTH_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Zu viele Anfragen. Bitte versuchen Sie es später erneut." },
      {
        status: 429,
        headers: {
          "Retry-After": String(Math.ceil((rl.retryAfterMs ?? 0) / 1_000)),
        },
      },
    );
  }

  // Parse & validate input
  let data: z.infer<typeof registerSchema>;
  try {
    const body = await request.json();
    data = registerSchema.parse(body);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Ungültige Eingaben.", details: err.issues },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: "Ungültige Anfrage." }, { status: 400 });
  }

  // Check for existing account
  const existing = await db.query.users.findFirst({
    where: eq(users.email, data.email),
    columns: { id: true },
  });
  if (existing) {
    return NextResponse.json(
      { error: "Diese E-Mail-Adresse ist bereits registriert." },
      { status: 409 },
    );
  }

  const passwordHash = await bcrypt.hash(data.password, 12);

  await db.insert(users).values({
    name: data.name,
    email: data.email,
    passwordHash,
    role: "user",
    status: "pending",
  });

  return NextResponse.json(
    {
      message:
        "Registrierung erfolgreich. Bitte warten Sie auf die Freigabe durch den Administrator.",
    },
    { status: 201 },
  );
}
