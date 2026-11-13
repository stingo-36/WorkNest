/**
 * Shared placeholder for every signed-in page (2026-11-12). Every page here reads
 * the session, so Next treats them as dynamic: without a loading boundary a click
 * waits for the server before anything changes, and production can't prefetch
 * them at all. With it, the click switches at once and the page streams in.
 * Routes with their own `loading.tsx` (Tickets) still use theirs.
 */
export default function AppLoading() {
  return (
    <div aria-label="Loading" aria-busy="true" className="flex w-full min-w-0 animate-pulse flex-col gap-6">
      <div className="flex flex-col gap-3">
        <div className="h-4 w-56 rounded bg-surface-2" />
        <div className="h-10 w-72 max-w-full rounded-lg bg-surface-3" />
        <div className="h-4 w-48 rounded bg-surface-2" />
      </div>
      <div className="h-14 w-full rounded-2xl bg-surface" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-64 rounded-2xl bg-surface" />
        <div className="h-64 rounded-2xl bg-surface" />
      </div>
    </div>
  );
}
