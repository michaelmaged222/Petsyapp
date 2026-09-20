import { useState, useEffect } from 'react';
import { Building2, Palette, Users, Plus, Trash2, Mail, Crown, Shield, Check } from 'lucide-react';
import { useTenant } from '@/context/TenantContext';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/components/Toast';
import Modal from '@/components/Modal';
import Badge from '@/components/Badge';
import type { UserRole, TenantSettings } from '@/lib/supabase';
import { supabase } from '@/lib/supabase';

const ROLES: { key: UserRole; label: string }[] = [
  { key: 'owner', label: 'Owner' },
  { key: 'admin', label: 'Admin' },
  { key: 'sales', label: 'Sales' },
  { key: 'marketing', label: 'Marketing' },
  { key: 'tax_viewer', label: 'Tax Viewer' },
];

const PRESET_COLORS = [
  { name: 'Slate', primary: '#0f172a', accent: '#0ea5e9' },
  { name: 'Forest', primary: '#14241d', accent: '#10b981' },
  { name: 'Sunset', primary: '#1c1410', accent: '#f59e0b' },
  { name: 'Ocean', primary: '#0c1933', accent: '#3b82f6' },
  { name: 'Rose', primary: '#1d1018', accent: '#ec4899' },
  { name: 'Amber', primary: '#1a1606', accent: '#eab308' },
];

export default function TenantManagement() {
  const { tenant, settings, members, refresh, updateSettings, inviteMember, updateMemberRole, removeMember, maxEmployees } = useTenant();
  const { user } = useAuth();
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('sales');
  const [brandingForm, setBrandingForm] = useState<Partial<TenantSettings>>({});
  const [savingBranding, setSavingBranding] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    if (settings) {
      setBrandingForm({
        business_name: settings.business_name,
        logo_url: settings.logo_url,
        primary_color: settings.primary_color,
        accent_color: settings.accent_color,
        contact_email: settings.contact_email,
        contact_phone: settings.contact_phone,
        address: settings.address,
        currency: settings.currency,
      });
    }
  }, [settings]);

  const handleSaveBranding = async () => {
    setSavingBranding(true);
    const ok = await updateSettings(brandingForm);
    setSavingBranding(false);
    toast(ok ? 'success' : 'error', ok ? 'Branding updated' : 'Failed to update branding');
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !tenant) return;
    setUploadingLogo(true);
    const ext = file.name.split('.').pop();
    const path = `${tenant.id}/logo.${ext}`;
    const { error: upErr } = await supabase.storage.from('contract-assets').upload(path, file, { upsert: true });
    if (upErr) { toast('error', 'Upload failed'); setUploadingLogo(false); return; }
    const { data: { publicUrl } } = supabase.storage.from('contract-assets').getPublicUrl(path);
    setBrandingForm((prev) => ({ ...prev, logo_url: publicUrl }));
    await updateSettings({ logo_url: publicUrl });
    setUploadingLogo(false);
    toast('success', 'Logo updated');
  };

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim()) return;
    const { error } = await inviteMember(inviteEmail.trim(), inviteRole);
    if (error) { toast('error', error); return; }
    toast('success', 'Team member invited');
    setShowInvite(false); setInviteEmail(''); setInviteRole('sales');
    refresh();
  };

  const handleRemove = async (memberId: string, memberName: string) => {
    if (!confirm(`Remove ${memberName} from this workspace?`)) return;
    const ok = await removeMember(memberId);
    toast(ok ? 'success' : 'error', ok ? 'Member removed' : 'Failed to remove member');
  };

  if (!tenant) return <div className="p-6 text-gray-500">Loading workspace...</div>;

  const memberCount = members.length;
  const isOwner = user?.role === 'owner' || members.find((m) => m.user_id === user?.id)?.role === 'owner';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Building2 className="w-7 h-7 text-accent-400" />
          Workspace Management
        </h1>
        <p className="text-sm text-gray-500 mt-1">Manage your team, branding, and workspace settings</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-5">
          <p className="text-xs uppercase tracking-wider text-gray-500">Workspace Name</p>
          <p className="text-lg font-bold text-white mt-2">{tenant.name}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs uppercase tracking-wider text-gray-500">Plan</p>
          <p className="text-lg font-bold text-accent-400 mt-2 capitalize">{tenant.plan_tier}</p>
        </div>
        <div className="card p-5">
          <p className="text-xs uppercase tracking-wider text-gray-500">Team Seats</p>
          <p className="text-lg font-bold text-white mt-2">{memberCount} / {maxEmployees === 999 ? 'Unlimited' : maxEmployees}</p>
        </div>
      </div>

      {/* Team Management */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-accent-400" />
            Team Members
          </h2>
          {isOwner && memberCount < maxEmployees && (
            <button onClick={() => setShowInvite(true)} className="btn-primary text-sm">
              <Plus className="w-4 h-4" /> Invite Member
            </button>
          )}
        </div>
        <div className="space-y-2">
          {members.map((member) => {
            const isThisOwner = member.role === 'owner';
            const isSelf = member.user_id === user?.id;
            return (
              <div key={member.id} className="flex items-center gap-3 rounded-lg border border-primary-800 bg-primary-950/40 p-3">
                <div className="w-10 h-10 rounded-full bg-accent-500/20 flex items-center justify-center text-accent-400 font-semibold shrink-0">
                  {(member.user_id === user?.id ? user?.name : 'U').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">
                      {isSelf ? user?.name : `User ${member.user_id.slice(0, 8)}`}
                    </span>
                    {isThisOwner && <Crown className="w-3.5 h-3.5 text-amber-400" />}
                    {isSelf && <Badge variant="info">You</Badge>}
                  </div>
                  <p className="text-xs text-gray-500">Added {new Date(member.created_at).toLocaleDateString('en-GB')}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {isThisOwner ? (
                    <Badge variant="warning">Owner</Badge>
                  ) : isOwner ? (
                    <>
                      <select
                        value={member.role}
                        onChange={(e) => updateMemberRole(member.id, e.target.value as UserRole)}
                        className="select text-sm py-1.5"
                      >
                        {ROLES.filter((r) => r.key !== 'owner').map((r) => (
                          <option key={r.key} value={r.key}>{r.label}</option>
                        ))}
                      </select>
                      {!isSelf && (
                        <button onClick={() => handleRemove(member.id, 'this member')} className="p-1.5 rounded-lg text-gray-500 hover:text-error-400 hover:bg-error-500/10 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </>
                  ) : (
                    <Badge variant="neutral">{member.role}</Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Branding */}
      <div className="card p-5">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2 mb-4">
          <Palette className="w-5 h-5 text-accent-400" />
          Branding & Identity
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Business Name</label>
            <input type="text" value={brandingForm.business_name || ''} onChange={(e) => setBrandingForm({ ...brandingForm, business_name: e.target.value })} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Currency</label>
            <select value={brandingForm.currency || 'AED'} onChange={(e) => setBrandingForm({ ...brandingForm, currency: e.target.value })} className="select">
              <option value="AED">AED</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
              <option value="EGP">EGP</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Contact Email</label>
            <input type="email" value={brandingForm.contact_email || ''} onChange={(e) => setBrandingForm({ ...brandingForm, contact_email: e.target.value })} className="input" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Contact Phone</label>
            <input type="text" value={brandingForm.contact_phone || ''} onChange={(e) => setBrandingForm({ ...brandingForm, contact_phone: e.target.value })} className="input" />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Address</label>
            <input type="text" value={brandingForm.address || ''} onChange={(e) => setBrandingForm({ ...brandingForm, address: e.target.value })} className="input" />
          </div>
        </div>

        {/* Logo Upload */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-400 mb-1.5">Logo</label>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-xl bg-primary-800 border border-primary-700 flex items-center justify-center overflow-hidden shrink-0">
              {brandingForm.logo_url ? (
                <img src={brandingForm.logo_url} alt="Logo" className="w-full h-full object-cover" />
              ) : (
                <Building2 className="w-6 h-6 text-gray-600" />
              )}
            </div>
            <label className="btn-ghost text-sm cursor-pointer">
              {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
              <input type="file" accept="image/*" onChange={handleLogoUpload} className="hidden" disabled={uploadingLogo} />
            </label>
          </div>
        </div>

        {/* Color Presets */}
        <div className="mt-4">
          <label className="block text-sm font-medium text-gray-400 mb-2">Theme Colors</label>
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
            {PRESET_COLORS.map((preset) => {
              const selected = brandingForm.primary_color === preset.primary && brandingForm.accent_color === preset.accent;
              return (
                <button
                  key={preset.name}
                  onClick={() => setBrandingForm({ ...brandingForm, primary_color: preset.primary, accent_color: preset.accent })}
                  className={`relative rounded-lg p-3 border-2 transition-all ${selected ? 'border-accent-400' : 'border-primary-800 hover:border-primary-600'}`}
                  style={{ background: preset.primary }}
                >
                  <div className="w-full h-6 rounded" style={{ background: preset.accent }} />
                  <p className="text-xs text-gray-400 mt-1.5">{preset.name}</p>
                  {selected && <Check className="absolute top-1 right-1 w-3.5 h-3.5 text-accent-400" />}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <button onClick={handleSaveBranding} disabled={savingBranding} className="btn-primary text-sm">
            <Shield className="w-4 h-4" /> {savingBranding ? 'Saving...' : 'Save Branding'}
          </button>
        </div>
      </div>

      <Modal open={showInvite} onClose={() => setShowInvite(false)} title="Invite Team Member" size="md">
        <form onSubmit={handleInvite} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Email Address</label>
            <input type="email" required value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} className="input" placeholder="colleague@business.com" />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-400 mb-1.5">Role</label>
            <select value={inviteRole} onChange={(e) => setInviteRole(e.target.value as UserRole)} className="select">
              {ROLES.filter((r) => r.key !== 'owner').map((r) => (
                <option key={r.key} value={r.key}>{r.label}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-primary-950/50 rounded-lg p-3">
            <Mail className="w-4 h-4 shrink-0" />
            <span>If they already have an account, they'll be added immediately. Otherwise, an invitation will be sent.</span>
          </div>
          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowInvite(false)} className="btn-ghost">Cancel</button>
            <button type="submit" className="btn-primary">Send Invite</button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
