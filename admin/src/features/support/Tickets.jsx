import { useState } from 'react';
import { useAdminSupportTicketsQuery, useAdminReplyTicketMutation } from '@shared/services/api';
import { SectionHeader, Card, PageLoader, Pagination, StatusBadge, Th, Td } from '../../ui/kit';
import { MessageSquare, Send, Loader2, ChevronDown, ChevronUp } from 'lucide-react';

const PRIORITIES = { urgent: 'bg-red-100 text-red-700', high: 'bg-orange-100 text-orange-700', normal: 'bg-slate-100 text-slate-600', low: 'bg-green-100 text-green-700' };

function PriorityBadge({ p }) {
  return <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full capitalize ${PRIORITIES[p] || PRIORITIES.normal}`}>{p}</span>;
}

function TicketRow({ ticket }) {
  const [open, setOpen]   = useState(false);
  const [text, setText]   = useState('');
  const [status, setStatus] = useState('');
  const [reply, { isLoading }] = useAdminReplyTicketMutation();

  async function submit(e) {
    e.preventDefault();
    if (!text.trim()) return;
    await reply({ id: ticket._id, text: text.trim(), status: status || undefined });
    setText('');
    setStatus('');
  }

  return (
    <>
      <tr
        className="hover:bg-slate-50 cursor-pointer transition"
        onClick={() => setOpen(o => !o)}
      >
        <Td mono>{String(ticket._id).slice(-6)}</Td>
        <Td>
          <p className="font-semibold text-slate-800 text-sm truncate max-w-[180px]">{ticket.subject}</p>
          <p className="text-xs text-slate-400 capitalize">{ticket.category?.replace(/_/g, ' ')}</p>
        </Td>
        <Td><StatusBadge status={ticket.status} /></Td>
        <Td><PriorityBadge p={ticket.priority} /></Td>
        <Td muted>{ticket.messages?.length || 0} msgs</Td>
        <Td muted>{new Date(ticket.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</Td>
        <Td right>
          {open ? <ChevronUp size={14} className="text-slate-400" /> : <ChevronDown size={14} className="text-slate-400" />}
        </Td>
      </tr>
      {open && (
        <tr>
          <td colSpan={7} className="bg-slate-50 border-b border-slate-100">
            <div className="px-5 py-4 space-y-3">
              {/* Original message */}
              <div className="bg-white rounded-lg border border-slate-100 p-3">
                <p className="text-xs font-bold text-slate-500 mb-1">User Description</p>
                <p className="text-sm text-slate-700 whitespace-pre-line">{ticket.description}</p>
              </div>
              {/* Thread */}
              {ticket.messages?.length > 0 && (
                <div className="space-y-2">
                  {ticket.messages.map((m, i) => (
                    <div key={i} className={`rounded-lg p-3 text-sm ${m.from === 'admin' ? 'bg-blue-50 border border-blue-100 ml-8' : 'bg-white border border-slate-100 mr-8'}`}>
                      <p className={`text-[10px] font-bold uppercase mb-1 ${m.from === 'admin' ? 'text-blue-600' : 'text-slate-500'}`}>{m.from}</p>
                      <p className="text-slate-700 whitespace-pre-line">{m.text}</p>
                      <p className="text-[10px] text-slate-400 mt-1">{new Date(m.at).toLocaleString('en-IN')}</p>
                    </div>
                  ))}
                </div>
              )}
              {/* Reply form */}
              {!['resolved', 'closed'].includes(ticket.status) && (
                <form onSubmit={submit} className="flex gap-2 pt-1">
                  <textarea
                    value={text}
                    onChange={e => setText(e.target.value)}
                    rows={2}
                    placeholder="Type a reply..."
                    className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <div className="flex flex-col gap-1.5">
                    <select
                      value={status}
                      onChange={e => setStatus(e.target.value)}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 bg-white text-slate-700 outline-none"
                    >
                      <option value="">Keep status</option>
                      <option value="in_progress">In Progress</option>
                      <option value="waiting_user">Waiting User</option>
                      <option value="resolved">Resolved</option>
                      <option value="closed">Closed</option>
                    </select>
                    <button
                      type="submit"
                      disabled={isLoading || !text.trim()}
                      className="flex items-center gap-1.5 bg-blue-600 text-white text-xs font-semibold px-3 py-1.5 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                    >
                      {isLoading ? <Loader2 size={12} className="animate-spin" /> : <Send size={12} />}
                      Send
                    </button>
                  </div>
                </form>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

const STATUS_FILTERS = ['', 'open', 'in_progress', 'waiting_user', 'resolved', 'closed'];

export default function Support() {
  const [page, setPage]         = useState(1);
  const [status, setStatus]     = useState('');
  const [priority, setPriority] = useState('');

  const { data, isLoading } = useAdminSupportTicketsQuery({ status, priority, page });

  if (isLoading) return <PageLoader />;

  const tickets = data?.tickets || [];

  return (
    <div className="space-y-6">
      <SectionHeader
        title="Support Tickets"
        subtitle={`${data?.total || 0} total · click a row to read & reply`}
      />

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <select value={status} onChange={e => { setStatus(e.target.value); setPage(1); }}
          className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All statuses</option>
          {STATUS_FILTERS.filter(Boolean).map(s => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
        </select>
        <select value={priority} onChange={e => { setPriority(e.target.value); setPage(1); }}
          className="text-xs border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 outline-none focus:ring-2 focus:ring-blue-500">
          <option value="">All priorities</option>
          {['urgent', 'high', 'normal', 'low'].map(p => <option key={p} value={p}>{p}</option>)}
        </select>
      </div>

      {tickets.length === 0 ? (
        <Card className="p-12 text-center">
          <MessageSquare size={28} className="text-slate-300 mx-auto mb-3" />
          <p className="text-slate-400 text-sm font-medium">No tickets found</p>
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full">
              <thead>
                <tr>
                  <Th>ID</Th>
                  <Th>Subject</Th>
                  <Th>Status</Th>
                  <Th>Priority</Th>
                  <Th>Messages</Th>
                  <Th>Created</Th>
                  <Th right> </Th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {tickets.map(t => <TicketRow key={t._id} ticket={t} />)}
              </tbody>
            </table>
          </div>
          {data?.totalPages > 1 && (
            <div className="px-4 py-3 border-t border-slate-100">
              <Pagination page={page} totalPages={data.totalPages} onChange={setPage} />
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
