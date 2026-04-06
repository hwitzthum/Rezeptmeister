import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AdminDashboard from "./AdminDashboard";
import Link from "next/link";

export const metadata = {
  title: "Admin – Benutzerverwaltung",
};

export default async function AdminPage() {
  const session = await auth();

  if (!session?.user) {
    redirect("/auth/anmelden?callbackUrl=/admin");
  }

  if (session.user.role !== "admin") {
    redirect("/");
  }

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      {/* Simple top nav for admin */}
      <header className="sticky top-0 z-30 border-b border-[var(--border-subtle)] bg-[var(--bg-surface)]/90 backdrop-blur-sm">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2 font-display text-xl font-bold text-terra-500"
          >
            <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
            </svg>
            Admin
          </Link>
          <div className="flex items-center gap-3 text-sm">
            <span className="text-warm-500 dark:text-warm-400 hidden sm:block">
              {session.user.email}
            </span>
            <Link
              href="/"
              className="rounded-lg px-3 py-1.5 text-sm font-medium text-warm-600 dark:text-warm-400 hover:bg-[var(--bg-subtle)] transition-colors"
            >
              Zurück zur App
            </Link>
          </div>
        </div>
      </header>

      <AdminDashboard currentUserId={session.user.id} />
    </div>
  );
}
