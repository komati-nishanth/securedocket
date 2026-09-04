import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, Mail, ArrowRight, UserCheck, KeyRound } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Alert } from '../../components/common/Alert';

const ROLE_PRESETS = [
  {
    label: 'Lead Officer',
    email: 'demo.officer@police.gov.in',
    pass: 'DemoOfficerPass123!',
    totpSecret: 'JBSWY3DPEHPK3PXP',
    role: 'officer',
  },
  {
    label: 'Forensic Verifier',
    email: 'demo.verifier@police.gov.in',
    pass: 'DemoVerifierPass123!',
    totpSecret: 'JBSWY3DPEHPK3PXP',
    role: 'verifier',
  },
  {
    label: 'Judicial Auditor',
    email: 'demo.auditor@police.gov.in',
    pass: 'DemoAuditorPass123!',
    totpSecret: 'JBSWY3DPEHPK3PXP',
    role: 'auditor',
  },
  {
    label: 'System Admin',
    email: 'demo.admin@police.gov.in',
    pass: 'DemoAdminPass123!',
    totpSecret: 'JBSWY3DPEHPK3PXP',
    role: 'admin',
  },
];

export function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [activeSecret, setActiveSecret] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both official email and security passphrase.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await login(email, password);
      const data = res?.data;

      if (data?.require2FA || data?.require2FASetup) {
        navigate('/verify-2fa', {
          state: {
            tempToken: data.tempToken,
            userId: data.userId,
            email: data.email || email,
            require2FASetup: data.require2FASetup,
            totpSecret: activeSecret,
          },
        });
      } else {
        navigate('/dashboard');
      }
    } catch (err) {
      setError(err?.message || 'Authentication rejected by security gateway.');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyPreset = (preset) => {
    setEmail(preset.email);
    setPassword(preset.pass);
    setActiveSecret(preset.totpSecret);
    setError(null);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-semibold mb-2">
          <ShieldCheck className="w-4 h-4" />
          <span>OFFICER AUTHENTICATION GATEWAY</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-100">Sign in to Case Vault</h2>
        <p className="text-xs text-slate-400 mt-1">
          Step 1 of 2: Verify official credentials to initiate 2FA security challenge.
        </p>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          label="Official Email Address"
          type="email"
          icon={Mail}
          placeholder="officer.badge@police.gov.in"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <Input
          label="Passphrase / Security Key"
          type="password"
          icon={Lock}
          placeholder="••••••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />

        <Button type="submit" variant="primary" icon={ArrowRight} isLoading={loading} className="w-full">
          Verify Credentials & Continue to 2FA
        </Button>
      </form>

      {/* Official Seed Role Presets for Easy Jury / Demo Testing */}
      <div className="pt-6 border-t border-slate-800/80 space-y-3">
        <div className="text-[11px] font-mono uppercase tracking-wider text-slate-400 font-semibold flex items-center justify-between">
          <span>Official Seed Role Presets</span>
          <span className="text-[10px] text-cyan-400 font-mono">Click to Pre-fill</span>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {ROLE_PRESETS.map((p) => (
            <Button
              key={p.role}
              type="button"
              variant={email === p.email ? 'emerald' : 'secondary'}
              size="sm"
              icon={UserCheck}
              onClick={() => handleApplyPreset(p)}
              className="text-xs justify-start"
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
