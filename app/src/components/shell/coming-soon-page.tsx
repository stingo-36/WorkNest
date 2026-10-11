import { Clock3, NotebookPen } from "lucide-react";
import Link from "next/link";

import { PageHeader } from "@/components/shell/page-header";
import { buttonVariants } from "@/components/ui/button";

export function ComingSoonPage({ title }: { title: string }) {
  return (
    <>
      <PageHeader
        title={title}
        description="This workspace area is intentionally paused while Work Logs are completed."
      />

      <section className="motion-page-enter scroll-reveal relative isolate overflow-hidden rounded-lg border border-border bg-card px-6 py-14 text-center shadow-sm md:px-10 md:py-20">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 -z-10 h-32 bg-primary-subtle/45"
        />
        <span className="mx-auto grid size-12 place-items-center rounded-md border border-primary/30 bg-surface text-accent-text shadow-sm">
          <Clock3 className="size-6" aria-hidden="true" />
        </span>
        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.12em] text-text-subtle">
          Coming soon
        </p>
        <h2 className="mt-2 text-2xl font-semibold text-text">
          {title} will be added after Work Logs
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-text-muted md:text-base">
          For now, the product is focused on daily logs, meeting notes, and the
          ticket updates recorded inside each work log.
        </p>
        <Link
          href="/work-logs"
          className={buttonVariants({ className: "mt-6" })}
        >
          <NotebookPen aria-hidden="true" />
          Open Work Logs
        </Link>
      </section>
    </>
  );
}
