import toast from 'react-hot-toast';
import { FileSignature } from 'lucide-react';
import { useAcceptShopAgreementMutation, useShopAgreementQuery } from '../../services/api';
import PartnerTermsList from './PartnerTermsList';

// Shown until this partner has accepted the current partner terms; hidden once they have.
export default function PartnerTermsCard() {
  const { data } = useShopAgreementQuery();
  const [accept, { isLoading }] = useAcceptShopAgreementMutation();
  if (!data || data.current) return null;
  async function agree() {
    try { await accept().unwrap(); toast.success('Partner terms accepted'); } catch (e) { toast.error(e?.data?.error || 'Could not save. Try again.'); }
  }
  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/60 p-4">
      <div className="mb-3 flex items-center gap-2">
        <FileSignature size={18} className="text-amber-700" />
        <h2 className="text-[15px] font-bold text-slate-900">{data.agreement ? 'Our partner terms have changed' : 'Accept the partner terms'}</h2>
      </div>
      <PartnerTermsList terms={data.terms} />
      <button type="button" onClick={agree} disabled={isLoading} className="mt-3 w-full rounded-xl bg-zappy-600 py-3 text-sm font-bold text-white disabled:opacity-50">
        {isLoading ? 'Saving…' : 'I accept the partner terms'}
      </button>
    </section>
  );
}
