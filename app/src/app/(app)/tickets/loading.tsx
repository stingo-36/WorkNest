export default function TicketsLoading() {
  return (
    <div aria-label="Loading tickets" aria-busy="true" className="w-full animate-pulse">
      <div className="h-12 w-52 rounded-lg bg-surface-3" />
      <div className="mt-3 h-5 w-full max-w-xl rounded bg-surface-2" />
      <div className="mt-6 grid gap-3 border-y border-border py-4 md:grid-cols-[minmax(0,1fr)_15rem]">
        <div className="h-16 rounded-xl bg-surface" />
        <div className="h-16 rounded-xl bg-surface" />
      </div>
      <div className="mt-6 grid items-start gap-6 lg:grid-cols-[19rem_minmax(0,1fr)]">
        <div className="hidden overflow-hidden rounded-2xl border border-border bg-card lg:block">
          <div className="h-12" />
          <div className="space-y-2 p-2">
            {[0, 1, 2].map((item) => <div key={item} className="h-28 rounded-xl bg-surface" />)}
          </div>
        </div>
        <div className="overflow-hidden rounded-2xl border border-border bg-card">
          <div className="h-28" />
          <div className="space-y-6 p-6">
            <div className="h-20 rounded-xl bg-surface" />
            <div className="h-52 rounded-xl bg-surface" />
            <div className="h-56 rounded-xl bg-surface" />
          </div>
        </div>
      </div>
    </div>
  );
}
