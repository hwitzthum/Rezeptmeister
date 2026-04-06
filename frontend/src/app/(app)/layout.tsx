import { auth } from "@/auth";
import { USER_ROLE } from "@/lib/auth";
import { Sidebar, BottomNav } from "@/components/layout/sidebar";
import { Toaster } from "react-hot-toast";
import OfflineIndicator from "@/components/layout/OfflineIndicator";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();
  const isAdmin = session?.user?.role === USER_ROLE.admin;
  const userName = session?.user?.name ?? session?.user?.email ?? undefined;

  return (
    <div className="min-h-screen flex bg-[var(--bg-base)]">
      <Sidebar isAdmin={isAdmin} userName={userName} />
      <div className="flex-1 flex flex-col min-w-0 pb-16 lg:pb-0 overflow-x-hidden">
        <OfflineIndicator />
        {children}
      </div>
      <BottomNav />
      <Toaster
        position="bottom-center"
        toastOptions={{
          duration: 3000,
          style: {
            background: "var(--bg-surface)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-base)",
            borderRadius: "12px",
            fontSize: "14px",
          },
        }}
      />
    </div>
  );
}
