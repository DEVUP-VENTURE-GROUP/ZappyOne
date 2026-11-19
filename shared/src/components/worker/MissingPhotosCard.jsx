import { Camera, ChevronRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useProviderMissingPhotosQuery } from '../../services/api';

// Jobs on the pro's menu with no photo: one tap to the menu to add them (server repair provider-menu missingPhotos).
export default function MissingPhotosCard({ to = '/provider/services', className = '' }) {
  const nav = useNavigate();
  const { data } = useProviderMissingPhotosQuery();
  if (!data?.count) return null;
  const names = data.names.join(', ') + (data.count > data.names.length ? ` and ${data.count - data.names.length} more` : '');
  return (
    <button type="button" onClick={() => nav(to)} className={`flex w-full items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-3.5 text-left ${className}`}>
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700"><Camera size={17} /></span>
      <span className="min-w-0 flex-1">
        <span className="block text-[14px] font-semibold text-navy">{data.count === 1 ? '1 job has no photo' : `${data.count} jobs have no photo`}</span>
        <span className="block truncate text-[12px] text-slate-600">Customers book what they can see. Add a photo to {names}.</span>
      </span>
      <ChevronRight size={18} className="shrink-0 text-slate-400" />
    </button>
  );
}
