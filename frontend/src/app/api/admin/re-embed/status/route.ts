import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { buildBackendHeaders } from "@/lib/backend";
import { checkRateLimit, getClientIp, DEFAULT_LIMIT } from "@/lib/rate-limit";
import { USER_ROLE } from "@/lib/auth";

interface JobStatus {
  job_id: string;
  status: string;
  total: number;
  completed: number;
  errors: number;
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = checkRateLimit(`admin-re-embed-status:${ip}`, DEFAULT_LIMIT);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Zu viele Anfragen." },
      { status: 429 },
    );
  }

  const session = await auth();
  if (!session?.user || session.user.role !== USER_ROLE.admin) {
    return NextResponse.json({ error: "Nicht autorisiert." }, { status: 403 });
  }

  const backendUrl = process.env.BACKEND_URL;
  if (!backendUrl) {
    return NextResponse.json(
      { error: "Backend nicht erreichbar." },
      { status: 503 },
    );
  }

  const jobIds = request.nextUrl.searchParams.get("jobIds");
  if (!jobIds) {
    return NextResponse.json(
      { error: "jobIds Parameter fehlt." },
      { status: 400 },
    );
  }

  const ids = jobIds.split(",").filter(Boolean);
  const statuses: JobStatus[] = [];
  let notFound = 0;

  for (const id of ids) {
    try {
      const res = await fetch(
        `${backendUrl}/admin/re-embed-status/${encodeURIComponent(id)}`,
        { headers: buildBackendHeaders() },
      );
      if (res.ok) {
        statuses.push((await res.json()) as JobStatus);
      } else {
        notFound++;
      }
    } catch {
      notFound++;
    }
  }

  // Aggregierte Werte berechnen
  const totalRecipes = statuses.reduce((s, j) => s + j.total, 0);
  const completedRecipes = statuses.reduce((s, j) => s + j.completed, 0);
  const totalErrors = statuses.reduce((s, j) => s + j.errors, 0);
  const completedJobs = statuses.filter((j) => j.status === "done").length;
  const errorJobs = statuses.filter((j) => j.status === "error").length;
  const allDone = statuses.length > 0 &&
    statuses.every((j) => j.status === "done" || j.status === "error");

  return NextResponse.json({
    jobs: statuses,
    notFound,
    totalRecipes,
    completedRecipes,
    totalErrors,
    completedJobs,
    errorJobs,
    totalJobs: ids.length,
    allDone,
  });
}
