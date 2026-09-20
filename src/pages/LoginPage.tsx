import { useState } from 'react';
import { PawPrint, Mail, Lock, ArrowRight, AlertCircle, Send, UserPlus, User, Building2, Sparkles, ChevronRight, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useAppLogo } from '@/lib/useAppLogo';
import type { UserRole } from '@/lib/supabase';

type Mode = 'signin' | 'signup' | 'signup-business' | 'reset';

export default function LoginPage() {
  const { signIn, signUp, signUpNewBusiness, resetPassword, isRecoverySession, updatePassword } = useAuth();
  const { logoUrl, companyName } = useAppLogo();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [role, setRole] = useState<UserRole>('admin');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetSent, setResetSent] = useState(false);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordUpdated, setPasswordUpdated] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    if (mode === 'signin') {
      const { error } = await signIn(email, password);
      if (error) setError(error);
    } else if (mode === 'signup') {
      const { error } = await signUp(email, password, name, role);
      if (error) setError(error);
    } else if (mode === 'signup-business') {
      const { error } = await signUpNewBusiness(email, password, name, businessName);
      if (error) setError(error);
    }
    setLoading(false);
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error } = await resetPassword(resetEmail);
    if (error) setError(error);
    else setResetSent(true);
    setLoading(false);
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (newPassword.length < 6) {
      setError('Password must be at least 6 characters');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    const { error } = await updatePassword(newPassword);
    setLoading(false);
    if (error) setError(error);
    else setPasswordUpdated(true);
  };

  const switchMode = (newMode: Mode) => {
    setMode(newMode);
    setError(null);
    setResetSent(false);
  };

  if (isRecoverySession && !passwordUpdated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-primary-950 via-primary-900 to-primary-800 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-accent-500/10 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-accent-600/10 blur-3xl" />
        </div>
        <div className="relative z-10 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-sage to-secondary-600 mb-4 shadow-2xl shadow-brand-sage/20 overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="Puppyfy" className="w-full h-full object-cover" />
              ) : (
                <PawPrint className="w-10 h-10 text-white" />
              )}
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">{companyName || 'Puppyfy CRM'}</h1>
          </div>
          <div className="card p-8 animate-slide-up">
            <h2 className="text-xl font-semibold text-white mb-2">Set New Password</h2>
            <p className="text-sm text-gray-400 mb-6">Enter your new password below. You won't need your old password.</p>
            {error && (
              <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-error-500/10 border border-error-500/30 text-error-400 text-sm animate-fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <form onSubmit={handleUpdatePassword} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input type="password" required minLength={6} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="input pl-10" placeholder="Min 6 characters" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">Confirm New Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input type="password" required minLength={6} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="input pl-10" placeholder="Re-enter new password" />
                </div>
              </div>
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>Update Password <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  if (isRecoverySession && passwordUpdated) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-primary-950 via-primary-900 to-primary-800 relative overflow-hidden">
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-accent-500/10 blur-3xl" />
          <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-accent-600/10 blur-3xl" />
        </div>
        <div className="relative z-10 w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-sage to-secondary-600 mb-4 shadow-2xl shadow-brand-sage/20 overflow-hidden">
              {logoUrl ? (
                <img src={logoUrl} alt="Puppyfy" className="w-full h-full object-cover" />
              ) : (
                <PawPrint className="w-10 h-10 text-white" />
              )}
            </div>
            <h1 className="text-3xl font-bold text-white tracking-tight">{companyName || 'Puppyfy CRM'}</h1>
          </div>
          <div className="card p-8 animate-slide-up text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-success-500/20 mb-4">
              <CheckCircle2 className="w-7 h-7 text-success-400" />
            </div>
            <h2 className="text-xl font-semibold text-white mb-2">Password Updated</h2>
            <p className="text-gray-300 mb-6">Your password has been changed successfully. Please sign in with your new password.</p>
            <button onClick={() => { setPasswordUpdated(false); setNewPassword(''); setConfirmPassword(''); }} className="btn-primary w-full">
              Back to Sign In <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-gradient-to-br from-primary-950 via-primary-900 to-primary-800 relative overflow-hidden">
      {/* Decorative background */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 rounded-full bg-accent-500/10 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 w-96 h-96 rounded-full bg-accent-600/10 blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-primary-500/5 blur-3xl" />
      </div>

      <div className="relative z-10 w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-gradient-to-br from-brand-sage to-secondary-600 mb-4 shadow-2xl shadow-brand-sage/20 overflow-hidden">
            {logoUrl ? (
              <img src={logoUrl} alt="Puppyfy" className="w-full h-full object-cover" />
            ) : (
              <PawPrint className="w-10 h-10 text-white" />
            )}
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">{companyName || 'Puppyfy CRM'}</h1>
          <p className="text-gray-400 mt-1.5 text-sm">Premium Pet Business Management Platform</p>
        </div>

        {mode === 'reset' ? (
          <div className="card p-8 animate-slide-up">
            <h2 className="text-xl font-semibold text-white mb-6">Reset Password</h2>

            {resetSent ? (
              <div className="text-center py-4">
                <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-success-500/20 mb-4">
                  <Send className="w-7 h-7 text-success-400" />
                </div>
                <p className="text-gray-300 mb-6">Password reset link sent to your email.</p>
                <button onClick={() => switchMode('signin')} className="btn-secondary">Back to Sign In</button>
              </div>
            ) : (
              <>
                {error && (
                  <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-error-500/10 border border-error-500/30 text-error-400 text-sm">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}
                <form onSubmit={handleReset} className="space-y-5">
                  <div>
                    <label className="block text-sm font-medium text-gray-400 mb-1.5">Email Address</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                      <input type="email" required value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} className="input pl-10" placeholder="you@example.com" />
                    </div>
                  </div>
                  <button type="submit" disabled={loading} className="btn-primary w-full">
                    {loading ? <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <>Send Reset Link <Send className="w-4 h-4" /></>}
                  </button>
                  <button type="button" onClick={() => switchMode('signin')} className="btn-ghost w-full">Back to Sign In</button>
                </form>
              </>
            )}
          </div>
        ) : mode === 'signup-business' ? (
          <div className="card p-8 animate-slide-up">
            <div className="flex items-center gap-2 mb-2">
              <Sparkles className="w-5 h-5 text-accent-400" />
              <h2 className="text-xl font-semibold text-white">Start Your Pet Business</h2>
            </div>
            <p className="text-sm text-gray-400 mb-6">Create a new workspace with a 14-day free trial. No credit card required.</p>

            {error && (
              <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-error-500/10 border border-error-500/30 text-error-400 text-sm animate-fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">Business Name</label>
                <div className="relative">
                  <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input type="text" required value={businessName} onChange={(e) => setBusinessName(e.target.value)} className="input pl-10" placeholder="e.g. Royal Puppies Dubai" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">Your Full Name</label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="input pl-10" placeholder="Your full name" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input pl-10" placeholder="you@example.com" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="input pl-10" placeholder="Min 6 characters" />
                </div>
              </div>

              <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-accent-500/10 border border-accent-500/20 text-accent-300 text-xs">
                <Sparkles className="w-4 h-4 shrink-0" />
                <span>You'll get 14 days of Pro features free. Cancel anytime.</span>
              </div>

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>Create My Business <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>

            <div className="mt-5 text-center space-y-2">
              <button onClick={() => switchMode('signin')} className="text-sm text-accent-400 hover:text-accent-300 transition-colors block">
                Already have an account? Sign in
              </button>
            </div>
          </div>
        ) : (
          <div className="card p-8 animate-slide-up">
            <h2 className="text-xl font-semibold text-white mb-6">
              {mode === 'signin' ? 'Sign in to your account' : 'Join an existing workspace'}
            </h2>

            {error && (
              <div className="mb-4 flex items-center gap-2 px-4 py-3 rounded-lg bg-error-500/10 border border-error-500/30 text-error-400 text-sm animate-fade-in">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-5">
              {mode === 'signup' && (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                    <input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="input pl-10" placeholder="Your full name" />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="input pl-10" placeholder="you@example.com" />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                  <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} className="input pl-10" placeholder={mode === 'signup' ? 'Min 6 characters' : '••••••••'} />
                </div>
              </div>

              {mode === 'signup' && (
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5">Role</label>
                  <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="select">
                    <option value="admin">Admin — Full access</option>
                    <option value="sales">Sales Employee — Leads, Sales, Contracts, Clients</option>
                    <option value="marketing">Marketing Manager — Leads and Dashboard</option>
                    <option value="tax_viewer">Tax Viewer — Sales with tax breakdown</option>
                  </select>
                </div>
              )}

              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? (
                  <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : mode === 'signin' ? (
                  <>Sign In <ArrowRight className="w-4 h-4" /></>
                ) : (
                  <>Create Account <UserPlus className="w-4 h-4" /></>
                )}
              </button>
            </form>

            {mode === 'signin' && (
              <div className="mt-6 pt-5 border-t border-primary-800">
                <button
                  onClick={() => switchMode('signup-business')}
                  className="w-full flex items-center justify-between px-4 py-3 rounded-lg bg-gradient-to-r from-accent-500/10 to-transparent border border-accent-500/20 hover:border-accent-500/40 transition-colors group"
                >
                  <div className="flex items-center gap-3 text-left">
                    <Building2 className="w-5 h-5 text-accent-400 shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-white">New to Puppyfy?</p>
                      <p className="text-xs text-gray-400">Start your pet business with 14-day free trial</p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-accent-400 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>
            )}

            <div className="mt-5 text-center space-y-2">
              {mode === 'signin' ? (
                <>
                  <button onClick={() => switchMode('signup')} className="text-sm text-accent-400 hover:text-accent-300 transition-colors block">
                    Join an existing workspace
                  </button>
                  <button onClick={() => switchMode('reset')} className="text-sm text-gray-500 hover:text-gray-400 transition-colors block">
                    Forgot password?
                  </button>
                </>
              ) : (
                <button onClick={() => switchMode('signin')} className="text-sm text-accent-400 hover:text-accent-300 transition-colors block">
                  Already have an account? Sign in
                </button>
              )}
            </div>
          </div>
        )}

        <p className="text-center text-xs text-gray-600 mt-6">
          © 2026 {companyName || 'Puppyfy CRM'}. All rights reserved.
        </p>
      </div>
    </div>
  );
}
