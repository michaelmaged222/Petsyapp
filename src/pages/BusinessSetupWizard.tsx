import { useMemo, useState } from 'react';
import {
  ArrowLeft, ArrowRight, Building2, Check, Coins, Droplet, FileSignature, Image as ImageIcon,
  Mail, MapPin, Palette, Phone, Rocket, Signature, Sparkles, Stamp, ToggleLeft, Trash2, Upload, UserPlus, Users,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { useTenant } from '@/context/TenantContext';
import { useFeatureToggles } from '@/lib/useFeatureToggles';
import { FEATURE_LIST } from '@/lib/features';
import { ASSIGNABLE_ROLES } from '@/lib/roles';
import { inviteTeammate, sendWelcomeEmail, generateTempPassword } from '@/lib/team';
import { toast } from '@/components/Toast';
import type { UserRole } from '@/lib/supabase';

const CURRENCIES = ['AED', 'USD', 'EUR', 'GBP', 'SAR', 'INR', 'PKR'];

type AssetType = 'logo' | 'stamp' | 'signature' | 'watermark' | 'contract';

const ASSET_META: Record<AssetType, { label: string; hint: string; accept: string; column: string; image: boolean }> = {
  logo: { label: 'Company Logo', hint: 'Shown in the app and on contract headers', accept: 'image/png,image/jpeg,image/webp', column: 'logo_url', image: true },
  stamp: { label: 'Company Stamp', hint: 'Placed over the seller signature', accept: 'image/png,image/jpeg,image/webp', column: 'seller_stamp_url', image: true },
  signature: { label: 'Authorized Signature', hint: 'The signed name on every contract', accept: 'image/png,image/jpeg,image/webp', column: 'seller_signature_url', image: true },
  watermark: { label: 'Watermark', hint: 'Faint image behind each contract page', accept: 'image/png,image/jpeg,image/webp', column: 'watermark_url', image: true },
  contract: { label: 'Master Company Contract', hint: 'Kept on file for reference', accept: 'application/pdf', column: 'company_contract_url', image: false },
};

const STEPS = [
  { key: 'business', label: 'Company Details', icon: Building2 },
  { key: 'branding', label: 'Brand & Colours', icon: Palette },
  { key: 'documents', label: 'Documents', icon: FileSignature },
  { key: 'features', label: 'Choose Features', icon: ToggleLeft },
  { key: 'team', label: 'Add Your Team', icon: Users },
] as const;

type StepKey = (typeof STEPS)[number]['key'];

interface TeammateDraft {
  id: string;
  name: string;
  email: string;
  role: Exclude<UserRole, 'owner'>;
  password: string;
}

function newTeammate(): TeammateDraft {
  return {
    id: crypto.randomUUID(),
    name: '',
    email: '',
    role: 'sales',
    password: generateTempPassword(),
  };
}

export default function BusinessSetupWizard() {
  const { user } = useAuth();
  const { tenant, settings, updateSettings, markSetupComplete, refresh } = useTenant();
  const { toggles, loaded: togglesLoaded, updateToggle } = useFeatureToggles();

  const [stepIndex, setStepIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<AssetType | null>(null);

  const step = STEPS[stepIndex].key as StepKey;

  // Step 1 — company details
  const [businessName, setBusinessName] = useState(settings?.business_name ?? tenant?.name ?? '');
  const [contactEmail, setContactEmail] = useState(settings?.contact_email ?? '');
  const [contactPhone, setContactPhone] = useState(settings?.contact_phone ?? '');
  const [address, setAddress] = useState(settings?.address ?? '');
  const [currency, setCurrency] = useState(settings?.currency ?? 'AED');

  // Step 2 — brand
  const [primaryColor, setPrimaryColor] = useState(settings?.primary_color ?? '#0f172a');
  const [accentColor, setAccentColor] = useState(settings?.accent_color ?? '#0ea5e9');
  const [logoUrl, setLogoUrl] = useState<string | null>(settings?.logo_url ?? null);

  // Step 3 — documents
  const [assets, setAssets] = useState<Record<string, string | null>>({});

  // Step 5 — team
  const [team, setTeam] = useState<TeammateDraft[]>([]);

  const assetUrl = (type: AssetType) => (type === 'logo' ? logoUrl : assets[ASSET_META[type].column] ?? null);

  const progress = useMemo(() => ((stepIndex + 1) / STEPS.length) * 100, [stepIndex]);

  const saveCompanyDetails = async (): Promise<boolean> => {
    if (!businessName.trim()) { toast('error', 'Please enter your business name'); return false; }
    if (!contactEmail.trim()) { toast('error', 'Please enter a contact email'); return false; }

    const ok = await updateSettings({
      business_name: businessName.trim(),
      contact_email: contactEmail.trim(),
      contact_phone: contactPhone.trim(),
      address: address.trim(),
      currency,
      primary_color: primaryColor,
      accent_color: accentColor,
    });
    if (!ok) { toast('error', 'Could not save your company details'); return false; }

    if (tenant) {
      await supabase.from('tenants').update({ name: businessName.trim(), updated_at: new Date().toISOString() }).eq('id', tenant.id);
      await supabase.from('contract_settings').upsert(
        { id: 1, company_name: businessName.trim(), company_email: contactEmail.trim(), updated_by: user?.id, updated_at: new Date().toISOString() },
        { onConflict: 'id' },
      );
      await refresh();
    }
    return true;
  };

  const saveBranding = async (): Promise<boolean> => {
    const ok = await updateSettings({ primary_color: primaryColor, accent_color: accentColor, logo_url: logoUrl });
    if (!ok) { toast('error', 'Could not save your brand colours'); return false; }
    return true;
  };

  const uploadAsset = async (type: AssetType, file: File) => {
    const meta = ASSET_META[type];
    const maxSize = type === 'contract' ? 10 * 1024 * 1024 : 5 * 1024 * 1024;
    if (file.size > maxSize) { toast('error', `File is too large. Maximum is ${type === 'contract' ? '10 MB' : '5 MB'}`); return; }

    setUploading(type);
    const ext = file.name.split('.').pop()?.toLowerCase() || 'png';
    const path = `tenant-${tenant?.id ?? 'shared'}/${type}.${ext}`;

    const { error: upErr } = await supabase.storage
      .from('contract-assets')
      .upload(path, file, { upsert: true, contentType: file.type, cacheControl: '0' });
    if (upErr) { toast('error', 'Upload failed'); setUploading(null); return; }

    const { data: pub } = supabase.storage.from('contract-assets').getPublicUrl(path);
    const url = `${pub.publicUrl}?v=${Date.now()}`;

    if (type === 'logo') {
      const ok = await updateSettings({ logo_url: url });
      if (!ok) { toast('error', 'Could not save the logo'); setUploading(null); return; }
      setLogoUrl(url);
    } else {
      const { error: dbErr } = await supabase.from('contract_settings').upsert(
        { id: 1, [meta.column]: url, updated_by: user?.id, updated_at: new Date().toISOString() },
        { onConflict: 'id' },
      );
      if (dbErr) { toast('error', 'Could not save the file'); setUploading(null); return; }
      setAssets((prev) => ({ ...prev, [meta.column]: url }));
    }
    toast('success', `${meta.label} uploaded`);
    setUploading(null);
  };

  const removeAsset = async (type: AssetType) => {
    const meta = ASSET_META[type];
    if (type === 'logo') {
      const ok = await updateSettings({ logo_url: null });
      if (!ok) { toast('error', 'Could not remove the logo'); return; }
      setLogoUrl(null);
    } else {
      const { error } = await supabase.from('contract_settings').upsert(
        { id: 1, [meta.column]: null, updated_by: user?.id, updated_at: new Date().toISOString() },
        { onConflict: 'id' },
      );
      if (error) { toast('error', 'Could not remove the file'); return; }
      setAssets((prev) => ({ ...prev, [meta.column]: null }));
    }
    toast('success', `${meta.label} removed`);
  };

  const inviteTeam = async (): Promise<boolean> => {
    const filled = team.filter((t) => t.email.trim());
    if (filled.length === 0) return true;

    for (const person of filled) {
      if (!person.name.trim()) {
        toast('error', `Please add a name for ${person.email}`);
        return false;
      }
      const { error } = await inviteTeammate({
        email: person.email.trim(),
        name: person.name.trim(),
        role: person.role,
        password: person.password,
      });
      if (error) {
        toast('error', `${person.email}: ${error}`);
        return false;
      }
      await sendWelcomeEmail(person.email.trim(), person.name.trim(), person.password);
    }
    return true;
  };

  const next = async () => {
    setSaving(true);
    let ok = true;

    if (step === 'business') ok = await saveCompanyDetails();
    else if (step === 'branding') ok = await saveBranding();
    else if (step === 'team') ok = await inviteTeam();

    setSaving(false);
    if (!ok) return;

    if (stepIndex === STEPS.length - 1) {
      const done = await markSetupComplete();
      if (!done) { toast('error', 'Could not finish setup. Please try again.'); return; }
      toast('success', 'Your business is ready');
      await refresh();
      return;
    }
    setStepIndex((i) => i + 1);
  };

  const skipSetup = async () => {
    setSaving(true);
    const done = await markSetupComplete();
    setSaving(false);
    if (!done) { toast('error', 'Could not skip setup'); return; }
    await refresh();
  };

  const isLast = stepIndex === STEPS.length - 1;

  return (
    <div className="min-h-screen bg-primary-950 relative overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-accent-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-secondary-600/10 blur-3xl" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-4 py-8 lg:py-12">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 mb-8">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent-500/10 border border-accent-500/20 text-accent-300 text-xs font-medium mb-3">
              <Sparkles className="w-3.5 h-3.5" />
              Welcome, {user?.name?.split(' ')[0] || 'there'}
            </div>
            <h1 className="text-2xl lg:text-3xl font-bold text-white tracking-tight">Set up your business</h1>
            <p className="text-sm text-gray-400 mt-1.5">A few short steps and your workspace is ready for your team.</p>
          </div>
          <button onClick={skipSetup} disabled={saving} className="text-xs text-gray-500 hover:text-gray-300 transition-colors shrink-0 mt-1">
            Skip for now
          </button>
        </div>

        {/* Progress */}
        <div className="mb-8">
          <div className="h-1.5 rounded-full bg-primary-800 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-sage to-accent-500 transition-all duration-500" style={{ width: `${progress}%` }} />
          </div>
          <div className="flex items-center gap-1.5 mt-4 overflow-x-auto pb-1">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done = i < stepIndex;
              const active = i === stepIndex;
              return (
                <button
                  key={s.key}
                  onClick={() => i < stepIndex && setStepIndex(i)}
                  disabled={i > stepIndex}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                    active ? 'bg-accent-500/15 text-accent-300 border border-accent-500/30'
                    : done ? 'text-success-400 hover:bg-primary-800/50'
                    : 'text-gray-600'
                  }`}
                >
                  {done ? <Check className="w-3.5 h-3.5" /> : <Icon className="w-3.5 h-3.5" />}
                  {i + 1}. {s.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="card p-6 lg:p-8 animate-slide-up">
          {step === 'business' && (
            <div className="space-y-5">
              <SectionHeading icon={Building2} title="Company Details" subtitle="This is what your team sees across the app and on printed contracts." />
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Business Name *" icon={Building2}>
                  <input className="input pl-10" value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="e.g. Royal Puppies Dubai" />
                </Field>
                <Field label="Contact Email *" icon={Mail}>
                  <input type="email" className="input pl-10" value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} placeholder="contact@example.com" />
                </Field>
                <Field label="Contact Number" icon={Phone}>
                  <input className="input pl-10" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} placeholder="+971 50 000 0000" />
                </Field>
                <Field label="Currency" icon={Coins}>
                  <select className="select pl-10" value={currency} onChange={(e) => setCurrency(e.target.value)}>
                    {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </Field>
              </div>
              <Field label="Business Address" icon={MapPin}>
                <input className="input pl-10" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Street, city, country" />
              </Field>
            </div>
          )}

          {step === 'branding' && (
            <div className="space-y-6">
              <SectionHeading icon={Palette} title="Brand & Colours" subtitle="Upload your logo and pick the colours that represent your business." />
              <div className="grid lg:grid-cols-2 gap-6">
                <div>
                  <span className="label">Company Logo</span>
                  <div className="mt-2 flex items-center gap-4">
                    <div className="w-20 h-20 rounded-xl bg-white/95 border border-primary-700 flex items-center justify-center overflow-hidden shrink-0">
                      {logoUrl ? <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" /> : <ImageIcon className="w-7 h-7 text-gray-400" />}
                    </div>
                    <label className="btn-secondary cursor-pointer">
                      {uploading === 'logo' ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Upload className="w-4 h-4" />}
                      {logoUrl ? 'Replace' : 'Upload'}
                      <input type="file" accept={ASSET_META.logo.accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAsset('logo', f); }} />
                    </label>
                    {logoUrl && (
                      <button onClick={() => removeAsset('logo')} className="p-2 rounded-lg text-gray-400 hover:text-error-400 hover:bg-error-500/10 transition-colors" title="Remove">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mt-2">A square or wide transparent PNG works best.</p>
                </div>

                <div className="space-y-4">
                  <ColorField label="Primary Colour" value={primaryColor} onChange={setPrimaryColor} />
                  <ColorField label="Accent Colour" value={accentColor} onChange={setAccentColor} />
                  <div className="rounded-xl border border-primary-800 bg-primary-950/40 p-4">
                    <p className="text-xs text-gray-500 mb-3">Preview</p>
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg" style={{ background: primaryColor }} />
                      <div className="flex-1 h-10 rounded-lg border border-primary-700 flex items-center justify-center text-xs font-medium text-white" style={{ background: accentColor }}>
                        Button
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 'documents' && (
            <div className="space-y-4">
              <SectionHeading icon={FileSignature} title="Documents & Signatures" subtitle="These assets are placed on every contract you generate. You can add them later in Settings." />
              {(['stamp', 'signature', 'watermark', 'contract'] as AssetType[]).map((type) => {
                const meta = ASSET_META[type];
                const url = assetUrl(type);
                return (
                  <div key={type} className="flex flex-col sm:flex-row sm:items-center gap-4 rounded-xl border border-primary-800 bg-primary-950/40 p-4">
                    <div className="flex items-center gap-3 sm:w-56 shrink-0">
                      <div className="w-10 h-10 rounded-lg bg-accent-500/10 flex items-center justify-center shrink-0">
                        {type === 'stamp' ? <Stamp className="w-5 h-5 text-accent-400" />
                          : type === 'signature' ? <Signature className="w-5 h-5 text-accent-400" />
                          : type === 'watermark' ? <Droplet className="w-5 h-5 text-accent-400" />
                          : <FileSignature className="w-5 h-5 text-accent-400" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-white">{meta.label}</p>
                        <p className="text-xs text-gray-500 mt-0.5">{meta.hint}</p>
                      </div>
                    </div>
                    <div className="flex-1" />
                    <div className="flex items-center gap-3 shrink-0">
                      {url && (
                        meta.image ? (
                          <div className="w-14 h-14 rounded-lg bg-white flex items-center justify-center overflow-hidden shrink-0">
                            <img src={url} alt={meta.label} className="max-w-full max-h-full object-contain" />
                          </div>
                        ) : (
                          <a href={url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent-400 hover:text-accent-300">View file</a>
                        )
                      )}
                      <label className="btn-secondary cursor-pointer whitespace-nowrap">
                        {uploading === type ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Upload className="w-4 h-4" />}
                        {url ? 'Replace' : 'Upload'}
                        <input type="file" accept={meta.accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadAsset(type, f); }} />
                      </label>
                      {url && (
                        <button onClick={() => removeAsset(type)} className="p-2 rounded-lg text-gray-400 hover:text-error-400 hover:bg-error-500/10 transition-colors" title="Remove">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {step === 'features' && (
            <div className="space-y-4">
              <SectionHeading icon={ToggleLeft} title="Choose Your Features" subtitle="Only switch on what your business needs. Everything is on by default and can be changed anytime." />
              {!togglesLoaded ? (
                <div className="flex justify-center py-12"><span className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" /></div>
              ) : (
                <div className="grid sm:grid-cols-2 gap-3">
                  {FEATURE_LIST.map((feature) => {
                    const enabled = toggles[feature.key];
                    const Icon = feature.icon;
                    return (
                      <div key={feature.key} className="flex items-start justify-between gap-3 rounded-xl border border-primary-800 bg-primary-950/40 p-4">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${enabled ? 'bg-accent-500/10 text-accent-400' : 'bg-primary-800 text-gray-600'}`}>
                            <Icon className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-white">{feature.label}</p>
                            <p className="text-xs text-gray-500 mt-0.5">{feature.description}</p>
                          </div>
                        </div>
                        <button
                          onClick={() => updateToggle(feature.key, !enabled)}
                          className={`relative shrink-0 w-12 h-6 rounded-full transition-colors duration-200 ${enabled ? 'bg-accent-500' : 'bg-primary-700'}`}
                          aria-label={enabled ? `Disable ${feature.label}` : `Enable ${feature.label}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${enabled ? 'translate-x-6' : ''}`} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {step === 'team' && (
            <div className="space-y-5">
              <SectionHeading icon={Users} title="Add Your Team" subtitle="Give each person access to exactly what they need. You can add more people later from the Employees page." />

              <div className="space-y-3">
                {team.map((person) => (
                  <div key={person.id} className="rounded-xl border border-primary-800 bg-primary-950/40 p-4 space-y-3">
                    <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                      <input className="input" placeholder="Full name" value={person.name} onChange={(e) => setTeam((prev) => prev.map((p) => p.id === person.id ? { ...p, name: e.target.value } : p))} />
                      <input className="input" placeholder="Work email" value={person.email} onChange={(e) => setTeam((prev) => prev.map((p) => p.id === person.id ? { ...p, email: e.target.value } : p))} />
                      <select className="select" value={person.role} onChange={(e) => setTeam((prev) => prev.map((p) => p.id === person.id ? { ...p, role: e.target.value as TeammateDraft['role'] } : p))}>
                        {ASSIGNABLE_ROLES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                      <div className="flex items-center gap-2">
                        <input className="input" placeholder="Temporary password" value={person.password} onChange={(e) => setTeam((prev) => prev.map((p) => p.id === person.id ? { ...p, password: e.target.value } : p))} />
                        <button onClick={() => setTeam((prev) => prev.filter((p) => p.id !== person.id))} className="p-2 rounded-lg text-gray-400 hover:text-error-400 hover:bg-error-500/10 transition-colors shrink-0" title="Remove">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                    <p className="text-xs text-gray-500">
                      {ASSIGNABLE_ROLES.find((r) => r.value === person.role)?.summary}
                    </p>
                  </div>
                ))}
              </div>

              <button onClick={() => setTeam((prev) => [...prev, newTeammate()])} className="btn-secondary">
                <UserPlus className="w-4 h-4" /> Add a team member
              </button>

              {team.length === 0 && (
                <div className="rounded-xl border border-primary-800 bg-primary-950/40 p-5 text-center">
                  <p className="text-sm text-gray-400">No team members added yet.</p>
                  <p className="text-xs text-gray-500 mt-1">A welcome email with login details is sent to each person you add.</p>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 mt-8 pt-6 border-t border-primary-800">
            <button onClick={() => setStepIndex((i) => Math.max(0, i - 1))} disabled={stepIndex === 0 || saving} className="btn-ghost disabled:opacity-40">
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
            <button onClick={next} disabled={saving} className="btn-primary">
              {saving ? (
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : isLast ? (
                <>Finish Setup <Rocket className="w-4 h-4" /></>
              ) : (
                <>Continue <ArrowRight className="w-4 h-4" /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ icon: Icon, title, subtitle }: { icon: typeof Building2; title: string; subtitle: string }) {
  return (
    <div className="mb-6">
      <div className="flex items-center gap-2">
        <Icon className="w-5 h-5 text-accent-400" />
        <h2 className="text-lg font-semibold text-white">{title}</h2>
      </div>
      <p className="text-sm text-gray-500 mt-1">{subtitle}</p>
    </div>
  );
}

function Field({ label, icon: Icon, children }: { label: string; icon: typeof Building2; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <div className="relative mt-1.5">
        <Icon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 pointer-events-none" />
        {children}
      </div>
    </label>
  );
}

function ColorField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <span className="label">{label}</span>
      <div className="flex items-center gap-3 mt-1.5">
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} className="w-12 h-10 rounded-lg border border-primary-700 bg-primary-900 cursor-pointer" />
        <input className="input font-mono text-sm" value={value} onChange={(e) => onChange(e.target.value)} />
      </div>
    </div>
  );
}
