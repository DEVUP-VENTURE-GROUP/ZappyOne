// An admin-managed policy's text: numbered lines are headings, blank lines are breaks (used by the policy page and the terms sheet).
export default function PolicyBody({ policy }) {
  return (
    <>
      <div className="space-y-2.5">
        {String(policy.body || '').split('\n').map((line, i) => {
          const t = line.trim();
          if (!t) return <div key={i} className="h-2" />;
          const isHeading = /^\d+\./.test(t);
          return (
            <p key={i} className={`text-sm leading-relaxed ${isHeading ? 'font-semibold text-[#0F172A]' : 'text-slate-600'}`}>
              {t}
            </p>
          );
        })}
      </div>
      {policy.updatedAt && (
        <p className="text-[11px] text-slate-400 mt-5 pt-4 border-t border-slate-100">
          Last updated {new Date(policy.updatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
        </p>
      )}
    </>
  );
}
