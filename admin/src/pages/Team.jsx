import { useState } from 'react';
import toast from 'react-hot-toast';
import { UserPlus, X } from 'lucide-react';
import {
  useAdminTeamQuery, useAdminRolesQuery, useAdminMeQuery, useAdminCreateAdminMutation, useAdminUpdateAdminMutation,
} from '@shared/services/api';
import { SectionHeader, Card, Th, Td, PageLoader, StatusBadge, fmtDate } from './_shared';

const splitList = (v) => v.split(',').map((x) => x.trim()).filter(Boolean);

/**
 * The admin team. Roles decide which areas each person can open; scope limits
 * a person to certain markets or cities (a city manager sees only theirs).
 * The server refuses self-demotion and removing the last super admin.
 */
export default function Team() {
  const { data, isLoading } = useAdminTeamQuery();
  const { data: rolesData } = useAdminRolesQuery();
  const { data: me } = useAdminMeQuery();
  const [update, { isLoading: saving }] = useAdminUpdateAdminMutation();
  const [creating, setCreating] = useState(false);

  if (isLoading) return <PageLoader />;
  const roles = rolesData?.roles || [];
  const roleLabel = (id) => roles.find((r) => r.id === id)?.label || id;

  async function change(admin, patch, message) {
    try {
      await update({ id: admin.id, ...patch }).unwrap();
      toast.success(message);
    } catch (err) { toast.error(err?.data?.error || 'Could not update'); }
  }

  return (
    <div className="space-y-5">
      <SectionHeader title="Admin team" subtitle="Who can open what in this console">
        <button type="button" onClick={() => setCreating(true)}
          className="flex items-center gap-1.5 text-sm font-semibold bg-slate-900 text-white px-3 py-2 rounded-lg">
          <UserPlus size={14} /> Add admin
        </button>
      </SectionHeader>

      <Card className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr><Th>Name</Th><Th>Role</Th><Th>Scope</Th><Th>Last sign-in</Th><Th>Status</Th><Th /></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {(data?.admins || []).map((a) => {
              const self = me?.admin?.id === a.id;
              const scope = [...(a.scope?.markets || []), ...(a.scope?.cities || [])];
              return (
                <tr key={a.id}>
                  <Td>{a.name}{self && <span className="ml-1 text-[11px] text-slate-400">(you)</span>}<span className="block text-[11px] text-slate-400">{a.email}</span></Td>
                  <Td>
                    <select value={a.role} disabled={self || saving} aria-label={`Role for ${a.name}`}
                      onChange={(e) => change(a, { role: e.target.value }, `${a.name} is now ${roleLabel(e.target.value)}`)}
                      className="text-xs border border-slate-200 rounded-lg px-2 py-1">
                      {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                    </select>
                  </Td>
                  <Td muted>{scope.length ? scope.join(', ') : 'Everywhere'}</Td>
                  <Td muted>{a.lastLoginAt ? fmtDate(a.lastLoginAt) : 'Never'}</Td>
                  <Td><StatusBadge status={a.isActive ? 'approved' : 'blocked'} /></Td>
                  <Td>
                    {!self && (
                      <button type="button" disabled={saving}
                        onClick={() => {
                          if (a.isActive && !window.confirm(`Deactivate ${a.name}? They are signed out within 30 seconds.`)) return;
                          change(a, { isActive: !a.isActive }, a.isActive ? `${a.name} deactivated` : `${a.name} reactivated`);
                        }}
                        className="text-xs font-semibold text-slate-600 hover:text-slate-900">
                        {a.isActive ? 'Deactivate' : 'Reactivate'}
                      </button>
                    )}
                  </Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      {creating && <CreateAdmin roles={roles} onClose={() => setCreating(false)} />}
    </div>
  );
}

function CreateAdmin({ roles, onClose }) {
  const [create, { isLoading }] = useAdminCreateAdminMutation();
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'ops', markets: '', cities: '' });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const valid = form.name.trim().length >= 2 && /\S+@\S+\.\S+/.test(form.email) && form.password.length >= 12;

  async function submit(e) {
    e.preventDefault();
    try {
      await create({
        name: form.name.trim(), email: form.email.trim(), password: form.password, role: form.role,
        scope: { markets: splitList(form.markets).map((m) => m.toUpperCase()), cities: splitList(form.cities) },
      }).unwrap();
      toast.success('Admin added. Share the password with them securely.');
      onClose();
    } catch (err) { toast.error(err?.data?.error || err?.data?.details?.[0] || 'Could not add the admin'); }
  }

  const field = 'w-full border border-slate-200 rounded-lg px-3 py-2 text-sm';
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <form onSubmit={submit} className="bg-white rounded-2xl w-full max-w-md p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-bold text-slate-900">Add an admin</h3>
          <button type="button" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <input className={field} placeholder="Full name" value={form.name} onChange={set('name')} />
        <input className={field} placeholder="Work email" type="email" value={form.email} onChange={set('email')} />
        <input className={field} placeholder="Temporary password (12+ characters)" type="password" value={form.password} onChange={set('password')} autoComplete="new-password" />
        <select className={field} value={form.role} onChange={set('role')} aria-label="Role">
          {roles.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        <input className={field} placeholder="Markets, e.g. IN (empty = all)" value={form.markets} onChange={set('markets')} />
        <input className={field} placeholder="Cities, e.g. Hyderabad (empty = all)" value={form.cities} onChange={set('cities')} />
        <button type="submit" disabled={!valid || isLoading} className="w-full bg-slate-900 text-white font-bold py-2.5 rounded-xl disabled:opacity-50">
          {isLoading ? 'Adding…' : 'Add admin'}
        </button>
      </form>
    </div>
  );
}
