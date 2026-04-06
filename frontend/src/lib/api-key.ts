import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { decrypt } from "@/lib/crypto";

export type GeminiKeyResult =
  | { ok: true; key: string }
  | { ok: false; response: NextResponse };

/**
 * Laedt den Gemini API-Schluessel des Benutzers aus der DB und entschluesselt ihn.
 * Gibt bei Fehler eine fertige NextResponse zurueck (400 oder 500).
 */
export async function resolveGeminiKey(
  userId: string,
): Promise<GeminiKeyResult> {
  const userRecord = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { apiKeyEncrypted: true, apiProvider: true },
  });

  if (!userRecord?.apiKeyEncrypted || userRecord.apiProvider !== "gemini") {
    return {
      ok: false,
      response: NextResponse.json(
        {
          error:
            "Kein Gemini API-Schlüssel hinterlegt. Bitte in den Einstellungen einen Gemini API-Schlüssel eingeben.",
        },
        { status: 400 },
      ),
    };
  }

  try {
    const key = decrypt(userRecord.apiKeyEncrypted);
    return { ok: true, key };
  } catch {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "API-Schlüssel konnte nicht entschlüsselt werden." },
        { status: 500 },
      ),
    };
  }
}
