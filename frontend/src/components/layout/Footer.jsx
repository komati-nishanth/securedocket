import React from 'react';
import { Shield, Lock } from 'lucide-react';

export function Footer() {
  return (
    <footer className="border-t border-slate-800/80 bg-defense-950 py-3.5 px-6 text-xs text-slate-400 flex flex-col md:flex-row items-center justify-between gap-3">
      <div className="flex items-center gap-2">
        <Shield className="w-4 h-4 text-cyan-500 shrink-0" />
        <span>SIH 26190: System establishes integrity of records and actions after intake</span>
      </div>
      <div className="flex items-center gap-4 text-[11px] font-mono flex-wrap justify-center">
        <span className="flex items-center gap-1 text-slate-400">
          <Lock className="w-3 h-3 text-emerald-400" />
          Zero Raw Files in DB (SSE-S3)
        </span>
        <span className="text-slate-700">•</span>
        <span>SHA-256 Chained Audits</span>
        <span className="text-slate-700">•</span>
        <span className="text-amber-400/90 font-semibold">External Gateways: Mock / Future Integration</span>
      </div>
    </footer>
  );
}
