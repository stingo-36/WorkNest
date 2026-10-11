"use client";

import { format } from "date-fns";
import {
  Activity,
  Award,
  BarChart3,
  Database,
  FileText,
  KeyRound,
  ListChecks,
  NotebookPen,
  ShieldCheck,
  Ticket,
  Trash2,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";

import { adminDeleteAccount, adminDeleteRecords, adminResetPassword } from "@/actions/admin";
import { PasswordMatch, PasswordStrength } from "@/components/auth/password-strength";
import { cn } from "@/components/cn";
import { PageHead, SearchPill } from "@/components/shell/page-head";
import { Button } from "@/components/ui/button";
import { Field, FormError } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { PasswordField } from "@/components/ui/password-field";
import { toast } from "@/components/ui/toast";
import type { AdminDashboardData, AdminUserStats } from "@/lib/admin";
import type { ActionError } from "@/lib/result";

const USER_STATS: Array<{
  key: keyof Pick<AdminUserStats, "workLogs" | "tickets" | "trackerEntries" | "openTracker" | "notes" | "resources" | "achievements" | "reports">;
  label: string;
  icon: LucideIcon;
}> = [
  { key: "workLogs", label: "Work logs", icon: NotebookPen },
  { key: "tickets", label: "Tickets", icon: Ticket },
  { key: "trackerEntries", label: "Tracker", icon: ListChecks },
  { key: "openTracker", label: "Open tracker", icon: Activity },
  { key: "notes", label: "Notebooks", icon: FileText },
  { key: "resources", label: "Resources", icon: Database },
  { key: "achievements", label: "Achievements", icon: Award },
  { key: "reports", label: "Reports", icon: BarChart3 },
];

export function AdminDashboard({ data }: { data: AdminDashboardData }) {
  const router = useRouter();
  const firstManaged = data.users.find((user) => user.id !== data.viewerId) ?? data.users[0];
  const [selectedId, setSelectedId] = useState(firstManaged?.id ?? "");
  const [query, setQuery] = useState("");
  const [passwordTarget, setPasswordTarget] = useState<AdminUserStats | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ user: AdminUserStats; kind: "records" | "account" } | null>(null);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return data.users;
    return data.users.filter((user) => `${user.name ?? ""} ${user.email} ${user.role}`.toLowerCase().includes(needle));
  }, [data.users, query]);
  const selected = data.users.find((user) => user.id === selectedId) ?? firstManaged;
  const storedRecords = data.totals.workLogs + data.totals.tickets + data.totals.trackerEntries + data.totals.notes + data.totals.resources + data.totals.achievements + data.totals.reports;

  return (
    <div className="tk-focus flex min-w-0 flex-col gap-7 md:gap-9">
      <PageHead
        title="Admin"
        meta="Control centre"
        description="Choose an account to inspect its activity, reset access, or remove its data."
        stats={[
          { value: data.totals.accounts, label: "accounts" },
          { value: data.totals.admins, label: "administrators" },
        ]}
      />

      <section aria-label="System overview" className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border xl:grid-cols-4">
        <OverviewStat icon={Users} label="Accounts" value={data.totals.accounts} detail={`${data.totals.activeAccounts} with content`} />
        <OverviewStat icon={Activity} label="Active accounts" value={data.totals.activeAccounts} detail={`${data.totals.accounts - data.totals.activeAccounts} empty`} />
        <OverviewStat icon={Database} label="Stored records" value={storedRecords} detail="Across live features" />
        <OverviewStat icon={ListChecks} label="Open tracker" value={data.totals.openTracker} detail={`${data.totals.trackerEntries} tracker entries`} />
      </section>

      <section aria-labelledby="account-management" className="grid min-w-0 gap-6 lg:grid-cols-[minmax(18rem,0.8fr)_minmax(0,1.5fr)] lg:items-start">
        <div className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface lg:sticky lg:top-6">
          <div className="border-b border-border p-4 md:p-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <p className="tk-eyebrow text-text-muted">Directory</p>
                <h2 id="account-management" className="tk-card-title mt-1">Accounts</h2>
              </div>
              <span className="rounded-full bg-surface-2 px-3 py-1 text-sm font-semibold text-text-muted tabular-nums">{filtered.length}</span>
            </div>
            <SearchPill id="admin-account-search" label="Search accounts" value={query} onChange={setQuery} placeholder="Name or email" className="w-full" />
          </div>

          <div className="max-h-64 overflow-y-auto p-2 md:max-h-[38rem]" role="listbox" aria-label="Accounts">
            {filtered.length ? filtered.map((user) => {
              const active = selected?.id === user.id;
              return (
                <button
                  key={user.id}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => setSelectedId(user.id)}
                  className={cn("flex min-h-14 w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-colors duration-150 md:min-h-16 md:gap-3 md:py-3", active ? "bg-sidebar text-sidebar-fg" : "text-text hover:bg-surface-2")}
                >
                  <span className={cn("grid size-10 shrink-0 place-items-center rounded-xl text-sm font-bold", active ? "bg-sidebar-3 text-sidebar-fg" : "bg-primary-subtle text-accent-text")}>{initials(user)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold md:text-base">{user.name ?? "Unnamed account"}</span>
                      {user.role === "Admin" ? <ShieldCheck className="size-4 shrink-0" aria-label="Administrator" /> : null}
                    </span>
                    <span className={cn("mt-0.5 block truncate text-xs md:text-sm", active ? "text-sidebar-muted" : "text-text-muted")}>{user.email}</span>
                  </span>
                  <span className={cn("text-sm font-semibold tabular-nums", active ? "text-sidebar-muted" : "text-text-subtle")}>{recordCount(user)}</span>
                </button>
              );
            }) : <p className="px-3 py-8 text-center text-md text-text-muted">No accounts match that search.</p>}
          </div>
        </div>

        {selected ? (
          <article className="min-w-0 overflow-hidden rounded-2xl border border-border bg-surface">
            <header className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 border-b border-border p-4 md:flex md:gap-4 md:p-7">
              <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-sidebar text-base font-bold text-sidebar-fg md:size-14 md:rounded-2xl md:text-lg">{initials(selected)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h2 className="tk-section [overflow-wrap:anywhere]">{selected.name ?? "Unnamed account"}</h2>
                  <span className={cn("inline-flex min-h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold", selected.role === "Admin" ? "bg-primary-subtle text-accent-text" : "bg-surface-2 text-text-muted")}>
                    {selected.role === "Admin" ? <ShieldCheck className="size-3.5" aria-hidden="true" /> : <UserRound className="size-3.5" aria-hidden="true" />}{selected.role}
                  </span>
                </div>
                <p className="mt-1 [overflow-wrap:anywhere] text-sm text-text-muted md:text-md">{selected.email}</p>
                <p className="mt-2 text-xs text-text-subtle md:mt-3 md:text-sm">Joined {format(new Date(selected.createdAt), "d MMM yyyy")}<span aria-hidden="true"> · </span>{selected.lastActivityAt ? `Active ${format(new Date(selected.lastActivityAt), "d MMM yyyy")}` : "No content yet"}</p>
              </div>
              <div className="col-span-2 flex w-full items-center justify-between rounded-xl bg-surface-2 px-3 py-2 text-left md:block md:w-auto md:px-4 md:py-3 md:text-right">
                <p className="tk-label text-text-muted">Records</p>
                <p className="text-2xl font-bold text-text tabular-nums md:mt-0.5 md:text-3xl">{recordCount(selected)}</p>
              </div>
            </header>

            <div className="grid grid-cols-2 gap-px bg-border md:grid-cols-4">
              {USER_STATS.map(({ key, label, icon: Icon }) => (
                <div key={key} className="flex min-w-0 flex-col gap-2 bg-surface p-3 md:gap-3 md:p-5">
                  <div className="flex min-h-8 items-start justify-between gap-2 md:min-h-0 md:items-center"><p className="tk-label [overflow-wrap:anywhere] text-text-muted">{label}</p><Icon className="size-4 shrink-0 text-accent-text" aria-hidden="true" /></div>
                  <p className="text-2xl font-bold text-text tabular-nums md:text-3xl">{selected[key]}</p>
                </div>
              ))}
            </div>

            <div className="border-t border-border p-4 md:p-7">
              <div className="mb-5">
                <p className="tk-eyebrow text-text-muted">Account management</p>
                <h3 className="mt-1 text-lg font-semibold text-text md:text-xl">Access and data</h3>
                <p className="mt-1 max-w-[65ch] text-sm text-text-muted md:text-md">Password resets sign the account out everywhere. Destructive actions require its email address.</p>
              </div>
              {selected.id === data.viewerId ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-surface-2 p-4">
                    <p className="text-sm text-text-muted md:text-md">This is your current account. Change its password from Profile &amp; settings.</p>
                    <Link href="/profile" className="inline-flex min-h-11 w-full items-center justify-center rounded-full border border-border-strong bg-surface px-4 text-sm font-semibold text-text hover:border-primary hover:text-accent-text md:w-auto">Open profile</Link>
                  </div>
                  <div className="mt-3 grid gap-2.5 md:flex md:flex-wrap">
                    <Button size="lg" className="h-11 w-full md:w-auto" variant="secondary" onClick={() => setDeleteTarget({ user: selected, kind: "records" })}><Database aria-hidden="true" /> Delete my records</Button>
                    <Button size="lg" className="h-11 w-full md:w-auto" variant="danger" disabled title="You cannot delete the account you are using"><Trash2 aria-hidden="true" /> Delete current account</Button>
                  </div>
                </>
              ) : (
                <div className="grid gap-2.5 md:flex md:flex-wrap">
                  <Button size="lg" className="h-11 w-full md:w-auto" onClick={() => setPasswordTarget(selected)}><KeyRound aria-hidden="true" /> Reset password</Button>
                  <Button size="lg" className="h-11 w-full md:w-auto" variant="secondary" onClick={() => setDeleteTarget({ user: selected, kind: "records" })}><Database aria-hidden="true" /> Delete all records</Button>
                  <Button size="lg" className="h-11 w-full md:w-auto" variant="danger" onClick={() => setDeleteTarget({ user: selected, kind: "account" })}><Trash2 aria-hidden="true" /> Delete account</Button>
                </div>
              )}
            </div>
          </article>
        ) : null}
      </section>

      <PasswordResetDialog user={passwordTarget} onClose={() => setPasswordTarget(null)} onSaved={() => router.refresh()} />
      <DeleteDialog target={deleteTarget} onClose={() => setDeleteTarget(null)} onDeleted={(kind) => { if (kind === "account") setSelectedId(data.viewerId); router.refresh(); }} />
    </div>
  );
}

function OverviewStat({ icon: Icon, label, value, detail }: { icon: LucideIcon; label: string; value: number; detail: string }) {
  return <div className="flex min-w-0 flex-col items-start gap-2 bg-surface p-3 md:flex-row md:items-center md:gap-4 md:p-6"><span className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-subtle text-accent-text md:size-11 md:rounded-xl"><Icon className="size-4 md:size-5" aria-hidden="true" /></span><div className="min-w-0"><p className="tk-label [overflow-wrap:anywhere] text-text-muted">{label}</p><p className="mt-1 text-2xl font-bold text-text tabular-nums md:text-3xl">{value}</p><p className="mt-0.5 text-xs text-text-subtle md:text-sm">{detail}</p></div></div>;
}

function PasswordResetDialog({ user, onClose, onSaved }: { user: AdminUserStats | null; onClose: () => void; onSaved: () => void }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmTouched, setConfirmTouched] = useState(false);
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const fields = error?.fields ?? {};
  function close() { if (pending) return; setNewPassword(""); setConfirmPassword(""); setConfirmTouched(false); setError(null); onClose(); }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!user) return;
    setError(null);
    startTransition(async () => {
      const result = await adminResetPassword({ userId: user.id, newPassword, confirmPassword });
      if (!result.ok) { setError(result.error); return; }
      toast.success(`Password reset for ${user.email}`);
      onSaved(); close();
    });
  }
  return (
    <Modal open={Boolean(user)} onClose={close} title="Reset password" eyebrow={user?.email} footer={<><Button variant="secondary" onClick={close} disabled={pending}>Cancel</Button><Button type="submit" form="admin-password-reset" loading={pending}>Reset password</Button></>}>
      <form id="admin-password-reset" onSubmit={submit} noValidate className="flex flex-col gap-5">
        <p className="text-md text-text-muted">Set a new password for this account. Every existing session for it will be signed out.</p>
        <FormError>{error && !error.fields ? error.message : undefined}</FormError>
        <Field label="New password" htmlFor="admin-new-password" error={fields.newPassword} hint="At least 8 characters." required>
          <PasswordField id="admin-new-password" fieldLabel="new password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} aria-invalid={Boolean(fields.newPassword) || undefined} required />
          <PasswordStrength value={newPassword} />
        </Field>
        <Field label="Confirm new password" htmlFor="admin-confirm-password" error={fields.confirmPassword} required>
          <PasswordField id="admin-confirm-password" fieldLabel="new password confirmation" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} onBlur={() => setConfirmTouched(true)} aria-invalid={Boolean(fields.confirmPassword) || undefined} required />
          <PasswordMatch password={newPassword} confirmation={confirmPassword} touched={confirmTouched} />
        </Field>
      </form>
    </Modal>
  );
}

function DeleteDialog({ target, onClose, onDeleted }: { target: { user: AdminUserStats; kind: "records" | "account" } | null; onClose: () => void; onDeleted: (kind: "records" | "account") => void }) {
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [error, setError] = useState<ActionError | null>(null);
  const [pending, startTransition] = useTransition();
  const user = target?.user;
  const deletingAccount = target?.kind === "account";
  const matches = Boolean(user && confirmationEmail.trim().toLowerCase() === user.email.toLowerCase());
  function close() { if (pending) return; setConfirmationEmail(""); setError(null); onClose(); }
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!target || !matches) return;
    setError(null);
    startTransition(async () => {
      const action = deletingAccount ? adminDeleteAccount : adminDeleteRecords;
      const result = await action({ userId: target.user.id, confirmationEmail });
      if (!result.ok) { setError(result.error); return; }
      toast.success(deletingAccount ? `Deleted ${target.user.email}` : `Deleted all records for ${target.user.email}`);
      onDeleted(target.kind); close();
    });
  }
  return (
    <Modal open={Boolean(target)} onClose={close} title={deletingAccount ? "Delete account" : "Delete all records"} eyebrow={user?.email} footer={<><Button variant="secondary" onClick={close} disabled={pending}>Cancel</Button><Button type="submit" form="admin-delete-confirmation" variant="danger" loading={pending} disabled={!matches}>{deletingAccount ? "Delete account" : "Delete records"}</Button></>}>
      <form id="admin-delete-confirmation" onSubmit={submit} noValidate className="flex flex-col gap-5">
        <div className="rounded-xl border border-danger bg-danger-subtle p-4 text-md text-danger">{deletingAccount ? "This permanently removes the login and every record, attachment, and saved setting owned by this account." : "This permanently removes every work log, ticket, tracker item, notebook, resource, achievement, report, and uploaded file. The login and settings remain."}</div>
        <FormError>{error && !error.fields ? error.message : undefined}</FormError>
        <Field label={`Type ${user?.email ?? "the account email"} to confirm`} htmlFor="confirmation-email" error={error?.fields?.confirmationEmail} required>
          <Input id="confirmation-email" type="email" autoComplete="off" value={confirmationEmail} onChange={(event) => setConfirmationEmail(event.target.value)} aria-invalid={Boolean(error?.fields?.confirmationEmail) || undefined} required />
        </Field>
      </form>
    </Modal>
  );
}

function recordCount(user: AdminUserStats) {
  return user.workLogs + user.tickets + user.trackerEntries + user.notes + user.resources + user.achievements + user.reports;
}

function initials(user: Pick<AdminUserStats, "name" | "email">) {
  const source = (user.name || user.email).trim();
  return source.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "?";
}
