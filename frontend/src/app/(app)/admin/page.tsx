import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AdminDashboard from "./AdminDashboard";

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
      {/* Die eigene Kopfleiste mit „Zurueck zur App" entfiel beim Umzug in die
          App-Gruppe: die Navigation kommt jetzt vom gemeinsamen Layout, und
          `AdminDashboard` bringt seine Ueberschrift selbst mit. */}
      <AdminDashboard currentUserId={session.user.id} />
    </div>
  );
}
