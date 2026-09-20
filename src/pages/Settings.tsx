import { useEffect, useState } from 'react';
import { Bell, Building2, Check, FileSignature, FileText, Image as ImageIcon, KeyRound, Mail, MessageCircle, Save, Settings2, ShieldCheck, Stamp, Trash2, Upload, UserRound, Webhook, ExternalLink, Droplet, Signature, Sun, Moon, Check as CheckIcon, Calendar, ToggleLeft } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { toast } from '@/components/Toast';
import { useFeatureToggles } from '@/lib/useFeatureToggles';
import { FEATURE_LIST } from '@/lib/features';
import type { ThemeMode } from '@/App';

type ImageUploadType = 'logo' | 'watermark' | 'signature' | 'stamp';
type UploadType = ImageUploadType | 'contract';
type TabKey = 'profile' | 'password' | 'appearance' | 'business' | 'features' | 'contract-fields' | 'signature' | 'note-types' | 'whatsapp' | 'email-stats' | 'push-notifications' | 'test-codes';

interface ContractSettings {
  seller_signature_url: string | null;
  seller_stamp_url: string | null;
  app_logo_url: string | null;
  watermark_url: string | null;
  company_contract_url: string | null;
  company_name: string;
  company_tagline: string;
  company_email: string;
}

interface TabDef {
  key: TabKey;
  label: string;
  icon: typeof UserRound;
}

const TABS: TabDef[] = [
  { key: 'profile', label: 'Profile', icon: UserRound },
  { key: 'password', label: 'Password', icon: KeyRound },
  { key: 'appearance', label: 'Appearance', icon: Sun },
  { key: 'business', label: 'Business', icon: Calendar },
  { key: 'features', label: 'Features', icon: ToggleLeft },
  { key: 'contract-fields', label: 'Contract Fields', icon: FileText },
  { key: 'signature', label: 'Signature', icon: Signature },
  { key: 'note-types', label: 'Note Types', icon: FileSignature },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle },
  { key: 'email-stats', label: 'Email Stats', icon: Mail },
  { key: 'push-notifications', label: 'Push Notifications', icon: Bell },
  { key: 'test-codes', label: 'Test Codes', icon: Webhook },
];

const FIELD_MAP: Record<UploadType, keyof ContractSettings> = {
  logo: 'app_logo_url',
  watermark: 'watermark_url',
  signature: 'seller_signature_url',
  stamp: 'seller_stamp_url',
  contract: 'company_contract_url',
};

const FIELD_META: Record<UploadType, { label: string; icon: typeof Signature; description: string; hint: string; accept: string }> = {
  stamp: { label: 'Company Stamp', icon: Stamp, description: 'Official company stamp placed over the seller signature on every contract.', hint: 'Use a transparent PNG for best results.', accept: 'image/png,image/jpeg,image/webp' },
  signature: { label: 'Company Signature', icon: Signature, description: 'Authorized handwritten signature shown in the Seller signature area.', hint: 'Scan or photograph your signature, then use a transparent PNG.', accept: 'image/png,image/jpeg,image/webp' },
  logo: { label: 'Company Logo', icon: ImageIcon, description: 'Your company logo shown on the app sidebar, login screen, and the header of every generated contract.', hint: 'Square or wide transparent PNG works best.', accept: 'image/png,image/jpeg,image/webp' },
  watermark: { label: 'Watermark', icon: Droplet, description: 'Faint image centered behind every page of the contract.', hint: 'A light, simple logo or emblem works best.', accept: 'image/png,image/jpeg,image/webp' },
  contract: { label: 'Company Contract', icon: FileSignature, description: 'Your master company contract document kept on file for reference and compliance.', hint: 'Upload a PDF file.', accept: 'application/pdf' },
};

const UPLOAD_ORDER: UploadType[] = ['contract', 'stamp', 'signature', 'logo', 'watermark'];
const IMAGE_TYPES: UploadType[] = ['logo', 'watermark', 'signature', 'stamp'];

function ComingSoon({ icon: Icon, title, description }: { icon: typeof Settings2; title: string; description: string }) {
  return (
    <div className="card p-6">
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-accent-500/10 border border-accent-500/20 flex items-center justify-center">
          <Icon className="w-5 h-5 text-accent-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <p className="text-xs text-accent-400">Ready to configure</p>
        </div>
      </div>
      <p className="text-sm text-gray-400 mt-5">{description}</p>
      <div className="mt-6 rounded-lg border border-primary-800 bg-primary-950/40 p-4 text-sm text-gray-500">
        This section is prepared and will be connected to your saved settings next.
      </div>
    </div>
  );
}

interface SettingsProps {
  theme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
}

export default function Settings({ theme, onThemeChange }: SettingsProps) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>('profile');
  const [settings, setSettings] = useState<ContractSettings>({ seller_signature_url: null, seller_stamp_url: null, app_logo_url: null, watermark_url: null, company_contract_url: null, company_name: '', company_tagline: '', company_email: '' });
  const [uploading, setUploading] = useState<UploadType | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [companyTagline, setCompanyTagline] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [savingCompany, setSavingCompany] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profileName, setProfileName] = useState(user?.name || '');
  const [profileEmail, setProfileEmail] = useState(user?.email || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [cycleStartDay, setCycleStartDay] = useState(11);
  const [savingCycle, setSavingCycle] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('contract_settings').select('seller_signature_url, seller_stamp_url, app_logo_url, watermark_url, company_contract_url, company_name, company_tagline, company_email').eq('id', 1).maybeSingle();
      if (data) {
        const s = data as ContractSettings;
        setSettings(s);
        setCompanyName(s.company_name || '');
        setCompanyTagline(s.company_tagline || '');
        setCompanyEmail(s.company_email || '');
      }
      const { data: bizData } = await supabase.from('business_settings').select('*').eq('id', 1).maybeSingle();
      if (bizData) setCycleStartDay((bizData as { monthly_cycle_start_day: number }).monthly_cycle_start_day);
      setLoading(false);
    })();
  }, []);

  useEffect(() => {
    setProfileName(user?.name || '');
    setProfileEmail(user?.email || '');
  }, [user]);

  const saveProfile = async () => {
    if (!user || !profileName.trim() || !profileEmail.trim()) return;
    setSavingProfile(true);
    const { error } = await supabase.from('profiles').update({ name: profileName.trim(), email: profileEmail.trim() }).eq('id', user.id);
    setSavingProfile(false);
    if (error) { toast('error', 'Could not save your profile'); return; }
    toast('success', 'Profile saved successfully');
  };

  const savePassword = async () => {
    if (!currentPassword || newPassword.length < 6 || newPassword !== confirmPassword) {
      toast('error', newPassword !== confirmPassword ? 'New passwords do not match' : 'Use a new password with at least 6 characters');
      return;
    }
    setSavingPassword(true);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: profileEmail, password: currentPassword });
    if (signInError) { setSavingPassword(false); toast('error', 'Current password is incorrect'); return; }
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSavingPassword(false);
    if (error) { toast('error', 'Could not update your password'); return; }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    toast('success', 'Password updated successfully');
  };

  const handleUpload = async (file: File, type: UploadType) => {
    if (!file) return;
    const maxSize = type === 'contract' ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
    const allowedType = type === 'contract' ? file.type === 'application/pdf' : ['image/png', 'image/jpeg', 'image/webp'].includes(file.type);
    if (!allowedType) {
      toast('error', `Please choose a valid ${type === 'contract' ? 'PDF' : 'image'} file`);
      return;
    }
    if (file.size > maxSize) {
      toast('error', `File is too large. Maximum size is ${type === 'contract' ? '10 MB' : '5 MB'}`);
      return;
    }
    setUploading(type);
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const path = `${type}.${ext}`;
    const { error: upErr } = await supabase.storage.from('contract-assets').upload(path, file, { upsert: true, contentType: file.type, cacheControl: '0' });
    if (upErr) { toast('error', 'Failed to upload file'); setUploading(null); return; }
    const { data: pub } = supabase.storage.from('contract-assets').getPublicUrl(path);
    const url = `${pub.publicUrl}?v=${Date.now()}`;
    const field = FIELD_MAP[type];
    const { error: dbErr } = await supabase.from('contract_settings').upsert({ id: 1, [field]: url, updated_by: user?.id, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (dbErr) { toast('error', 'Failed to save settings'); setUploading(null); return; }
    setSettings((s) => ({ ...s, [field]: url }));
    toast('success', `${FIELD_META[type].label} uploaded successfully`);
    setUploading(null);
  };

  const handleRemove = async (type: UploadType) => {
    const field = FIELD_MAP[type];
    const { error } = await supabase.from('contract_settings').upsert({ id: 1, [field]: null, updated_by: user?.id, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) { toast('error', 'Failed to remove file'); return; }
    setSettings((s) => ({ ...s, [field]: null }));
    toast('success', `${FIELD_META[type].label} removed`);
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20"><span className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">Manage your account, contracts, communications, and notifications</p>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        <div className="lg:w-64 shrink-0">
          <nav className="flex lg:flex-col gap-1 overflow-x-auto lg:overflow-x-visible pb-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.key;
              return (
                <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all whitespace-nowrap ${active ? 'bg-accent-500/10 text-accent-400 border border-accent-500/20' : 'text-gray-400 hover:text-white hover:bg-primary-800/50 border border-transparent'}`}>
                  <Icon className="w-5 h-5 shrink-0" />
                  {tab.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="flex-1 min-w-0">
          {activeTab === 'profile' && (
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-1"><UserRound className="w-5 h-5 text-accent-400" /><h2 className="text-lg font-semibold text-white">Your Profile</h2></div>
              <p className="text-sm text-gray-500 mb-6">Update your personal information.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <label className="block"><span className="label">Full Name</span><input className="input mt-1.5" value={profileName} onChange={(e) => setProfileName(e.target.value)} /></label>
                <label className="block"><span className="label">Email</span><input type="email" className="input mt-1.5" value={profileEmail} onChange={(e) => setProfileEmail(e.target.value)} /></label>
              </div>
              <div className="flex items-center gap-2 mt-4 text-sm text-gray-400"><span>Role:</span><span className="badge">{user?.role || 'User'}</span></div>
              <button onClick={saveProfile} disabled={savingProfile} className="btn-primary mt-6"><Save className="w-4 h-4" />{savingProfile ? 'Saving...' : 'Save Changes'}</button>
            </div>
          )}

          {activeTab === 'password' && (
            <div className="card p-6 max-w-2xl">
              <div className="flex items-center gap-2 mb-1"><KeyRound className="w-5 h-5 text-accent-400" /><h2 className="text-lg font-semibold text-white">Change Password</h2></div>
              <p className="text-sm text-gray-500 mb-6">Keep your account secure with a strong password.</p>
              <div className="space-y-4">
                <label className="block"><span className="label">Current Password</span><input type="password" className="input mt-1.5" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></label>
                <label className="block"><span className="label">New Password</span><input type="password" className="input mt-1.5" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label>
                <label className="block"><span className="label">Confirm New Password</span><input type="password" className="input mt-1.5" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></label>
              </div>
              <button onClick={savePassword} disabled={savingPassword} className="btn-primary mt-6"><ShieldCheck className="w-4 h-4" />{savingPassword ? 'Updating...' : 'Update Password'}</button>
            </div>
          )}

          {activeTab === 'appearance' && (
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-1"><Sun className="w-5 h-5 text-accent-400" /><h2 className="text-lg font-semibold text-white">Appearance</h2></div>
              <p className="text-sm text-gray-500 mb-6">Choose how Puppyfy CRM looks. Pick a theme to preview it instantly.</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                {/* Night Preview */}
                <button
                  onClick={() => onThemeChange('night')}
                  className={`relative rounded-2xl overflow-hidden border-2 transition-all duration-200 text-left ${theme === 'night' ? 'border-brand-sage ring-2 ring-brand-sage/30' : 'border-primary-700 hover:border-primary-600'}`}
                >
                  {theme === 'night' && (
                    <div className="absolute top-3 right-3 z-10 w-6 h-6 rounded-full bg-brand-sage flex items-center justify-center">
                      <CheckIcon className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                  <div className="bg-primary-950 p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-sage to-secondary-600 flex items-center justify-center">
                        <Moon className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-white">Night</p>
                        <p className="text-xs text-gray-500">Default dark theme</p>
                      </div>
                    </div>
                    <div className="rounded-xl bg-primary-900/80 border border-primary-700/70 p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="h-2.5 w-20 rounded-full bg-primary-700" />
                        <div className="h-5 w-12 rounded-lg bg-brand-sage/20 border border-brand-sage/30" />
                      </div>
                      <div className="space-y-1.5">
                        <div className="h-2 w-full rounded-full bg-primary-800" />
                        <div className="h-2 w-3/4 rounded-full bg-primary-800" />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <div className="h-6 w-16 rounded-lg bg-brand-sage" />
                        <div className="h-6 w-16 rounded-lg bg-primary-700" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg bg-primary-900/80 border border-primary-700/70 p-2">
                        <div className="h-2 w-8 rounded-full bg-brand-sage/30 mb-1" />
                        <div className="h-3 w-full rounded-full bg-primary-700" />
                      </div>
                      <div className="rounded-lg bg-primary-900/80 border border-primary-700/70 p-2">
                        <div className="h-2 w-8 rounded-full bg-secondary-400/20 mb-1" />
                        <div className="h-3 w-full rounded-full bg-primary-700" />
                      </div>
                      <div className="rounded-lg bg-primary-900/80 border border-primary-700/70 p-2">
                        <div className="h-2 w-8 rounded-full bg-warning-500/20 mb-1" />
                        <div className="h-3 w-full rounded-full bg-primary-700" />
                      </div>
                    </div>
                  </div>
                  <div className="px-4 py-3 bg-primary-900/80 border-t border-primary-700/70 flex items-center gap-2">
                    <Moon className="w-4 h-4 text-gray-400" />
                    <span className="text-sm text-gray-300">Night Theme</span>
                  </div>
                </button>

                {/* Day Preview */}
                <button
                  onClick={() => onThemeChange('day')}
                  className={`relative rounded-2xl overflow-hidden border-2 transition-all duration-200 text-left ${theme === 'day' ? 'border-brand-sage ring-2 ring-brand-sage/30' : 'border-primary-700 hover:border-primary-600'}`}
                >
                  {theme === 'day' && (
                    <div className="absolute top-3 right-3 z-10 w-6 h-6 rounded-full bg-brand-sage flex items-center justify-center">
                      <CheckIcon className="w-3.5 h-3.5 text-white" />
                    </div>
                  )}
                  <div className="bg-[#faf8f5] p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-brand-sage to-secondary-600 flex items-center justify-center">
                        <Sun className="w-4 h-4 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-gray-900">Day</p>
                        <p className="text-xs text-gray-500">Bright and clean</p>
                      </div>
                    </div>
                    <div className="rounded-xl bg-white border border-gray-200 p-3 space-y-2 shadow-sm">
                      <div className="flex items-center justify-between">
                        <div className="h-2.5 w-20 rounded-full bg-gray-200" />
                        <div className="h-5 w-12 rounded-lg bg-brand-sage/15 border border-brand-sage/25" />
                      </div>
                      <div className="space-y-1.5">
                        <div className="h-2 w-full rounded-full bg-gray-100" />
                        <div className="h-2 w-3/4 rounded-full bg-gray-100" />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <div className="h-6 w-16 rounded-lg bg-brand-sage" />
                        <div className="h-6 w-16 rounded-lg bg-gray-100" />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-lg bg-white border border-gray-200 p-2 shadow-sm">
                        <div className="h-2 w-8 rounded-full bg-brand-sage/25 mb-1" />
                        <div className="h-3 w-full rounded-full bg-gray-200" />
                      </div>
                      <div className="rounded-lg bg-white border border-gray-200 p-2 shadow-sm">
                        <div className="h-2 w-8 rounded-full bg-secondary-400/25 mb-1" />
                        <div className="h-3 w-full rounded-full bg-gray-200" />
                      </div>
                      <div className="rounded-lg bg-white border border-gray-200 p-2 shadow-sm">
                        <div className="h-2 w-8 rounded-full bg-warning-500/25 mb-1" />
                        <div className="h-3 w-full rounded-full bg-gray-200" />
                      </div>
                    </div>
                  </div>
                  <div className="px-4 py-3 bg-white border-t border-gray-200 flex items-center gap-2">
                    <Sun className="w-4 h-4 text-gray-500" />
                    <span className="text-sm text-gray-700">Day Theme</span>
                  </div>
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-5">Your theme preference is saved automatically and will apply on your next visit.</p>
            </div>
          )}

          {activeTab === 'signature' && (
            <div className="card p-6">
              <div className="flex items-center gap-2 mb-1"><Building2 className="w-5 h-5 text-accent-400" /><h2 className="text-lg font-semibold text-white">Signature & Company Documents</h2></div>
              <p className="text-sm text-gray-500 mb-6">Manage the assets used on your generated contracts.</p>
              <div className="rounded-xl border border-primary-800 bg-primary-950/40 p-4 mb-6 space-y-4">
                <div>
                  <h4 className="text-sm font-semibold text-white mb-1">Company Identity</h4>
                  <p className="text-xs text-gray-500 mb-3">These details appear on the letterhead, footer, and signature block of every generated contract.</p>
                </div>
                <label className="block"><span className="label">Company Name</span><input className="input mt-1.5" value={companyName} onChange={(e) => setCompanyName(e.target.value)} placeholder="e.g. Puppyfy UAE" /></label>
                <label className="block"><span className="label">Tagline</span><input className="input mt-1.5" value={companyTagline} onChange={(e) => setCompanyTagline(e.target.value)} placeholder="e.g. Premium Puppies · United Arab Emirates" /></label>
                <label className="block"><span className="label">Contact Email</span><input type="email" className="input mt-1.5" value={companyEmail} onChange={(e) => setCompanyEmail(e.target.value)} placeholder="e.g. contact@yourcompany.com" /></label>
                <button onClick={async () => {
                  setSavingCompany(true);
                  const { error } = await supabase.from('contract_settings').upsert({ id: 1, company_name: companyName.trim(), company_tagline: companyTagline.trim(), company_email: companyEmail.trim(), updated_by: user?.id, updated_at: new Date().toISOString() }, { onConflict: 'id' });
                  setSavingCompany(false);
                  if (error) { toast('error', 'Failed to save company details'); return; }
                  setSettings((s) => ({ ...s, company_name: companyName.trim(), company_tagline: companyTagline.trim(), company_email: companyEmail.trim() }));
                  toast('success', 'Company details saved — contracts will now use them');
                }} disabled={savingCompany} className="btn-primary">
                  {savingCompany ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                  Save Company Details
                </button>
              </div>
              <div className="space-y-4">
                {UPLOAD_ORDER.map((type) => {
                  const meta = FIELD_META[type];
                  const Icon = meta.icon;
                  const url = settings[FIELD_MAP[type]];
                  const isUploading = uploading === type;
                  const isImage = IMAGE_TYPES.includes(type);
                  return (
                    <div key={type} className="rounded-xl border border-primary-800 bg-primary-950/40 overflow-hidden">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-4 p-4">
                        <div className="flex items-center gap-3 sm:w-56 shrink-0"><div className="w-10 h-10 rounded-lg bg-accent-500/10 flex items-center justify-center shrink-0"><Icon className="w-5 h-5 text-accent-400" /></div><div className="min-w-0"><h4 className="text-sm font-semibold text-white">{meta.label}</h4><p className="text-xs text-gray-500 mt-0.5">{meta.hint}</p></div></div>
                        <div className="flex-1 min-w-0 hidden sm:block"><p className="text-sm text-gray-400">{meta.description}</p></div>
                        <div className="flex items-center gap-3 shrink-0">
                          {url ? <><>{isImage ? <div className="w-16 h-16 rounded-lg bg-white flex items-center justify-center overflow-hidden shrink-0"><img src={url} alt={meta.label} className={`max-w-full max-h-full object-contain ${type === 'watermark' ? 'opacity-30' : ''}`} onError={(e) => { e.currentTarget.style.display = 'none'; }} /></div> : <div className="flex items-center gap-2 shrink-0"><div className="w-12 h-12 rounded-lg bg-error-500/10 flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-error-400" /></div><a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-accent-400 hover:text-accent-300 whitespace-nowrap"><ExternalLink className="w-3.5 h-3.5" /> View</a></div>}</><label className="btn-secondary cursor-pointer whitespace-nowrap">{isUploading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Upload className="w-4 h-4" />}Replace<input type="file" accept={meta.accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, type); }} /></label><button onClick={() => handleRemove(type)} className="p-2 rounded-lg text-gray-400 hover:text-error-400 hover:bg-error-500/10 transition-colors" title="Remove"><Trash2 className="w-4 h-4" /></button></> : <label className="btn-primary cursor-pointer whitespace-nowrap">{isUploading ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Upload className="w-4 h-4" />}Upload<input type="file" accept={meta.accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f, type); }} /></label>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === 'business' && (
            <div className="card p-6 max-w-2xl">
              <div className="flex items-center gap-2 mb-1"><Calendar className="w-5 h-5 text-accent-400" /><h2 className="text-lg font-semibold text-white">Business Settings</h2></div>
              <p className="text-sm text-gray-500 mb-6">Configure your monthly business cycle. All financial calculations, reports, and commission brackets follow this cycle.</p>
              <label className="block">
                <span className="label">Monthly Cycle Start Day (1–28)</span>
                <input type="number" min="1" max="28" className="input mt-1.5" value={cycleStartDay} onChange={(e) => setCycleStartDay(Math.max(1, Math.min(28, parseInt(e.target.value) || 11)))} />
              </label>
              <div className="mt-4 p-4 rounded-lg bg-primary-950/40 border border-primary-800 text-sm text-gray-400 space-y-1">
                <p className="text-white font-medium">How it works</p>
                <p>If set to <span className="text-accent-400">11</span>, each business month runs from the <span className="text-white">11th</span> of one calendar month to the <span className="text-white">10th</span> of the next.</p>
                <p>Example: "September" = September 11 → October 10</p>
                <p>This applies to all dashboard stats, financial reports, and marketing commission calculations.</p>
              </div>
              <button onClick={async () => {
                setSavingCycle(true);
                const { error } = await supabase.from('business_settings').upsert({ id: 1, monthly_cycle_start_day: cycleStartDay, updated_by: user?.id, updated_at: new Date().toISOString() }, { onConflict: 'id' });
                setSavingCycle(false);
                if (error) { toast('error', 'Failed to save cycle setting'); return; }
                toast('success', 'Business cycle updated — all financial reports now use the new cycle');
              }} disabled={savingCycle} className="btn-primary mt-6">
                {savingCycle ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Save className="w-4 h-4" />}
                Save Cycle Setting
              </button>
            </div>
          )}
          {activeTab === 'features' && <FeaturesTab />}
          {activeTab === 'contract-fields' && <ComingSoon icon={FileText} title="Contract Fields" description="Choose which company and customer details appear on your contracts, and control the default contract wording." />}
          {activeTab === 'note-types' && <ComingSoon icon={FileSignature} title="Note Types" description="Create and manage reusable note categories for your team to keep internal records organized." />}
          {activeTab === 'whatsapp' && <ComingSoon icon={MessageCircle} title="WhatsApp" description="Connect your WhatsApp communication settings and manage message delivery preferences." />}
          {activeTab === 'email-stats' && <ComingSoon icon={Mail} title="Email Stats" description="Review email delivery activity, sent messages, and communication performance." />}
          {activeTab === 'push-notifications' && <ComingSoon icon={Bell} title="Push Notifications" description="Choose which updates should send notifications to your team." />}
          {activeTab === 'test-codes' && <ComingSoon icon={Webhook} title="Test Codes" description="Manage safe testing codes for verifying workflows without affecting live business records." />}
        </div>
      </div>
    </div>
  );
}

function FeaturesTab() {
  const { toggles, loaded, updateToggle } = useFeatureToggles();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  if (!loaded) {
    return <div className="flex items-center justify-center py-20"><span className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /></div>;
  }

  return (
    <div className="card p-6">
      <div className="flex items-center gap-2 mb-1"><ToggleLeft className="w-5 h-5 text-accent-400" /><h2 className="text-lg font-semibold text-white">Feature Toggles</h2></div>
      <p className="text-sm text-gray-500 mb-6">{isAdmin ? 'Turn features on or off. Disabled features disappear from the sidebar for everyone.' : 'Features currently enabled in your system.'}</p>
      <div className="space-y-3">
        {FEATURE_LIST.map((feature) => {
          const enabled = toggles[feature.key];
          const Icon = feature.icon;
          return (
            <div key={feature.key} className="flex items-center justify-between gap-4 rounded-xl border border-primary-800 bg-primary-950/40 p-4">
              <div className="flex items-start gap-3 min-w-0">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 transition-colors ${enabled ? 'bg-accent-500/10 text-accent-400' : 'bg-primary-800 text-gray-600'}`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-semibold text-white">{feature.label}</h4>
                  <p className="text-xs text-gray-500 mt-0.5">{feature.description}</p>
                </div>
              </div>
              {isAdmin ? (
                <button
                  onClick={() => updateToggle(feature.key, !enabled)}
                  className={`relative shrink-0 w-12 h-6 rounded-full transition-colors duration-200 ${enabled ? 'bg-accent-500' : 'bg-primary-700'}`}
                  aria-label={enabled ? `Disable ${feature.label}` : `Enable ${feature.label}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${enabled ? 'translate-x-6' : ''}`} />
                </button>
              ) : (
                <span className={`shrink-0 text-xs font-medium ${enabled ? 'text-success-400' : 'text-gray-600'}`}>{enabled ? 'On' : 'Off'}</span>
              )}
            </div>
          );
        })}
      </div>
      {!isAdmin && <p className="text-xs text-gray-600 mt-4">Only administrators can change feature settings.</p>}
    </div>
  );
}
