import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { KeyRound, ShieldCheck, ArrowRight, QrCode, Sparkles, AlertCircle } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Input } from '../../components/common/Input';
import { Alert } from '../../components/common/Alert';
import { useAuth } from '../../hooks/useAuth';
import { authService } from '../../services/authService';

export function TwoFactorVerify() {
  const navigate = useNavigate();
  const location = useLocation();
  const { complete2FA, complete2FASetup } = useAuth();

  const tempToken = location.state?.tempToken;
  const userId = location.state?.userId;
  const isSetup = location.state?.require2FASetup;
  const passedSecret = location.state?.totpSecret;

  const [totpCode, setTotpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Setup state (QR Code data)
  const [setupData, setSetupData] = useState(null);
  const [loadingSetup, setLoadingSetup] = useState(false);

  useEffect(() => {
    if (!tempToken && !userId) {
      navigate('/login', { replace: true });
      return;
    }

    if (isSetup) {
      async function fetchQr() {
        setLoadingSetup(true);
        try {
          const res = await authService.setup2FA(tempToken);
          setSetupData(res.data);
        } catch (err) {
          setError(err?.message || 'Failed to generate 2FA setup QR code');
        } finally {
          setLoadingSetup(false);
        }
      }
      fetchQr();
    }
  }, [tempToken, userId, isSetup, navigate]);

  const handleVerify = async (e) => {
    e.preventDefault();
    if (totpCode.length !== 6) {
      setError('Please enter a 6-digit numeric TOTP code.');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      if (isSetup && setupData?.secret) {
        await complete2FASetup(totpCode, setupData.secret, tempToken);
      } else {
        await complete2FA(totpCode, tempToken, userId);
      }
      navigate('/dashboard');
    } catch (err) {
      setError(err?.message || 'Invalid or expired 6-digit code. Please verify your authenticator app time sync.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 text-emerald-400 text-xs font-mono font-semibold mb-2">
          <ShieldCheck className="w-4 h-4" />
          <span>MANDATORY TWO-FACTOR AUTHENTICATION</span>
        </div>
        <h2 className="text-2xl font-bold text-slate-100">
          {isSetup ? 'Enroll Authenticator Device' : 'Verify TOTP Security Token'}
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          {isSetup
            ? 'Scan the official QR code below with Google Authenticator or Microsoft Authenticator.'
            : 'Step 2 of 2: Enter the 6-digit time-based code from your authenticator device.'}
        </p>
      </div>

      {error && <Alert variant="error">{error}</Alert>}

      {/* QR Code Setup View */}
      {isSetup && setupData && (
        <div className="p-4 rounded-xl bg-defense-900 border border-slate-800 text-center space-y-3">
          <div className="inline-block p-3 bg-white rounded-xl shadow-lg">
            <img src={setupData.qrCodeDataUrl} alt="2FA QR Code" className="w-44 h-44 mx-auto" />
          </div>
          <div className="text-[11px] font-mono text-slate-400 space-y-1">
            <div>Manual Entry Key:</div>
            <div className="bg-defense-950 p-2 rounded text-emerald-300 select-all break-all border border-slate-800">
              {setupData.secret}
            </div>
          </div>
        </div>
      )}

      {/* Manual Helper for Seed Testing */}
      {passedSecret && !isSetup && (
        <div className="p-3 bg-defense-900/80 rounded-xl border border-slate-800 text-xs font-mono space-y-1 text-slate-400">
          <div className="flex items-center justify-between">
            <span className="text-slate-300">Seed Authenticator Secret:</span>
            <span className="text-[10px] text-cyan-400">Testing Mode</span>
          </div>
          <div className="text-emerald-400 break-all bg-defense-950 p-1.5 rounded text-[11px] select-all">
            {passedSecret}
          </div>
        </div>
      )}

      <form onSubmit={handleVerify} className="space-y-4">
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              6-Digit Verification Code
            </label>
            <button
              type="button"
              onClick={async () => {
                const code = await generateClientTotp(passedSecret || 'JBSWY3DPEHPK3PXP');
                setTotpCode(code);
              }}
              className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 bg-cyan-950/80 hover:bg-cyan-900/80 px-2 py-0.5 rounded border border-cyan-500/30 transition-colors flex items-center gap-1"
            >
              <Sparkles className="w-3 h-3 text-cyan-400" />
              <span>⚡ Auto-Generate Live TOTP Code</span>
            </button>
          </div>
          <Input
            type="text"
            maxLength={6}
            icon={KeyRound}
            placeholder="000000"
            className="text-center font-mono text-2xl tracking-[0.3em] text-cyan-300"
            value={totpCode}
            onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
            required
            autoFocus
          />
        </div>

        <Button
          type="submit"
          variant="emerald"
          icon={ArrowRight}
          isLoading={loading || loadingSetup}
          className="w-full"
        >
          {isSetup ? 'Activate 2FA & Enter Vault' : 'Confirm Security Token & Access Vault'}
        </Button>
      </form>
    </div>
  );
}
