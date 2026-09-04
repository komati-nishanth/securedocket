import React from 'react';
import { Link } from 'react-router-dom';
import { Shield, Lock, FileCheck, Search, KeyRound, ArrowRight, CheckCircle2, ShieldAlert } from 'lucide-react';
import { Button } from '../components/common/Button';

export function Landing() {
  return (
    <div className="min-h-screen bg-defense-950 text-slate-100 flex flex-col justify-between">
      {/* Top Banner */}
      <header className="border-b border-slate-800/80 bg-defense-900/60 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-900/30">
            <Shield className="w-6 h-6 text-white" />
          </div>
          <div>
            <span className="text-base font-bold tracking-wide text-white">DIGITAL CASE VAULT</span>
            <span className="text-xs font-mono text-cyan-400 block">SIH 26190</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <Link to="/login">
            <Button variant="primary" icon={ArrowRight}>
              Secure Officer Portal
            </Button>
          </Link>
        </div>
      </header>

      {/* Hero Section */}
      <main className="max-w-6xl mx-auto px-6 py-16 flex-1 flex flex-col justify-center items-center text-center space-y-8">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cyan-950/80 border border-cyan-500/30 text-xs font-mono text-cyan-300">
          <ShieldAlert className="w-4 h-4 text-cyan-400" />
          GOVERNMENT & LAW ENFORCEMENT DIGITAL EVIDENCE REPOSITORY
        </div>

        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-slate-100 max-w-4xl leading-tight">
          Secure, Tamper-Evident Document Management for Legal Investigations
        </h1>

        <p className="text-base md:text-lg text-slate-400 max-w-2xl leading-relaxed">
          Engineered for courts, police departments, and forensic labs. Features cryptographic hash-chain auditability, server-side Gemini Vision OCR, vector search, and zero raw file storage in databases.
        </p>

        <div className="flex flex-wrap items-center justify-center gap-4 pt-4">
          <Link to="/login">
            <Button size="lg" variant="primary" icon={ArrowRight}>
              Access Case Repository
            </Button>
          </Link>
          <Link to="/dashboard">
            <Button size="lg" variant="secondary">
              Open Dashboard Preview
            </Button>
          </Link>
        </div>

        {/* Honest Scope Disclosure */}
        <div className="p-4 rounded-2xl bg-defense-900/80 border border-cyan-500/30 max-w-3xl text-left space-y-1">
          <div className="text-xs font-mono text-cyan-300 font-bold flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-cyan-400" />
            <span>Core Integrity Guarantee:</span>
          </div>
          <p className="text-xs text-slate-300">
            <strong>"The system establishes integrity of records and actions after intake."</strong> Real-world authenticity before upload is outside the system's verification scope.
          </p>
        </div>

        {/* Core Architectural Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-6 text-left w-full">
          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-950 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Lock className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-100">SSE-S3 Storage Vault</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Files are encrypted at rest with AES-256 on AWS S3. MongoDB Atlas stores only cryptographic metadata and SHA-256 hashes, eliminating database bloat and raw file exposure.
            </p>
          </div>

          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-950 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <FileCheck className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-100">Cryptographic Audit Chain</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Pure SHA-256 sequential block ledger (zero blockchain overhead). Every upload, verification, and view event is sealed with <code className="text-cyan-300">previousHash</code> verification.
            </p>
          </div>

          <div className="glass-panel p-6 rounded-2xl border border-slate-800 space-y-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-950 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Search className="w-5 h-5" />
            </div>
            <h3 className="text-base font-bold text-slate-100">AI OCR & Vector Search</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Automated entity extraction from FIRs and statements powered by Google Gemini 2.5 Flash Vision. Semantic embeddings enable cross-referencing across case dossiers.
            </p>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-defense-900/40 py-4 px-6 text-center text-xs font-mono text-slate-400 flex flex-col sm:flex-row items-center justify-between gap-2">
        <span>SIH 26190 Demonstration Environment • 100% Synthetic Demo Data</span>
        <span className="text-amber-400/90 font-semibold">External Law Enforcement Gateways: Mock / Future Integration</span>
      </footer>
    </div>
  );
}
