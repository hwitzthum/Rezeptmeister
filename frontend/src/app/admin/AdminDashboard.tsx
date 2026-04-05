"use client";

import { useState, useCallback, useEffect } from "react";

type UserStatus = "pending" | "approved" | "rejected";
type UserRole = "admin" | "user";

interface UserRow {
  id: string;
  email: string;
  name: string | null;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
}

interface UsersResponse {
  users: UserRow[];
  total: number;
  page: number;
  pages: number;
}

const STATUS_LABELS: Record<UserStatus, string> = {
  pending: "Ausstehend",
  approved: "Freigegeben",
  rejected: "Abgelehnt",
};

const STATUS_STYLES: Record<UserStatus, string> = {
  pending: "bg-gold-500/10 text-gold-700 border border-gold-500/20",
  approved: "bg-green-50 text-green-700 border border-green-200",
  rejected: "bg-red-50 text-red-700 border border-red-200",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("de-CH", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 backdrop-blur-sm"
        onClick={onCancel}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        className="relative z-10 w-full max-w-sm rounded-2xl bg-[var(--bg-surface)] p-6 shadow-warm-xl border border-[var(--border-subtle)]"
      >
        <h2
          id="confirm-title"
          className="text-lg font-semibold text-[var(--text-primary)] mb-2"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {title}
        </h2>
        <p className="text-sm text-[var(--text-secondary)] mb-6">{message}</p>
        <div className="flex gap-3 justify-end">
          <button
            onClick={onCancel}
            className="rounded-lg border border-[var(--border-base)] px-4 py-2 text-sm font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] transition-colors"
          >
            Abbrechen
          </button>
          <button
            onClick={onConfirm}
            className={`rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-warm-sm transition-all ${
              danger
                ? "bg-red-600 hover:bg-red-700"
                : "bg-terra-500 hover:bg-terra-600"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function AdminDashboard({
  currentUserId,
}: {
  currentUserId: string;
}) {
  const [data, setData] = useState<UsersResponse | null>(null);
  const [statusFilter, setStatusFilter] = useState<UserStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" } | null>(null);

  // Confirm dialog state
  const [confirm, setConfirm] = useState<{
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    danger: boolean;
    onConfirm: () => void;
  } | null>(null);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 350);
    return () => clearTimeout(t);
  }, [search]);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        status: statusFilter,
        page: String(page),
        limit: "20",
        sort: "created_desc",
      });
      if (debouncedSearch) params.set("q", debouncedSearch);

      const res = await fetch(`/api/admin/users?${params}`);
      if (!res.ok) throw new Error("Fehler beim Laden der Benutzer.");
      setData(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unbekannter Fehler.");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, page, debouncedSearch]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // Reset to page 1 on filter/search change
  useEffect(() => {
    setPage(1);
  }, [statusFilter, debouncedSearch]);

  function showToast(message: string, type: "success" | "error") {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3_500);
  }

  async function updateUser(
    id: string,
    payload: { status?: UserStatus; role?: UserRole },
  ) {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error ?? "Fehler.", "error");
        return;
      }
      showToast(json.message, "success");
      await fetchUsers();
    } catch {
      showToast("Netzwerkfehler.", "error");
    } finally {
      setActionLoading(null);
    }
  }

  async function deleteUser(id: string) {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/admin/users/${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) {
        showToast(json.error ?? "Fehler.", "error");
        return;
      }
      showToast(json.message, "success");
      await fetchUsers();
    } catch {
      showToast("Netzwerkfehler.", "error");
    } finally {
      setActionLoading(null);
      setConfirm(null);
    }
  }

  function askDelete(user: UserRow) {
    setConfirm({
      open: true,
      title: "Benutzer löschen",
      message: `Möchten Sie «${user.name ?? user.email}» wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`,
      confirmLabel: "Löschen",
      danger: true,
      onConfirm: () => deleteUser(user.id),
    });
  }

  function askRoleChange(user: UserRow) {
    const newRole: UserRole = user.role === "admin" ? "user" : "admin";
    setConfirm({
      open: true,
      title: "Rolle ändern",
      message: `Möchten Sie die Rolle von «${user.name ?? user.email}» auf «${newRole === "admin" ? "Administrator" : "Benutzer"}» ändern?`,
      confirmLabel: "Ja, ändern",
      danger: false,
      onConfirm: () => { updateUser(user.id, { role: newRole }); setConfirm(null); },
    });
  }

  const pendingCount = data?.users?.filter((u) => u.status === "pending").length ?? 0;

  return (
    <div className="max-w-5xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="text-3xl font-bold text-[var(--text-primary)]"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Benutzerverwaltung
          </h1>
          <p className="mt-1 text-warm-500 text-sm">
            {data ? `${data.total} Benutzer insgesamt` : "Wird geladen…"}
          </p>
        </div>
        {pendingCount > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-500/10 border border-gold-500/30 px-3 py-1 text-sm font-medium text-gold-700">
            <svg className="h-3.5 w-3.5" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
            </svg>
            {pendingCount} ausstehend
          </span>
        )}
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap gap-3">
        {/* Search */}
        <div className="relative flex-1 min-w-[200px]">
          <svg
            className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-warm-400 pointer-events-none"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="search"
            placeholder="Name oder E-Mail suchen…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-[var(--border-base)] bg-[var(--bg-surface)] pl-10 pr-4 py-2 text-sm text-[var(--text-primary)] focus:border-terra-500 focus:outline-none focus:ring-2 focus:ring-terra-500"
          />
        </div>

        {/* Status tabs */}
        <div className="flex rounded-lg border border-[var(--border-base)] overflow-hidden bg-[var(--bg-surface)]">
          {(["all", "pending", "approved", "rejected"] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-2 text-xs font-medium transition-colors ${
                statusFilter === s
                  ? "bg-terra-500 text-white"
                  : "text-warm-600 hover:bg-[var(--bg-subtle)]"
              }`}
            >
              {s === "all" ? "Alle" : STATUS_LABELS[s]}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-surface)] shadow-warm overflow-hidden">
        {error ? (
          <div className="p-8 text-center text-red-500 text-sm">{error}</div>
        ) : loading && !data ? (
          <div className="p-8 text-center text-warm-400 text-sm">Wird geladen…</div>
        ) : data?.users.length === 0 ? (
          <div className="p-8 text-center text-warm-400 text-sm">Keine Benutzer gefunden.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--bg-subtle)]">
                  <th className="px-4 py-3 text-left text-xs font-semibold text-warm-500 uppercase tracking-wider">Benutzer</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-warm-500 uppercase tracking-wider">Rolle</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-warm-500 uppercase tracking-wider">Status</th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-warm-500 uppercase tracking-wider">Registriert</th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-warm-500 uppercase tracking-wider">Aktionen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {data?.users.map((user) => (
                  <tr
                    key={user.id}
                    className={`hover:bg-[var(--bg-subtle)] transition-colors ${
                      actionLoading === user.id ? "opacity-50 pointer-events-none" : ""
                    }`}
                  >
                    <td className="px-4 py-3">
                      <div className="font-medium text-[var(--text-primary)]">
                        {user.name ?? <span className="italic text-warm-400">Kein Name</span>}
                      </div>
                      <div className="text-warm-500 text-xs mt-0.5">{user.email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-warm-600">
                        {user.role === "admin" ? "Administrator" : "Benutzer"}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[user.status]}`}
                      >
                        {STATUS_LABELS[user.status]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-warm-500 text-xs">
                      {formatDate(user.createdAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-1.5">
                        {/* Approve */}
                        {user.status !== "approved" && (
                          <button
                            onClick={() => updateUser(user.id, { status: "approved" })}
                            title="Freigeben"
                            className="rounded-md p-1.5 text-green-600 hover:bg-green-50 transition-colors"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                          </button>
                        )}
                        {/* Reject */}
                        {user.status !== "rejected" && (
                          <button
                            onClick={() => updateUser(user.id, { status: "rejected" })}
                            title="Ablehnen"
                            className="rounded-md p-1.5 text-warm-500 hover:bg-warm-100 transition-colors"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                        {/* Toggle role (not self) */}
                        {user.id !== currentUserId && (
                          <button
                            onClick={() => askRoleChange(user)}
                            title={user.role === "admin" ? "Zum Benutzer degradieren" : "Zum Admin befördern"}
                            className="rounded-md p-1.5 text-warm-500 hover:bg-warm-100 transition-colors"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                            </svg>
                          </button>
                        )}
                        {/* Delete (not self) */}
                        {user.id !== currentUserId && (
                          <button
                            onClick={() => askDelete(user)}
                            title="Löschen"
                            className="rounded-md p-1.5 text-red-500 hover:bg-red-50 transition-colors"
                          >
                            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {data && data.pages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t border-[var(--border-subtle)] text-sm text-warm-500">
            <span>
              Seite {data.page} von {data.pages}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded-md border border-[var(--border-base)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--bg-subtle)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Zurück
              </button>
              <button
                onClick={() => setPage((p) => Math.min(data.pages, p + 1))}
                disabled={page >= data.pages}
                className="rounded-md border border-[var(--border-base)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--bg-subtle)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Weiter
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div
          role="status"
          aria-live="polite"
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-xl px-4 py-3 shadow-warm-lg text-sm font-medium text-white transition-all ${
            toast.type === "success" ? "bg-green-600" : "bg-red-600"
          }`}
        >
          {toast.type === "success" ? (
            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          ) : (
            <svg className="h-4 w-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
          {toast.message}
        </div>
      )}

      {/* Confirm Dialog */}
      {confirm && (
        <ConfirmDialog
          open={confirm.open}
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          danger={confirm.danger}
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}
    </div>
  );
}
