"use client";

import { formatDistanceToNow } from "date-fns";
import { Inbox, RefreshCw } from "lucide-react";
import { useEffect, useState, useTransition } from "react";

import { disconnectGmail, saveGmailRule, syncGmailNow } from "@/actions/gmail";
import { ListCard } from "@/components/profile/list-editors";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { toast } from "@/components/ui/toast";
import { typeMeta } from "@/lib/resource-types";

/** Mirror of lib/gmail.ts GmailStatus (that module is server-only). */
export type GmailStatusView = {
  configured: boolean;
  email: string | null;
  label: string;
  resourceType: string;
  lastSyncAt: string | null;
  lastSyncError: string | null;
};

const RESULT_TOASTS: Record<string, { ok: boolean; text: string }> = {
  connected: { ok: true, text: "Gmail connected" },
  cancelled: { ok: false, text: "Gmail wasn't connected" },
  failed: { ok: false, text: "Couldn't connect Gmail. Try again." },
  "not-configured": { ok: false, text: "Gmail import isn't set up on this server yet" },
};

/**
 * Profile → Gmail import. Connecting goes through Google (read-only access);
 * after that WorkNest checks the label on its own — when Resources is opened and
 * at most every six hours — and each module in a new email becomes a resource.
 */
export function GmailSettingsCard({ initial, resourceTypes }: { initial: GmailStatusView; resourceTypes: string[] }) {
  const [status, setStatus] = useState(initial);
  const [label, setLabel] = useState(initial.label);
  const [resourceType, setResourceType] = useState(initial.resourceType);
  const [ruleError, setRuleError] = useState<string>();
  const [pending, startTransition] = useTransition();

  // The OAuth callback lands on /profile?section=gmail&gmail=<result>: say how it went, once.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = RESULT_TOASTS[params.get("gmail") ?? ""];
    if (!result) return;
    if (result.ok) toast.success(result.text); else toast.error(result.text);
    params.delete("gmail");
    window.history.replaceState(null, "", `/profile?${params}`);
  }, []);

  const connected = Boolean(status.email);
  const types = resourceTypes.includes(resourceType) ? resourceTypes : [...resourceTypes, resourceType];

  function checkNow() {
    startTransition(async () => {
      const result = await syncGmailNow();
      if (!result.ok) { toast.error(result.error.message); return; }
      setStatus(result.data.status);
      toast.success(result.data.added ? `Added ${result.data.added} to ${typeMeta(status.resourceType).plural}` : "Nothing new");
    });
  }

  function saveRule() {
    setRuleError(undefined);
    startTransition(async () => {
      const result = await saveGmailRule({ label, resourceType });
      if (!result.ok) { setRuleError(result.error.fields?.label ?? result.error.message); return; }
      setStatus(result.data);
      toast.success("Import rule saved");
    });
  }

  function disconnect() {
    startTransition(async () => {
      const result = await disconnectGmail();
      if (!result.ok) { toast.error(result.error.message); return; }
      setStatus(result.data);
      toast.success("Gmail disconnected");
    });
  }

  return (
    <ListCard
      title="Gmail import"
      icon={<Inbox className="size-5" />}
      description="Read one Gmail label and turn each module in its emails into a resource. Read-only: WorkNest can't send, change or delete mail."
    >
      {!status.configured ? (
        <p className="rounded-xl border border-border-strong bg-surface-2 p-4 text-sm text-text-muted">
          Not set up on this server: add <code className="font-mono">GOOGLE_CLIENT_ID</code> and <code className="font-mono">GOOGLE_CLIENT_SECRET</code> to the environment (see <code className="font-mono">.env.example</code>).
        </p>
      ) : !connected ? (
        <div className="flex flex-col items-start gap-3">
          <p className="text-md text-text-muted">Connect the Gmail account that receives your Drupal Daily email.</p>
          {/* A plain link: the route redirects to Google, then back here. */}
          <a href="/api/gmail/connect" className="inline-flex h-11 items-center gap-2 rounded-full bg-sidebar px-5 text-base font-semibold text-sidebar-fg transition-colors duration-150 hover:bg-sidebar-3">
            <Inbox className="size-4" aria-hidden="true" />
            Connect Gmail
          </a>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap items-start gap-3 rounded-xl border border-border-strong bg-surface-2 p-4">
            <Inbox className="mt-0.5 size-4 shrink-0 text-accent-text" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-text" role="status">Connected as {status.email}</p>
              <p className="mt-0.5 text-sm text-text-muted">
                {status.lastSyncAt ? `Last checked ${formatDistanceToNow(new Date(status.lastSyncAt), { addSuffix: true })}.` : "Not checked yet."} Checks again when you open Resources, at most every six hours.
              </p>
              {status.lastSyncError ? <p className="mt-1 text-sm text-danger">Last check failed: {status.lastSyncError}</p> : null}
            </div>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" loading={pending} onClick={checkNow}><RefreshCw aria-hidden="true" />Check now</Button>
              <Button variant="secondary" size="sm" disabled={pending} onClick={disconnect}>Disconnect</Button>
            </div>
          </div>

          <form className="grid min-w-0 gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] md:items-end" onSubmit={(event) => { event.preventDefault(); saveRule(); }}>
            <Field label="Gmail label" htmlFor="gmail-label" error={ruleError} hint="Exactly as it's named in Gmail.">
              <Input id="gmail-label" value={label} maxLength={100} onChange={(event) => setLabel(event.target.value)} />
            </Field>
            <Field label="Add modules to" htmlFor="gmail-type" hint="A type from Resource types.">
              <select id="gmail-type" value={resourceType} onChange={(event) => setResourceType(event.target.value)} className="h-11 w-full rounded-xl border border-border-strong bg-surface px-3 text-base text-text">
                {types.map((type) => <option key={type} value={type}>{typeMeta(type).plural}</option>)}
              </select>
            </Field>
            <Button type="submit" variant="secondary" disabled={pending || (label.trim() === status.label && resourceType === status.resourceType)}>Save</Button>
          </form>
        </>
      )}
    </ListCard>
  );
}
