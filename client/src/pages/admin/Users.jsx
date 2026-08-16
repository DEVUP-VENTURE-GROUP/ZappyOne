import { useState } from 'react';
import {
  useAdminListUsersQuery,
  useAdminGetUserQuery,
  useAdminBlockUserMutation,
} from '../../services/api';
import {
  Search, ShieldOff, ShieldCheck, Users as UsersIcon,
  X, Phone, Mail, Star, Calendar, Package, AlertTriangle,
  ChevronRight, MapPin,
} from 'lucide-react';
import {
  SectionHeader, Pagination, StatusBadge, Card, Th, Td,
  PageLoader, EmptyState, fmtDate,
} from './_shared';
import toast from 'react-hot-toast';

/**
 * Best-known location for a user, as a readable address — never raw
 * coordinates. Prefers the most recently used location (by `usedAt`) over
 * saved addresses, since it reflects where the customer actually was, not
 * just a label they saved once; falls back to their default saved address.
 */
function bestKnownLocation(u) {
  const recents = u?.recentLocations || [];
  const latestRecent = [...recents]
    .filter((r) => r.address)
    .sort((a, b) => new Date(b.usedAt || 0) - new Date(a.usedAt || 0))[0];
  if (latestRecent) return { address: latestRecent.address, when: latestRecent.usedAt };

  const saved = u?.savedAddresses || [];
  const defaultSaved = saved.find((a) => a.isDefault && a.address) || saved.find((a) => a.address);
  if (defaultSaved) return { address: defaultSaved.address, when: null };

  return null;
}

/* ─── User detail drawer ────────────────────────────────────────────────── */
function UserDrawer({ userId, onClose, onBlock }) {
  const { data, isFetching } = useAdminGetUserQuery(userId, { skip: !userId });
  const u = data?.user;
  const orders = data?.orders || [];
  const location = bestKnownLocation(u);

  const statusColor = {
    completed: 'bg-green-100 text-green-700',
    cancelled:  'bg-red-100  text-red-600',
    pending:    'bg-yellow-100 text-yellow-700',
    assigned:   'bg-blue-100  text-blue-700',
    in_progress:'bg-indigo-100 text-indigo-700',
  };

  return (
    <div className="fixed inset-0 z-50 flex">
      {/* backdrop */}
      <div className="flex-1 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* panel */}
      <div className="w-full max-w-md bg-white shadow-2xl flex flex-col overflow-hidden">
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-base font-bold text-slate-800">User Details</h2>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition">
            <X size={16} className="text-slate-500" />
          </button>
        </div>

        {isFetching && !u && (
          <div className="flex-1 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {u && (
          <div className="flex-1 overflow-y-auto">
            {/* profile card */}
            <div className="px-5 py-5 border-b border-slate-100">
              <div className="flex items-start gap-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white text-xl font-black shrink-0">
                  {(u.name || u.phone || '?')[0].toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 text-lg leading-tight truncate">{u.name || '—'}</p>
                  <div className="mt-1 space-y-0.5">
                    <div className="flex items-center gap-1.5 text-sm text-slate-500">
                      <Phone size={12} />{u.phone}
                    </div>
                    {u.email && (
                      <div className="flex items-center gap-1.5 text-sm text-slate-500">
                        <Mail size={12} />{u.email}
                      </div>
                    )}
                    {location ? (
                      <div className="flex items-start gap-1.5 text-sm text-slate-500">
                        <MapPin size={12} className="mt-0.5 shrink-0" />
                        <span className="truncate">
                          {location.address}
                          {location.when && (
                            <span className="text-slate-400"> · seen {fmtDate(location.when)}</span>
                          )}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5 text-sm text-slate-400">
                        <MapPin size={12} />No location on record
                      </div>
                    )}
                  </div>
                </div>
                <StatusBadge status={u.isBlocked ? 'blocked' : 'online'} />
              </div>

              <div className="grid grid-cols-3 gap-3 mt-4">
                <Stat label="Rating" value={`${u.rating?.toFixed(1) || '5.0'} ★`} />
                <Stat label="Orders" value={u.totalOrders ?? orders.length} />
                <Stat label="Joined" value={fmtDate(u.createdAt)} small />
              </div>
            </div>

            {/* recent bookings */}
            <div className="px-5 py-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
                Recent Bookings {orders.length > 0 && `(${orders.length})`}
              </p>
              {orders.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-6">No bookings yet</p>
              ) : (
                <div className="space-y-2">
                  {orders.map((o) => (
                    <div key={o._id} className="flex items-center justify-between bg-slate-50 rounded-xl px-3 py-2.5">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-slate-800 capitalize truncate">
                          {(o.service || '').replace(/_/g, ' ')}
                        </p>
                        <p className="text-xs text-slate-400 mt-0.5">{fmtDate(o.createdAt)}</p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        {o.totalPaise > 0 && (
                          <span className="text-sm font-bold text-slate-700">₹{Math.round(o.totalPaise / 100)}</span>
                        )}
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${statusColor[o.status] || 'bg-slate-100 text-slate-600'}`}>
                          {o.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* block / unblock action */}
        {u && (
          <div className="px-5 py-4 border-t border-slate-100">
            <button
              onClick={() => onBlock(u)}
              className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold transition ${
                u.isBlocked
                  ? 'bg-green-50 text-green-700 hover:bg-green-100'
                  : 'bg-red-50 text-red-600 hover:bg-red-100'
              }`}
            >
              {u.isBlocked ? <><ShieldCheck size={14} /> Unblock User</> : <><ShieldOff size={14} /> Block User</>}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, small }) {
  return (
    <div className="bg-slate-50 rounded-xl px-3 py-2 text-center">
      <p className={`font-bold text-slate-800 ${small ? 'text-xs' : 'text-sm'}`}>{value}</p>
      <p className="text-[10px] text-slate-400 mt-0.5">{label}</p>
    </div>
  );
}

/* ─── Block confirm dialog ──────────────────────────────────────────────── */
function BlockConfirm({ user, onConfirm, onCancel, loading }) {
  const blocking = !user.isBlocked;
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4 ${blocking ? 'bg-red-100' : 'bg-green-100'}`}>
          <AlertTriangle size={22} className={blocking ? 'text-red-500' : 'text-green-600'} />
        </div>
        <h3 className="text-center font-bold text-slate-900 text-lg">
          {blocking ? 'Block this user?' : 'Unblock this user?'}
        </h3>
        <p className="text-center text-sm text-slate-500 mt-1 mb-5">
          {blocking
            ? `${user.name || user.phone} will be prevented from placing any new orders.`
            : `${user.name || user.phone} will regain full access to the platform.`}
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={loading}
            className={`flex-1 py-2.5 rounded-xl text-sm font-bold text-white transition disabled:opacity-60 ${
              blocking ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
            }`}
          >
            {loading ? 'Please wait…' : blocking ? 'Yes, Block' : 'Yes, Unblock'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─── Main ──────────────────────────────────────────────────────────────── */
export default function Users() {
  const [q, setQ] = useState('');
  const [blocked, setBlocked] = useState('');
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState(null);
  const [confirmUser, setConfirmUser] = useState(null);
  const [blockingId, setBlockingId] = useState(null);

  const { data, isFetching, refetch } = useAdminListUsersQuery({ q: q || undefined, blocked: blocked || undefined, page });
  const [blockUser] = useAdminBlockUserMutation();

  async function doBlock(u) {
    setBlockingId(u._id);
    try {
      await blockUser({ id: u._id, blocked: !u.isBlocked }).unwrap();
      toast.success(u.isBlocked ? 'User unblocked' : 'User blocked');
      setConfirmUser(null);
      refetch();
    } catch (err) {
      toast.error(err.data?.error || 'Action failed');
    } finally {
      setBlockingId(null);
    }
  }

  return (
    <div className="space-y-4">
      <SectionHeader title="Users" subtitle={data?.total != null ? `${data.total} registered` : ''} />

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            className="w-full bg-white border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition"
            placeholder="Search name or phone…"
            value={q}
            onChange={(e) => { setQ(e.target.value); setPage(1); }}
          />
        </div>
        <select
          className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500 transition"
          value={blocked}
          onChange={(e) => { setBlocked(e.target.value); setPage(1); }}
        >
          <option value="">All users</option>
          <option value="false">Active only</option>
          <option value="true">Blocked only</option>
        </select>
      </div>

      <Card className="overflow-hidden">
        {isFetching && <div className="h-1 bg-blue-600 animate-pulse" />}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-slate-100">
                <Th>Name</Th><Th>Phone</Th><Th>Email</Th><Th>Rating</Th><Th>Status</Th><Th>Joined</Th><Th></Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {data?.users?.map((u) => (
                <tr
                  key={u._id}
                  onClick={() => setSelectedId(u._id)}
                  className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                >
                  <Td><span className="font-semibold text-slate-900">{u.name || '—'}</span></Td>
                  <Td muted>{u.phone}</Td>
                  <Td muted>{u.email || '—'}</Td>
                  <Td><span className="font-semibold">{u.rating?.toFixed(1) || '5.0'} ★</span></Td>
                  <Td><StatusBadge status={u.isBlocked ? 'blocked' : 'online'} /></Td>
                  <Td muted>{fmtDate(u.createdAt)}</Td>
                  <Td>
                    <ChevronRight size={14} className="text-slate-300" />
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.users?.length && !isFetching && <EmptyState message="No users found" icon={UsersIcon} />}
        </div>
        <div className="px-4 py-3 border-t border-slate-100">
          <Pagination page={page} total={data?.total} onPrev={() => setPage(p => p - 1)} onNext={() => setPage(p => p + 1)} />
        </div>
      </Card>

      {/* User detail drawer */}
      {selectedId && (
        <UserDrawer
          userId={selectedId}
          onClose={() => setSelectedId(null)}
          onBlock={(u) => { setConfirmUser(u); }}
        />
      )}

      {/* Block confirmation dialog */}
      {confirmUser && (
        <BlockConfirm
          user={confirmUser}
          loading={blockingId === confirmUser._id}
          onConfirm={() => doBlock(confirmUser)}
          onCancel={() => setConfirmUser(null)}
        />
      )}
    </div>
  );
}
