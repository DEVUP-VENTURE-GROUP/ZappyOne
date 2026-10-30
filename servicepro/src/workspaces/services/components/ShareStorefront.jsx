import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Copy, Link2, MessageCircle } from 'lucide-react';
import { useShopShareLinkQuery } from '@shared/services/api';

// The shop's own storefront link: customers who book through it are theirs, at the own-link commission while it lasts, and their reviews never count toward the public rating.
export default function ShareStorefront() {
  const { data } = useShopShareLinkQuery();
  if (!data?.url) return null;
  const text = `Book me on ZappyOne at my fixed prices: ${data.url}`;
  const copy = async () => { try { await navigator.clipboard.writeText(data.url); toast.success('Link copied'); } catch { toast.error('Could not copy. Long-press the link to copy it.'); } };
  return (
    <motion.section initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="card space-y-2">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-zappy-50 text-zappy-700"><Link2 size={18} /></span>
        <div className="min-w-0">
          <p className="font-bold text-slate-900">Share your storefront</p>
          <p className="text-xs leading-relaxed text-slate-500">
            Send this to your own customers. They book you straight away, with ZappyOne's start code, photos and redo guarantee.
          </p>
        </div>
      </div>
      <p className="select-all truncate rounded-xl bg-slate-50 px-3 py-2 font-mono text-xs text-slate-700">{data.url}</p>
      <div className="flex gap-2">
        <button type="button" onClick={copy} className="btn-secondary flex-1 text-sm"><Copy size={14} /> Copy</button>
        <a href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noreferrer" className="btn-primary flex-1 text-sm"><MessageCircle size={14} /> WhatsApp</a>
      </div>
    </motion.section>
  );
}
