import { Hourglass } from 'lucide-react';

/**
 * On Rakshak, someone not yet ZappyOne staff (provider/staffPortal): they
 * finish their verification, and ZappyOne adds them to a hub with a salary.
 */
export default function StaffWaitingCard() {
  return (
    <section className="flex items-start gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-100">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><Hourglass size={19} /></span>
      <div className="min-w-0">
        <p className="text-[15px] font-bold text-slate-900">Joining ZappyOne</p>
        <p className="mt-0.5 text-[13px] leading-relaxed text-slate-600">
          Finish your ID check and your services. Our team will add you to a hub and set your salary, then your shifts appear here.
        </p>
      </div>
    </section>
  );
}
