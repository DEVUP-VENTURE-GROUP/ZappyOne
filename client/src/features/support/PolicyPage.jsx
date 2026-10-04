import { useParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, Loader2, FileText } from 'lucide-react';
import { useGetPolicyQuery } from '@shared/services/api';

/**
 * Renders any admin-managed policy page by slug (refund-policy, privacy-policy,
 * warranty-guidelines, terms…). Content is fully DB-driven — nothing hardcoded.
 * Body is plain text with line breaks; numbered/point lines get light emphasis.
 */
export default function PolicyPage() {
  const { slug } = useParams();
  const nav = useNavigate();
  const { data, isLoading, isError } = useGetPolicyQuery(slug);
  const policy = data?.policy;

  return (
    <div className="min-h-screen bg-[#F9FAFB]">
      <div className="sticky top-0 z-10 bg-white border-b border-slate-100 px-4 pt-4 pb-3">
        <div className="flex items-center gap-3">
          <button onClick={() => nav(-1)} className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center">
            <ChevronLeft size={18} className="text-slate-600" />
          </button>
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-zappy-600 flex items-center justify-center shrink-0"><FileText size={16} className="text-white" /></div>
            <h1 className="font-extrabold text-lg text-[#0F172A] truncate">{policy?.title || 'Policy'}</h1>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-5">
        {isLoading ? (
          <div className="flex justify-center py-16"><Loader2 size={24} className="animate-spin text-zappy-500" /></div>
        ) : isError || !policy ? (
          <div className="text-center py-16 text-slate-400">
            <FileText size={40} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm font-medium">This page isn’t available right now.</p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
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
          </div>
        )}
      </div>
    </div>
  );
}
