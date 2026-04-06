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
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-4 focus:left-4 focus:px-4 focus:py-2 focus:bg-terra-500 focus:text-white focus:rounded-lg focus:text-sm focus:font-medium">
        Zum Hauptinhalt springen
      </a>
      <Sidebar isAdmin={isAdmin} userName={userName} />
      <div id="main-content" className="flex-1 flex flex-col min-w-0 pb-16 lg:pb-0 overflow-x-hidden">
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
