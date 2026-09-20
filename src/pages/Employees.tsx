import { useEffect, useState, useMemo } from 'react';
import { Plus, Search, Mail, Eye, Shield } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { logActivity } from '@/lib/activity';
import { formatDate, formatDateTime } from '@/lib/utils';
import Modal from '@/components/Modal';
import Badge from '@/components/Badge';
import { TableSkeleton } from '@/components/LoadingSpinner';
import EmptyState from '@/components/EmptyState';
import { toast } from '@/components/Toast';
import { ASSIGNABLE_ROLES, ROLE_LABELS } from '@/lib/roles';
import { inviteTeammate, sendWelcomeEmail } from '@/lib/team';
import { useTenant } from '@/context/TenantContext';
import type { Profile, ActivityLog } from '@/lib/supabase';
import type { UserRole } from '@/lib/supabase';

export default function Employees() {
  const [employees, setEmployees] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showActivity, setShowActivity] = useState<Profile | null>(null);
  const [employeeActivity, setEmployeeActivity] = useState<ActivityLog[]>([]);
  const [editRole, setEditRole] = useState<string | null>(null);
  const [editRoleValue, setEditRoleValue] = useState('');
  const [form, setForm] = useState({ name: '', email: '', role: 'sales' as UserRole, password: '' });
  const { refresh: refreshTenant } = useTenant();

  const fetchEmployees = async () => {
    setLoading(true);
    const { data, error } = await supabase.from('profiles').select('*').order('created_at', { ascending: false });
    if (!error) setEmployees((data || []) as Profile[]);
    setLoading(false);
  };

  useEffect(() => { fetchEmployees(); }, []);

  const filtered = useMemo(() => {
    return employees.filter((e) => {
      if (search) {
        const q = search.toLowerCase();
        if (!e.name.toLowerCase().includes(q) && !e.email.toLowerCase().includes(q)) return false;
      }
      return true;
    });
  }, [employees, search]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error, reusedExistingAccount } = await inviteTeammate({
      email: form.email.trim(),
      name: form.name.trim(),
      role: form.role,
      password: form.password,
    });
    if (error) { toast('error', error); return; }
    const emailed = await sendWelcomeEmail(form.email.trim(), form.name.trim(), form.password);
    await logActivity('added team member', form.name);
    if (emailed) {
      toast('success', reusedExistingAccount ? 'Team member added to this business.' : 'Team member added. Welcome email sent.');
    } else {
      toast('info', 'Team member added, but the welcome email could not be sent. Share the password directly instead.');
    }
    setShowAdd(false);
    setForm({ name: '', email: '', role: 'sales', password: '' });
    await Promise.all([fetchEmployees(), refreshTenant()]);
  };

  const updateRole = async (id: string, role: string) => {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', id);
    if (error) { toast('error', 'Failed to update role'); return; }
    await logActivity('updated employee role', role, id);
    toast('success', 'Role updated');
    setEditRole(null);
    fetchEmployees();
  };

  const updateStatus = async (emp: Profile) => {
    const newStatus = emp.status === 'active' ? 'inactive' : 'active';
    const { error } = await supabase.from('profiles').update({ status: newStatus }).eq('id', emp.id);
    if (error) { toast('error', 'Failed to update status'); return; }
    await logActivity('updated employee status', newStatus, emp.id);
    toast('success', 'Status updated');
    fetchEmployees();
  };

  const openActivity = async (emp: Profile) => {
    setShowActivity(emp);
    const { data } = await supabase
      .from('activity_logs')
      .select('*')
      .eq('user_id', emp.id)
      .order('created_at', { ascending: false })
      .limit(50);
    setEmployeeActivity((data || []) as ActivityLog[]);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">Employees</h1>
          <p className="text-sm text-gray-500 mt-1">{filtered.length} team members</p>
        </div>
        <button onClick={() => setShowAdd(true)} className="btn-primary"><Plus className="w-4 h-4" /> Add New Employee</button>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name or email..." className="input pl-10" />
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {loading ? (
          <div className="p-4"><TableSkeleton /></div>
        ) : filtered.length === 0 ? (
          <EmptyState message="No employees found" subMessage="Add a new team member to get started" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-primary-800">
                  <th className="px-4 py-3 font-medium">Employee Name</th>
                  <th className="px-4 py-3 font-medium">Email</th>
                  <th className="px-4 py-3 font-medium">Role</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Last Login</th>
                  <th className="px-4 py-3 font-medium">Date Added</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((emp) => (
                  <tr key={emp.id} className="table-row">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-accent-500/15 flex items-center justify-center text-accent-400 text-xs font-semibold">{emp.name.charAt(0).toUpperCase()}</div>
                        <span className="font-medium text-white text-sm">{emp.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-400">{emp.email}</td>
                    <td className="px-4 py-3">
                      {editRole === emp.id ? (
                        <select
                          value={editRoleValue}
                          onChange={(e) => setEditRoleValue(e.target.value)}
                          onBlur={() => updateRole(emp.id, editRoleValue)}
                          className="select text-xs py-1.5 w-auto"
                          autoFocus
                        >
                          {ASSIGNABLE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                        </select>
                      ) : (
                        <button
                          onClick={() => { setEditRole(emp.id); setEditRoleValue(emp.role); }}
                          className="text-sm text-gray-300 hover:text-accent-400 transition-colors flex items-center gap-1"
                        >
                          <Shield className="w-3.5 h-3.5" />
                          {ROLE_LABELS[emp.role] || emp.role}
                        </button>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => updateStatus(emp)}>
                        <Badge variant={emp.status === 'active' ? 'success' : 'neutral'}>{emp.status}</Badge>
                      </button>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDateTime(emp.last_login)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(emp.created_at)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1">
                        <button onClick={() => openActivity(emp)} className="p-1.5 rounded-lg text-gray-400 hover:text-accent-400 hover:bg-accent-500/10 transition-colors" title="View Activity"><Eye className="w-4 h-4" /></button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Employee Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add New Employee" size="md">
        <form onSubmit={handleAdd} className="space-y-4">
          <div className="card p-3 bg-blue-500/5 border-blue-500/20 flex items-start gap-2">
            <Mail className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
            <p className="text-xs text-gray-400">A welcome email with login credentials will be sent automatically to the employee's email address.</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Employee Name *</label>
            <input type="text" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="Full name" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Email *</label>
            <input type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="input" placeholder="name@example.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Password *</label>
            <input type="text" required minLength={6} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} className="input" placeholder="Temporary password" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Role</label>
            <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })} className="select">
              {ASSIGNABLE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label} — {r.summary}</option>)}
            </select>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setShowAdd(false)} className="btn-ghost">Cancel</button>
            <button type="submit" className="btn-primary"><Plus className="w-4 h-4" /> Add Employee</button>
          </div>
        </form>
      </Modal>

      {/* Activity Log Modal */}
      <Modal open={!!showActivity} onClose={() => setShowActivity(null)} title={`Activity Log — ${showActivity?.name || ''}`} size="lg">
        {showActivity && (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="card p-3"><p className="text-xs text-gray-500">Email</p><p className="text-white">{showActivity.email}</p></div>
              <div className="card p-3"><p className="text-xs text-gray-500">Role</p><p className="text-white">{ROLE_LABELS[showActivity.role]}</p></div>
              <div className="card p-3"><p className="text-xs text-gray-500">Last Login</p><p className="text-white">{formatDateTime(showActivity.last_login)}</p></div>
              <div className="card p-3"><p className="text-xs text-gray-500">Status</p><Badge variant={showActivity.status === 'active' ? 'success' : 'neutral'}>{showActivity.status}</Badge></div>
            </div>
            <div>
              <h4 className="text-sm font-semibold text-white mb-3">All Actions</h4>
              {employeeActivity.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">No activity recorded</p>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto">
                  {employeeActivity.map((a) => (
                    <div key={a.id} className="flex items-center justify-between px-3 py-2 rounded-lg bg-primary-950/50 text-sm">
                      <div>
                        <span className="text-gray-300">{a.action}</span>
                        {a.target && <span className="text-gray-500"> — {a.target}</span>}
                      </div>
                      <span className="text-xs text-gray-600">{formatDateTime(a.created_at)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}
