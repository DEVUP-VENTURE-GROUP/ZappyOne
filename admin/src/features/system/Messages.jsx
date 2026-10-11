import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Loader2, Mail, Bell, Send, CheckCircle2, AlertTriangle } from 'lucide-react';
import {
  useAdminMessagesQuery, useAdminMessagePreviewQuery, useAdminMessageLogQuery,
  useAdminSendTestMessageMutation, useAdminUpdateMessageSettingsMutation,
} from '@shared/services/api';
import { SectionHeader, Card, PageLoader, EmptyState, fmtDate } from '../../ui/kit';

const AUDIENCE = { customer: 'Customers', provider: 'Providers', ops: 'ZappyOne team' };
const STATUS_TONE = {
  sent: 'bg-emerald-50 text-emerald-700', queued: 'bg-blue-50 text-blue-700', in_app: 'bg-slate-100 text-slate-600',
  skipped: 'bg-amber-50 text-amber-700', failed: 'bg-red-50 text-red-700',
};

/** One message: its push as a phone would show it, and its email exactly as sent. */
function Preview({ event }) {
  const { data, isFetching } = useAdminMessagePreviewQuery(event.key);
  const [send, { isLoading }] = useAdminSendTestMessageMutation();
  const [to, setTo] = useState('');
  if (isFetching || !data) return <PageLoader />;

  async function test() {
    try {
      const r = await send({ key: event.key, to: to.trim() || undefined }).unwrap();
      toast.success(`Test sent to ${r.to}`);
    } catch (err) { toast.error(err?.data?.error || 'Could not send the test'); }
  }

  return (
    <div className="space-y-4">
      {data.push && (
        <div>
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Push</p>
          <div className="flex max-w-sm items-start gap-3 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200">
            <img src="/logo.png" alt="" className="h-9 w-9 shrink-0 rounded-lg" />
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-slate-900">{data.push.title}</p>
              <p className="text-[12.5px] leading-snug text-slate-600">{data.push.body}</p>
            </div>
          </div>
        </div>
      )}
      {data.email && (
        <div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Email</p>
            <div className="flex items-center gap-2">
              <input value={to} onChange={(e) => setTo(e.target.value)} placeholder="Your email (optional)"
                className="w-52 rounded-lg border border-slate-200 px-3 py-1.5 text-xs outline-none focus:ring-2 focus:ring-blue-500" />
              <button type="button" onClick={test} disabled={isLoading}
                className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50">
                {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />} Send me a test
              </button>
            </div>
          </div>
          <p className="mb-2 text-[13px] text-slate-700"><span className="text-slate-400">Subject:</span> {data.email.subject}</p>
          <iframe title={`${event.key} email`} srcDoc={data.email.html} sandbox=""
            className="h-[640px] w-full rounded-xl border border-slate-200 bg-white" />
        </div>
      )}
    </div>
  );
}

function Catalog({ events, emailReady }) {
  const [selected, setSelected] = useState(events[0]?.key);
  const groups = useMemo(() => Object.entries(AUDIENCE).map(([a, label]) => [label, events.filter((e) => e.audience === a)]), [events]);
  const current = events.find((e) => e.key === selected);
  return (
    <div className="space-y-4">
      <div className={`flex items-start gap-3 rounded-xl px-4 py-3 text-[13px] ${emailReady ? 'bg-emerald-50 text-emerald-800' : 'bg-amber-50 text-amber-800'}`}>
        {emailReady ? <CheckCircle2 size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
        <p>{emailReady
          ? 'Email is set up. Customers and providers with a verified email get these automatically.'
          : 'Email is not set up yet, so emails are logged but not sent; pushes and in-app notices already go. Add the SMTP details on the server to start sending.'}</p>
      </div>
      <div className="grid gap-5 lg:grid-cols-[300px_1fr]">
        <Card className="h-fit p-2">
          {groups.map(([label, list]) => (list.length ? (
            <div key={label} className="mb-2">
              <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
              {list.map((e) => (
                <button key={e.key} type="button" onClick={() => setSelected(e.key)}
                  className={`flex w-full items-center justify-between gap-2 rounded-lg px-2 py-2 text-left text-[13px] ${selected === e.key ? 'bg-blue-50 text-blue-800' : 'text-slate-700 hover:bg-slate-50'}`}>
                  <span className="min-w-0">{e.label}</span>
                  <span className="flex shrink-0 gap-1 text-slate-400">
                    {e.channels.includes('push') && <Bell size={13} />}
                    {e.channels.includes('email') && <Mail size={13} />}
                  </span>
                </button>
              ))}
            </div>
          ) : null))}
        </Card>
        <Card className="p-4">{current ? <Preview key={current.key} event={current} /> : <EmptyState message="Pick a message" />}</Card>
      </div>
    </div>
  );
}

function DeliveryLog() {
  const { data, isLoading } = useAdminMessageLogQuery(undefined, { pollingInterval: 30000 });
  if (isLoading) return <PageLoader />;
  const rows = data?.rows || [];
  if (!rows.length) return <EmptyState message="Nothing sent yet." />;
  return (
    <Card className="overflow-x-auto p-0">
      <table className="w-full min-w-[720px] text-[13px]">
        <thead>
          <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400">
            <th className="px-4 py-2">When</th><th className="px-4 py-2">Message</th><th className="px-4 py-2">To</th><th className="px-4 py-2">How</th><th className="px-4 py-2">Result</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r._id} className="border-t border-slate-100 align-top">
              <td className="whitespace-nowrap px-4 py-2 text-slate-500">{fmtDate(r.createdAt)}</td>
              <td className="px-4 py-2"><p className="text-slate-800">{r.subject || r.key}</p><p className="text-[11px] text-slate-400">{r.key}</p></td>
              <td className="px-4 py-2 text-slate-600">{r.address || `${r.toKind}${r.toId ? ` …${r.toId.slice(-6)}` : ''}`}</td>
              <td className="px-4 py-2 text-slate-600">{r.channel}</td>
              <td className="px-4 py-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${STATUS_TONE[r.status] || ''}`}>{r.status.replace('_', '-')}</span>
                {r.reason && <p className="mt-0.5 text-[11px] text-slate-400">{r.reason}</p>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  );
}

const FIELDS = [
  ['brandName', 'Brand name', 'Shown in every email and receipt'],
  ['legalName', 'Company (legal name)', 'Emails say "ZappyOne is a venture of …"; receipts are issued by it'],
  ['gstin', 'GSTIN', 'Printed on receipts. With GST actually charged, a receipt becomes a tax invoice'],
  ['address', 'Registered address', 'In the email footer, on receipts and on the legal pages'],
  ['supportEmail', 'Support email', 'Replies to automatic emails go here'],
  ['supportPhone', 'Support phone', 'In the footer of every email'],
  ['grievanceOfficer', 'Grievance Officer (name)', 'Named on the Privacy Policy and Grievance Redressal pages, as Indian law requires'],
  ['grievanceEmail', 'Grievance email', 'Where grievances go; blank uses the support email'],
];

export function BusinessDetails({ s }) {
  const [form, setForm] = useState(null);
  const [save, { isLoading }] = useAdminUpdateMessageSettingsMutation();
  useEffect(() => {
    setForm({ ...Object.fromEntries(FIELDS.map(([k]) => [k, s[k] || ''])), quietFromHour: s.quietFromHour, quietToHour: s.quietToHour, opsEmails: (s.opsEmails || []).join(', ') });
  }, [s]);
  if (!form) return null;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit() {
    try {
      await save({
        ...Object.fromEntries(FIELDS.map(([k]) => [k, form[k].trim()])),
        quietFromHour: Number(form.quietFromHour), quietToHour: Number(form.quietToHour),
        opsEmails: form.opsEmails.split(/[\s,]+/).filter(Boolean),
      }).unwrap();
      toast.success('Saved. New messages use these details.');
    } catch (err) { toast.error(err?.data?.error || 'Could not save'); }
  }

  return (
    <Card className="max-w-3xl space-y-4 p-5">
      {FIELDS.map(([k, label, hint]) => (
        <label key={k} className="block">
          <span className="text-sm font-semibold text-slate-800">{label}</span>
          <span className="block text-[12px] text-slate-500">{hint}</span>
          {k === 'address'
            ? <textarea rows={2} value={form[k]} onChange={set(k)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
            : <input value={form[k]} onChange={set(k)} className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />}
        </label>
      ))}
      <label className="block">
        <span className="text-sm font-semibold text-slate-800">Team emails</span>
        <span className="block text-[12px] text-slate-500">Get the 8 am summary, SOS alerts and new verifications. Empty: the admin accounts get them.</span>
        <input value={form.opsEmails} onChange={set('opsEmails')} placeholder="ops@zappyone.com, founder@zappyone.com"
          className="mt-1.5 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500" />
      </label>
      <div>
        <span className="text-sm font-semibold text-slate-800">Quiet hours (India time)</span>
        <span className="block text-[12px] text-slate-500">Reminders and summaries wait until morning; booking updates and job alerts still go.</span>
        <div className="mt-1.5 flex items-center gap-2 text-sm text-slate-600">
          From <input type="number" min="0" max="23" value={form.quietFromHour} onChange={set('quietFromHour')} className="w-20 rounded-lg border border-slate-200 px-2 py-1.5" />
          to <input type="number" min="0" max="23" value={form.quietToHour} onChange={set('quietToHour')} className="w-20 rounded-lg border border-slate-200 px-2 py-1.5" /> hours
        </div>
      </div>
      <button type="button" onClick={submit} disabled={isLoading}
        className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {isLoading && <Loader2 size={14} className="animate-spin" />} Save
      </button>
    </Card>
  );
}

const TABS = [['catalog', 'Messages'], ['log', 'Delivery log'], ['details', 'Business details']];

export default function Messages() {
  const { data, isLoading, isError } = useAdminMessagesQuery();
  const [params, setParams] = useSearchParams();
  const tab = TABS.some(([id]) => id === params.get('sub')) ? params.get('sub') : 'catalog';
  if (isLoading) return <PageLoader />;
  if (isError || !data) return <EmptyState message="Could not load messages. Refresh to try again." />;
  return (
    <div className="space-y-5">
      <SectionHeader title="Messages" subtitle="Every automatic email and push ZappyOne sends: when it goes, how it looks, and whether it arrived." />
      <div className="flex gap-1 border-b border-slate-200" role="tablist">
        {TABS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={tab === id}
            onClick={() => setParams((p) => { const n = new URLSearchParams(p); n.set('sub', id); return n; }, { replace: true })}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-semibold ${tab === id ? 'border-zappy-600 text-slate-900' : 'border-transparent text-slate-500 hover:text-slate-800'}`}>
            {label}
          </button>
        ))}
      </div>
      {tab === 'catalog' && <Catalog events={data.events} emailReady={data.emailReady} />}
      {tab === 'log' && <DeliveryLog />}
      {tab === 'details' && <BusinessDetails s={data.settings} />}
    </div>
  );
}
