"use client";

import { Building2, CalendarRange, LibraryBig, Mail, MessageSquare, Tag, Tags, Ticket, UserRound, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { addDays, format } from "date-fns";

import { updateProfile } from "@/actions/profile";
import { cn } from "@/components/cn";
import { AiSettingsCard, type AiSettingsView } from "@/components/profile/ai-settings";
import { PasswordSettings } from "@/components/profile/password-settings";
import {
  ListCard,
  OrderedListEditor,
  ProjectListEditor,
  TagListEditor,
  type ProjectOption,
  type TagUsage,
} from "@/components/profile/list-editors";
import { PageHead } from "@/components/shell/page-head";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { getSprint } from "@/lib/sprint";

type ProfileValues = {
  name: string;
  sprintStartDate: string;
  sprintLengthDays: number;
  ticketsEnabled: boolean;
};

type OrderedState = { values: string[]; customized: boolean };

export type ProfileLists = {
  channels: OrderedState;
  resourceTypes: OrderedState;
  /** type → picked icon ("library:Name") */
  resourceTypeIcons: Record<string, string>;
  meetings: OrderedState;
  projects: ProjectOption[];
  noteTags: TagUsage[];
  resourceTags: TagUsage[];
};

const LENGTHS = [
  { days: 7, label: "1 week" },
  { days: 14, label: "2 weeks" },
  { days: 21, label: "3 weeks" },
  { days: 28, label: "4 weeks" },
];

const MENU = [
  {
    label: "Settings",
    items: [
      { id: "account", label: "Account", Icon: UserRound },
      { id: "sprint", label: "Sprint calendar", Icon: CalendarRange },
      { id: "work-logs", label: "Work logs", Icon: Ticket },
    ],
  },
  {
    label: "Dropdown lists",
    items: [
      { id: "channels", label: "Follow-up channels", Icon: MessageSquare },
      { id: "resource-types", label: "Resource types", Icon: LibraryBig },
      { id: "meetings", label: "Default meetings", Icon: Users },
      { id: "projects", label: "Projects / sites", Icon: Building2 },
    ],
  },
  {
    label: "Tags",
    items: [
      { id: "note-tags", label: "Note tags", Icon: Tags },
      { id: "resource-tags", label: "Resource tags", Icon: Tag },
    ],
  },
] as const;

type ProfileSection = (typeof MENU)[number]["items"][number]["id"];
type SettingsSection = "account" | "sprint" | "work-logs";
const SECTION_IDS: readonly string[] = MENU.flatMap((group) => group.items.map((item) => item.id));

/**
 * Profile. Two kinds of setting live here and save differently:
 *  - account / sprint / work-log settings → edited together, saved with the
 *    bar that appears at the bottom once something changes;
 *  - dropdown lists and tags → each change saves on its own, immediately.
 */
export function ProfileForm({ email, initial, lists, ai, initialSection }: { email: string; initial: ProfileValues; lists: ProfileLists; ai: AiSettingsView; /** `?section=` from the URL — validated here. */ initialSection?: string }) {
  const router = useRouter();
  const [values, setValues] = useState(initial);
  const [error, setError] = useState<string>();
  const [pending, startTransition] = useTransition();
  const [section, setSection] = useState<ProfileSection>(
    SECTION_IDS.includes(initialSection ?? "") ? (initialSection as ProfileSection) : "account",
  );
  const dirty = JSON.stringify(values) !== JSON.stringify(initial);
  // Which settings sections hold unsaved edits — marked with a dot in the menu.
  const dirtyBySection: Record<SettingsSection, boolean> = {
    account: values.name !== initial.name,
    sprint: values.sprintStartDate !== initial.sprintStartDate || values.sprintLengthDays !== initial.sprintLengthDays,
    "work-logs": values.ticketsEnabled !== initial.ticketsEnabled,
  };

  function open(next: ProfileSection) {
    setSection(next);
    // Shallow URL update so refresh / back lands on the same section.
    window.history.replaceState(null, "", next === "account" ? "/profile" : `/profile?section=${next}`);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  const set = <K extends keyof ProfileValues>(key: K, value: ProfileValues[K]) => setValues((current) => ({ ...current, [key]: value }));

  // Live preview of what the sprint settings mean today.
  const anchor = values.sprintStartDate ? new Date(`${values.sprintStartDate}T00:00:00`) : null;
  const current = anchor ? getSprint(new Date(), { anchor, days: values.sprintLengthDays }) : null;
  const displayName = initial.name || email;
  const initials = (values.name || email).split(/[\s@.]+/).filter(Boolean).slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");

  function save() {
    setError(undefined);
    startTransition(async () => {
      const result = await updateProfile({
        name: values.name,
        sprintStartDate: values.sprintStartDate || null,
        sprintLengthDays: values.sprintLengthDays,
        ticketsEnabled: values.ticketsEnabled,
      });
      if (!result.ok) { setError(result.error.message); return; }
      toast.success("Profile saved");
      router.refresh();
    });
  }

  return (
    // Redesigned 2026-10-08: identity header, one horizontal tab bar, settings as label/control rows.
    <div className="tk-focus flex w-full min-w-0 flex-col gap-8">
      <PageHead
        title={displayName}
        description={<span className="inline-flex min-w-0 items-center gap-2 [overflow-wrap:anywhere]"><Mail className="size-4 shrink-0" aria-hidden="true" />{email}</span>}
        stats={[
          { value: LENGTHS.find((item) => item.days === initial.sprintLengthDays)?.label ?? `${initial.sprintLengthDays} days`, label: "sprints" },
          { value: initial.ticketsEnabled ? "On" : "Off", label: "ticket tracking" },
        ]}
        actions={<span className="grid size-14 place-items-center rounded-full bg-sidebar text-xl font-bold text-sidebar-fg max-md:hidden" aria-hidden="true">{initials || "?"}</span>}
      />

      <div className="mx-auto w-full max-w-5xl lg:hidden">
        <label id="profile-section-label" className="tk-label mb-2 block text-text-muted">Profile section</label>
        <Select aria-labelledby="profile-section-label" value={section} onChange={(event) => open(event.target.value as ProfileSection)}>
          {MENU.map((group) => group.items.map(({ id, label }) => <option key={id} value={id}>{label}</option>))}
        </Select>
      </div>

      {/* Larger screens have enough room to wrap every section into labelled tabs. */}
      <nav aria-label="Profile sections" className="mx-auto hidden w-full max-w-5xl min-w-0 rounded-2xl border border-border bg-surface p-1.5 lg:block">
        <div className="flex w-max items-center gap-1 lg:w-auto lg:flex-wrap">
          {MENU.map((group, groupIndex) => (
            <div key={group.label} className="flex items-center gap-1">
              {groupIndex > 0 ? <span className="mx-1.5 h-6 w-px bg-border" aria-hidden="true" /> : null}
              {group.items.map(({ id, label, Icon }) => {
                const active = section === id;
                return (
                  <button
                    key={id}
                    type="button"
                    aria-current={active ? "page" : undefined}
                    onClick={() => open(id)}
                    className={cn(
                      "inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-xl px-3.5 text-sm font-semibold whitespace-nowrap transition-colors duration-150",
                      active ? "bg-sidebar text-sidebar-fg" : "text-text-muted hover:bg-surface-2 hover:text-text",
                    )}
                  >
                    <Icon className={cn("size-4 shrink-0", active ? "text-sidebar-fg" : "text-accent-text")} aria-hidden="true" />
                    {label}
                    {id in dirtyBySection && dirtyBySection[id as SettingsSection] ? <span className="size-2 rounded-full bg-warning" aria-label="unsaved" /> : null}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </nav>

      <div className="mx-auto w-full max-w-5xl min-w-0">
          {section === "account" ? (
            <div className="flex flex-col gap-6">
              <SettingsRows title="Account">
                <SettingsRow label="Name" hint="As it appears in the app and on your 5-15 reports." htmlFor="profile-name">
                  <Input id="profile-name" value={values.name} maxLength={80} onChange={(event) => set("name", event.target.value)} />
                </SettingsRow>
                <SettingsRow label="Email" hint="Used to sign in — can't be changed here." htmlFor="profile-email">
                  <Input id="profile-email" value={email} readOnly disabled />
                </SettingsRow>
              </SettingsRows>
              <PasswordSettings />
              {/* Saves on its own — not part of the save bar below. */}
              <AiSettingsCard initial={ai} />
            </div>
          ) : null}

          {section === "sprint" ? (
            <SettingsRows title="Sprint calendar">
              <SettingsRow label="A sprint starts on" hint="Work Logs group your days into sprints counted from this date." htmlFor="profile-sprint-start">
                <Input id="profile-sprint-start" type="date" value={values.sprintStartDate} onChange={(event) => set("sprintStartDate", event.target.value)} className="md:max-w-60" />
              </SettingsRow>
              <SettingsRow label="Sprint length" labelId="profile-sprint-length">
                <div role="radiogroup" aria-labelledby="profile-sprint-length" className="grid grid-cols-2 gap-2 md:grid-cols-4">
                  {LENGTHS.map(({ days, label }) => {
                    const active = values.sprintLengthDays === days;
                    return (
                      <button
                        key={days}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => set("sprintLengthDays", days)}
                        className={cn("h-12 cursor-pointer rounded-xl border-[1.5px] px-2 text-sm font-semibold whitespace-nowrap transition-colors duration-150", active ? "border-primary bg-primary-subtle text-accent-text" : "border-border text-text hover:border-border-strong")}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </SettingsRow>
              {current ? (
                <SettingsRow label="Preview" hint="What these settings mean today.">
                  <dl className="grid gap-3 md:grid-cols-2">
                    <div>
                      <dt className="text-xs font-semibold text-text-muted">Current sprint</dt>
                      <dd className="mt-0.5 text-base font-semibold text-text">{format(current.start, "EEE d MMM")} – {format(current.end, "EEE d MMM")}</dd>
                    </div>
                    <div>
                      <dt className="text-xs font-semibold text-text-muted">Next sprint starts</dt>
                      <dd className="mt-0.5 text-base font-semibold text-text">{format(addDays(current.end, 1), "EEEE d MMM")}</dd>
                    </div>
                  </dl>
                </SettingsRow>
              ) : null}
            </SettingsRows>
          ) : null}

          {section === "work-logs" ? (
            <SettingsRows title="Work logs">
              <SettingsRow label="Track tickets in work logs" labelId="profile-tickets-label" hint="Shows the Tickets page and the ticket sections in each work log. Turning it off hides them — nothing is deleted.">
                <button
                  type="button"
                  role="switch"
                  aria-checked={values.ticketsEnabled}
                  aria-labelledby="profile-tickets-label"
                  onClick={() => set("ticketsEnabled", !values.ticketsEnabled)}
                  className={cn(
                    "relative h-11 w-14 shrink-0 cursor-pointer rounded-full before:absolute before:inset-x-0 before:top-1.5 before:h-8 before:rounded-full before:transition-colors before:duration-150",
                    values.ticketsEnabled ? "before:bg-primary" : "before:bg-border-strong",
                  )}
                >
                  <span className={cn("absolute top-2.5 size-6 rounded-full bg-surface shadow-sm transition-[left] duration-150", values.ticketsEnabled ? "left-7" : "left-1")} aria-hidden="true" />
                </button>
              </SettingsRow>
            </SettingsRows>
          ) : null}

          {section === "channels" ? <OrderedListEditor kind="FollowUpChannel" title="Follow-up channels" description="Tracker → Follow-ups → “Where”. Drag ⋮⋮ to reorder; removing one never changes old follow-ups." initial={lists.channels.values} customized={lists.channels.customized} addPlaceholder="e.g. WhatsApp" /> : null}
          {section === "resource-types" ? <OrderedListEditor kind="ResourceType" title="Resource types" description="Resources → “Resource type”, and the order of sections on that page. Click an icon to change it." initial={lists.resourceTypes.values} icons={lists.resourceTypeIcons} customized={lists.resourceTypes.customized} addPlaceholder="e.g. Video" /> : null}
          {section === "meetings" ? <OrderedListEditor kind="DefaultMeeting" title="Default meetings" description="The meeting cards every new work log starts with. Existing logs are not changed." initial={lists.meetings.values} customized={lists.meetings.customized} addPlaceholder="e.g. Daily stand-up" /> : null}
          {section === "projects" ? <ProjectListEditor initial={lists.projects} /> : null}
          {section === "note-tags" ? (
            <ListCard title="Note tags" description="Add tags ahead of time, rename them on every note, or delete them.">
              <TagListEditor kind="NoteTag" noun={{ one: "note", many: "notes" }} initial={lists.noteTags} />
            </ListCard>
          ) : null}
          {section === "resource-tags" ? (
            <ListCard title="Resource tags" description="Add tags ahead of time, rename them on every resource, or delete them.">
              <TagListEditor kind="ResourceTag" noun={{ one: "resource", many: "resources" }} initial={lists.resourceTags} />
            </ListCard>
          ) : null}
      </div>

      {/* Save bar for the account / sprint / work-log settings — only once something changed. */}
      {dirty ? (
        <div className="sticky bottom-4 z-30 mx-auto flex w-full max-w-2xl flex-wrap items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3 shadow-lg">
          <p className="mr-auto text-sm font-semibold text-text">{error ? <span className="text-danger" role="alert">{error}</span> : "You have unsaved changes"}</p>
          <Button variant="secondary" disabled={pending} onClick={() => { setValues(initial); setError(undefined); }}>Reset</Button>
          <Button onClick={save} loading={pending}>Save changes</Button>
        </div>
      ) : null}
    </div>
  );
}

/** A settings card of label/control rows (2026-10-08 redesign). */
function SettingsRows({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title} className="overflow-hidden rounded-2xl border border-border bg-surface">
      <h2 className="border-b border-border px-5 py-4 text-xl font-semibold tracking-[-0.015em] text-text md:px-6">{title}</h2>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

function SettingsRow({ label, hint, htmlFor, labelId, children }: { label: string; hint?: string; htmlFor?: string; labelId?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-3 px-5 py-5 md:grid-cols-[16rem_minmax(0,1fr)] md:items-center md:gap-8 md:px-6">
      <div>
        {htmlFor ? (
          <label htmlFor={htmlFor} className="text-sm font-semibold text-text">{label}</label>
        ) : (
          <p id={labelId} className="text-sm font-semibold text-text">{label}</p>
        )}
        {hint ? <p className="mt-0.5 text-sm text-text-muted">{hint}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}
