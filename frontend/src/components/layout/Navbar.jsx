import React, { useState, useEffect } from 'react';
import { Shield, Lock, LogOut, User as UserIcon, Bell } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { Badge } from '../common/Badge';
import { StatusIndicator } from '../common/StatusIndicator';

export function Navbar() {
  const { user, logout } = useAuth();
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return (
    <header className="sticky top-0 z-40 flex flex-col border-b border-slate-800/80 bg-defense-950/95 backdrop-blur-md">
      {/* High-Security GovTech Classification Banner */}
      <div className="w-full bg-gradient-to-r from-blue-950 via-slate-900 to-blue-950 py-1 px-4 border-b border-cyan-500/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lock className="w-3 h-3 text-cyan-400" />
          <span className="text-[10px] font-mono tracking-widest uppercase font-semibold text-cyan-300">
            OFFICIAL LAW ENFORCEMENT & JUDICIAL INTEGRITY VAULT
          </span>
        </div>
        <div className="text-[10px] font-mono text-cyan-400 font-bold flex items-center gap-1.5 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-500/30">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
          <span>SIH-26190 EVALUATION MODE</span>
        </div>
      </div>

      {/* Main App Bar */}
      <div className="flex items-center justify-between px-6 py-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-900/30">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-sm font-bold tracking-wide text-slate-100 flex items-center gap-2">
              DIGITAL CASE VAULT <span className="text-[10px] font-mono text-cyan-400 font-normal">SIH-26190</span>
            </h1>
            <p className="text-[11px] text-slate-400 font-mono">
              E-COURTS & INVESTIGATION INTEGRITY PLATFORM
            </p>
          </div>
        </div>

        <div className="flex items-center gap-5">
          {/* Live Clock and Connection Status */}
          <div className="hidden md:flex items-center gap-3 text-xs font-mono text-slate-400 bg-defense-900/80 px-3 py-1.5 rounded-lg border border-slate-800">
            <StatusIndicator status="healthy" label="GATEWAY ONLINE" />
            <span className="text-slate-600">|</span>
            <span className="text-slate-300">
              {time.toLocaleTimeString('en-US', { hour12: false })} IST
            </span>
          </div>

          {/* User Profile & Role Info */}
          {user && (
            <div className="flex items-center gap-3">
              <div className="text-right hidden sm:block">
                <div className="text-xs font-semibold text-slate-200">{user.name}</div>
                <div className="flex items-center justify-end gap-1.5 mt-0.5">
                  <Badge variant="cyan" size="xs">
                    {user.role}
                  </Badge>
                  {user.badgeNumber && (
                    <span className="text-[10px] font-mono text-slate-400">{user.badgeNumber}</span>
                  )}
                </div>
              </div>

              <div className="w-8 h-8 rounded-lg bg-defense-800 border border-slate-700 flex items-center justify-center text-slate-300">
                <UserIcon className="w-4 h-4" />
              </div>

              <button
                onClick={logout}
                title="End Secure Session"
                className="p-2 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 border border-transparent hover:border-rose-900/50 transition-all"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
