// A screen whose data did not arrive says so and offers a retry, instead of loading forever.
export default function LoadFailed({ what = 'This page', onRetry }) {
  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <div role="alert" className="rounded-card border border-line bg-white p-6 text-center">
        <p className="text-[14px] font-semibold text-ink-900">{what} did not load.</p>
        <p className="mt-1 text-[13px] text-ink-500">Check your connection and try again.</p>
        <button type="button" onClick={onRetry} className="btn-outline mt-4 min-h-[38px] px-4 text-[13px]">Try again</button>
      </div>
    </div>
  );
}
