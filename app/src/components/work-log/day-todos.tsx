"use client";

import { format, parseISO } from "date-fns";
import { CircleAlert, CircleCheck, ListTodo, Star } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";

export type DayTodo = {
  id: string;
  subject: string;
  status: "Open" | "Done";
  pinned: boolean;
  /** "YYYY-MM-DD" or null. */
  dueDate: string | null;
  /** ISO timestamp or null. */
  completedAt: string | null;
};

/** The browser's local calendar day of a timestamp. */
function localDay(iso: string) {
  return format(new Date(iso), "yyyy-MM-dd");
}

function subscribeNever() {
  return () => {};
}

/**
 * The Tracker's to-dos as they stood on this log's day: what you finished that
 * day, and what was due by then but still not done at the end of it.
 *
 * "That day" is the user's local calendar day, which only the browser knows,
 * so the server sends a slightly wider window and the narrowing happens here,
 * after hydration (the server paints a neutral placeholder).
 */
export function DayTodos({ date, todos, compact = false }: { date: string; todos: DayTodo[]; compact?: boolean }) {
  const hydrated = useSyncExternalStore(subscribeNever, () => true, () => false);

  const completed = hydrated ? todos.filter((todo) => todo.completedAt && localDay(todo.completedAt) === date) : [];
  const overdue = hydrated
    ? todos.filter(
        (todo) =>
          todo.dueDate !== null &&
          todo.dueDate <= date &&
          // Not finished by the end of that day.
          !(todo.completedAt && localDay(todo.completedAt) <= date),
      )
    : [];
  const total = completed.length + overdue.length;

  return (
    <section aria-labelledby="day-todos-heading" data-reveal className="wl-card overflow-hidden">
      <h2 id="day-todos-heading" className="flex items-center gap-2 border-b border-border px-4 py-4 text-lg font-semibold tracking-[-0.015em] text-text md:px-6">
        To-dos
        {hydrated ? <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs font-semibold text-accent-text tabular-nums">{total}</span> : null}
        <Link href="/tracker" className="tap-area ml-auto text-sm font-semibold text-accent-text hover:underline">Open Tracker</Link>
      </h2>

      {!hydrated ? (
        <p className="px-4 py-5 text-sm text-text-muted md:px-6">Loading…</p>
      ) : total === 0 ? (
        <p className="flex items-center gap-2 px-4 py-5 text-sm text-text-muted md:px-6">
          <ListTodo className="size-4" aria-hidden="true" />
          No to-dos finished or overdue on this day.
        </p>
      ) : (
        <div className={compact ? "grid gap-px bg-border" : "grid gap-px bg-border md:grid-cols-2"}>
          <TodoGroup title="Completed that day" empty="Nothing ticked off." items={completed} kind="done" date={date} />
          <TodoGroup title="Overdue / not done" empty="Nothing overdue." items={overdue} kind="overdue" date={date} />
        </div>
      )}
    </section>
  );
}

function TodoGroup({ title, empty, items, kind, date }: { title: string; empty: string; items: DayTodo[]; kind: "done" | "overdue"; date: string }) {
  const Icon = kind === "done" ? CircleCheck : CircleAlert;
  return (
    <div className="bg-surface px-4 py-4 md:px-6">
      <h3 className="flex items-center gap-1.5 text-xs font-bold tracking-[0.06em] text-text-muted uppercase">
        <Icon className={kind === "done" ? "size-3.5 text-primary" : "size-3.5 text-danger"} aria-hidden="true" />
        {title}
        <span className="font-semibold text-text-subtle tabular-nums">{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-text-subtle">{empty}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {items.map((todo) => (
            <li key={todo.id} className="flex w-full min-w-0 items-start gap-2 text-sm">
              <span className="w-full min-w-0 flex-1 overflow-hidden">
                <span className={kind === "done" ? "block w-full whitespace-normal break-words text-text-muted line-through" : "block w-full whitespace-normal break-words font-medium text-text"}>
                  {todo.subject}
                </span>
                {kind === "overdue" && todo.dueDate ? (
                  <span className="text-xs text-danger">
                    {todo.dueDate === date ? "Due this day" : `Due ${format(parseISO(todo.dueDate), "d MMM")}`}
                    {todo.completedAt ? ` · done ${format(new Date(todo.completedAt), "d MMM")}` : ""}
                  </span>
                ) : null}
              </span>
              {todo.pinned ? <Star className="mt-0.5 size-3.5 shrink-0 fill-current text-warning" aria-label="Important" /> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
