import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Briefcase,
  FileText,
  Clock,
  Plus,
  ArrowUpRight,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  User,
  Search,
} from 'lucide-react';
import { Card } from '../../../components/common/Card';
import { Badge } from '../../../components/common/Badge';
import { Button } from '../../../components/common/Button';
import { Spinner } from '../../../components/common/Spinner';
import { caseService } from '../../../services/caseService';

export function OfficerDashboard({ user }) {
  const [stats, setStats] = useState(null);
  const [cases, setCases] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadOfficerData() {
      try {
        const [statsRes, casesRes] = await Promise.all([
          caseService.getCaseStatistics(),
          caseService.getCases({ limit: 5 }),
        ]);
        setStats(statsRes.data);
        setCases(casesRes.data || []);
      } catch (err) {
        console.error('Failed to load officer dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadOfficerData();
  }, []);

  if (loading) {
    return (
      <div className="py-24 text-center">
        <Spinner size="lg" />
      </div>
    );
  }

  const statCards = [
    {
      title: 'Assigned Active Cases',
      value: stats?.activeInvestigations || 0,
      change: 'Under Active Investigation',
      icon: Briefcase,
      color: 'text-cyan-400',
      bg: 'bg-cyan-950/40 border-cyan-500/30',
    },
    {
      title: 'Pending Trial Dossiers',
      value: stats?.pendingTrial || 0,
      change: 'Evidence Finalized',
      icon: CheckCircle2,
      color: 'text-emerald-400',
      bg: 'bg-emerald-950/40 border-emerald-500/30',
    },
    {
      title: 'High / Critical Priority',
      value: (stats?.byPriority?.high || 0) + (stats?.byPriority?.critical || 0),
      change: 'Requires Immediate Action',
      icon: AlertCircle,
      color: 'text-rose-400',
      bg: 'bg-rose-950/40 border-rose-500/30',
    },
    {
      title: 'Total Assigned Docket',
      value: stats?.total || 0,
      change: 'Authorized Clearance',
      icon: ShieldCheck,
      color: 'text-indigo-400',
      bg: 'bg-indigo-950/40 border-indigo-500/30',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Officer Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-defense-900 to-defense-950 border border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-cyan-400 text-xs font-mono font-semibold mb-1">
            <ShieldCheck className="w-4 h-4" />
            <span>INVESTIGATING OFFICER COMMAND CONSOLE</span>
          </div>
          <h2 className="text-xl font-bold text-slate-100">
            Welcome, {user?.name || 'Officer'}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5 font-mono">
            Badge ID: <span className="text-slate-200">{user?.badgeNumber || 'CCB-9842'}</span> • Unit:{' '}
            <span className="text-slate-200">{user?.department || 'Central Cyber Crime Police Station'}</span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link to="/dashboard/cases">
            <Button variant="primary" icon={Plus} size="sm">
              Register New Crime Case
            </Button>
          </Link>
        </div>
      </div>

      {/* SIH Demonstration Experience Hub */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-defense-900 to-indigo-950/40 border border-cyan-500/30 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
            <span className="text-xs font-mono font-bold text-cyan-300 uppercase tracking-wider">
              SIH-26190 Judge Evaluation Scenario: "Operation Phantom Vault"
            </span>
          </div>
          <span className="text-[10px] font-mono text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-500/30">
            External Gateways: Mock / Future Integration
          </span>
        </div>
        <p className="text-xs text-slate-300">
          <strong>"The system establishes integrity of records and actions after intake."</strong> Follow the 19-step guided walkthrough below or use the floating <strong>SIH Judge Demo Guide</strong> in the bottom-right corner to test evidence upload, SHA-256 pre-hashing, OCR confidence scoring, human-in-the-loop review, and immutable hash-chain validation.
        </p>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((stat, i) => {
          const Icon = stat.icon;
          return (
            <div key={i} className={`glass-panel p-5 rounded-2xl border ${stat.bg} space-y-2`}>
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-400">{stat.title}</span>
                <Icon className={`w-5 h-5 ${stat.color}`} />
              </div>
              <div className="text-2xl font-bold text-slate-100 font-mono">{stat.value}</div>
              <div className="text-[11px] text-slate-400 flex items-center gap-1 font-mono">
                <span>{stat.change}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Main Grid: Assigned Cases & Investigation Checklist */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Assigned Case Dossiers */}
        <div className="lg:col-span-2">
          <Card
            title="My Assigned Active Cases"
            subtitle="Case dossiers under your immediate lead or assigned investigation"
            action={
              <Link to="/dashboard/cases">
                <Button variant="ghost" size="sm" className="text-xs text-cyan-400">
                  View Full Registry →
                </Button>
              </Link>
            }
          >
            {cases.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">No cases currently assigned.</div>
            ) : (
              <div className="space-y-3">
                {cases.map((c) => (
                  <Link
                    key={c._id}
                    to={`/dashboard/cases/${c._id}`}
                    className="p-4 rounded-xl bg-defense-900/60 border border-slate-800/80 hover:border-cyan-500/40 hover:bg-defense-900/90 transition-all flex items-center justify-between group block"
                  >
                    <div className="space-y-1.5 max-w-[80%]">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold text-cyan-400 group-hover:text-cyan-300">
                          {c.caseNumber}
                        </span>
                        <Badge
                          variant={
                            c.status === 'open'
                              ? 'cyan'
                              : c.status === 'under_investigation'
                              ? 'pending'
                              : 'verified'
                          }
                          size="xs"
                        >
                          {c.status.replace('_', ' ')}
                        </Badge>
                        <Badge
                          variant={c.metadata?.priority === 'critical' ? 'tampered' : 'default'}
                          size="xs"
                        >
                          {c.metadata?.priority}
                        </Badge>
                      </div>
                      <div className="text-xs font-semibold text-slate-200 truncate">{c.title}</div>
                      <div className="text-[11px] text-slate-400 truncate">{c.jurisdiction}</div>
                    </div>
                    <div className="text-right space-y-1">
                      <div className="text-xs font-mono text-slate-300">
                        {c.documentsCount || 0} Docs
                      </div>
                      <span className="text-xs font-mono text-cyan-400 flex items-center justify-end gap-1 group-hover:translate-x-1 transition-transform">
                        Open <ArrowUpRight className="w-3.5 h-3.5" />
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Right 1 Col: Pending Investigative Tasks */}
        <div>
          <Card title="Pending Investigation Tasks" subtitle="Forensic and evidence deadlines">
            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl bg-defense-900/80 border border-slate-800 space-y-1">
                <div className="flex items-center justify-between font-semibold text-slate-200">
                  <span>FIR Certified Copy Upload</span>
                  <span className="text-rose-400 text-[10px] font-mono">PRIORITY</span>
                </div>
                <p className="text-slate-400 text-[11px]">CR/2026/0891-BLR (Cyber Heist)</p>
                <div className="text-[10px] text-slate-500 font-mono">Due: Today, 18:00 IST</div>
              </div>

              <div className="p-3 rounded-xl bg-defense-900/80 border border-slate-800 space-y-1">
                <div className="flex items-center justify-between font-semibold text-slate-200">
                  <span>Ballistics Verification Review</span>
                  <span className="text-amber-400 text-[10px] font-mono">CFSL LAB</span>
                </div>
                <p className="text-slate-400 text-[11px]">CR/2026/0877-DEL (Narcotics)</p>
                <div className="text-[10px] text-slate-500 font-mono">Awaiting Dr. Neha Sharma</div>
              </div>

              <div className="p-3 rounded-xl bg-defense-900/80 border border-slate-800 space-y-1">
                <div className="flex items-center justify-between font-semibold text-slate-200">
                  <span>Audit Chain Sealed</span>
                  <span className="text-emerald-400 text-[10px] font-mono">VERIFIED</span>
                </div>
                <p className="text-slate-400 text-[11px]">SHA-256 Ledger sync active</p>
                <div className="text-[10px] text-emerald-400 font-mono">Zero Tamper Alerts</div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
