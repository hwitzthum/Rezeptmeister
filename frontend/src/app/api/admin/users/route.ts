import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";
import { checkRateLimit, getClientIp } from "@/lib/rate-limit";
import { USER_ROLE } from "@/lib/auth";

const querySchema = z.object({
  status: z
    .enum(["pending", "approved", "rejected", "all"])
    .optional()
    .default("all"),
  q: z.string().max(100).optional(),
  page: z.coerce.number().min(1).optional().default(1),
  limit: z.coerce.number().min(1).max(100).optional().default(20),
  sort: z
    .enum(["created_asc", "created_desc", "name_asc"])
    .optional()
    .default("created_desc"),
});

export async function GET(request: Request) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`admin-users:${ip}`);
  if (!rl.allowed) {
    return NextResponse.json({ error: "Zu viele Anfragen." }, { status: 429 });
  }

  const session = await auth();
  if (!session?.user || session.user.role !== USER_ROLE.admin) {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 403 });
  }

  const url = new URL(request.url);
  const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Ungültige Parameter." }, { status: 400 });
  }

  const { status, q, page, limit: pageSize, sort } = parsed.data;

  const conditions = [];
  if (status !== "all") {
    conditions.push(
      eq(users.status, status as "pending" | "approved" | "rejected"),
    );
  }
  if (q) {
    conditions.push(or(ilike(users.name, `%${q}%`), ilike(users.email, `%${q}%`)));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const [{ total }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(users)
    .where(where);

  const orderBy =
    sort === "created_asc"
      ? asc(users.createdAt)
      : sort === "name_asc"
        ? asc(users.name)
        : desc(users.createdAt);

  const rows = await db
    .select({
      id: users.id,
      email: users.email,
      name: users.name,
      role: users.role,
      status: users.status,
      createdAt: users.createdAt,
    })
    .from(users)
    .where(where)
    .orderBy(orderBy)
    .limit(pageSize)
    .offset((page - 1) * pageSize);

  return NextResponse.json({
    users: rows,
    total,
    page,
    pages: Math.ceil(total / pageSize),
  });
}
