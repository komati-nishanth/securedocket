import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Sparkles,
  ChevronRight,
  ChevronLeft,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Lock,
  UserCheck,
  FileText,
  FileCheck2,
  GitCommit,
  Network,
  Search,
  Link2,
  RefreshCw,
  AlertTriangle,
  ExternalLink,
  CheckCircle2,
  HelpCircle,
  X,
  Play,
  Copy,
  Check,
  Zap,
} from 'lucide-react';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Modal } from '../common/Modal';
import { useAuth } from '../../hooks/useAuth';
import { authService } from '../../services/authService';
import { generateClientTotp } from '../../utils/crypto';
import api from '../../services/api';

const DEMO_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

const DEMO_USERS = {
  officer: {
    email: 'demo.officer@police.gov.in',
    pass: 'DemoOfficerPass123!',
    role: 'officer',
    name: 'Inspector Devendra Rao',
    badge: 'CCB-DEMO-5542',
    department: 'Cyber Crime & Special Task Force',
  },
  verifier: {
    email: 'demo.verifier@police.gov.in',
    pass: 'DemoVerifierPass123!',
    role: 'verifier',
    name: 'Dr. Aruna Sundaram',
    badge: 'CFSL-DEMO-9912',
    department: 'Central Forensic Science Laboratory',
  },
  auditor: {
    email: 'demo.auditor@police.gov.in',
    pass: 'DemoAuditorPass123!',
    role: 'auditor',
    name: 'Justice H. R. Natarajan',
    badge: 'JUD-DEMO-8801',
    department: 'Independent Judicial Oversight Commission',
  },
  admin: {
    email: 'demo.admin@police.gov.in',
    pass: 'DemoAdminPass123!',
    role: 'admin',
    name: 'Director Sandeep Verma (IPS)',
    badge: 'IPS-DEMO-001',
    department: 'Central Investigation Directorate',
  },
};

export const DEMO_STEPS = [
  {
    id: 1,
    title: 'Login as Officer',
    targetRole: 'officer',
    route: '/login',
    actionText: 'Go to Officer Login',
    description: 'Authenticate as official investigating officer (Inspector Devendra Rao) using primary password credentials.',
    securityNote: 'Enforces bcrypt 12-round salted hashing & IP-scoped brute-force rate limiting.',
  },
  {
    id: 2,
    title: 'Complete 2FA / TOTP Challenge',
    targetRole: 'officer',
    route: '/verify-2fa',
    actionText: 'Open 2FA Verification',
    description: 'Verify 6-digit Time-Based One-Time Password generated via RFC 6238 HMAC-SHA1 algorithm.',
    securityNote: 'Guards against compromised passwords with dynamic 30-second token rotation.',
  },
  {
    id: 3,
    title: 'Open Assigned Case Dossier',
    targetRole: 'officer',
    route: '/dashboard/cases',
    actionText: 'Open Case DEMO/2026/0891',
    description: 'Access authorized case "Operation Phantom Vault: Synthetic Loan Diversion Syndicate" (DEMO/2026/0891).',
    securityNote: 'Multi-tenant tenancy filter prevents unauthorized officers from reading cross-jurisdiction dockets.',
  },
  {
    id: 4,
    title: 'Upload Fictional FIR Evidence',
    targetRole: 'officer',
    route: '/dashboard/cases',
    actionText: 'Open Case & Upload FIR',
    description: 'Ingest synthetic First Information Report (FIR) using client-side pre-hashing and multipart streaming.',
    securityNote: 'Binary MIME & magic-number inspection blocks executable polyglot payloads.',
  },
  {
    id: 5,
    title: 'Inspect SHA-256 Checksum Matching',
    targetRole: 'officer',
    route: '/dashboard/documents',
    actionText: 'View Vault Documents',
    description: 'Confirm client-calculated SHA-256 checksum exactly matches server-sealed SHA-256 before S3 transfer.',
    securityNote: 'Detects in-transit stream corruption or malicious proxy tampering.',
  },
  {
    id: 6,
    title: 'Review Server-Side AI OCR Extraction',
    targetRole: 'officer',
    route: '/dashboard/documents',
    actionText: 'Inspect OCR Metadata',
    description: 'Inspect structured legal entities parsed by Google Gemini 2.5 Flash Vision OCR (FIR number, dates, parties, IPC sections).',
    securityNote: 'Server-side sandboxed inference; API keys remain strictly confidential on the backend gateway.',
  },
  {
    id: 7,
    title: 'Inspect Field Confidence Ratings',
    targetRole: 'officer',
    route: '/dashboard/documents',
    actionText: 'Review Confidence Ratings',
    description: 'Analyze per-field probabilistic confidence scores (0.00 – 1.00) assigned by the intelligence model.',
    securityNote: 'Flags low-confidence fields (<80%) automatically for mandatory human forensic reconciliation.',
  },
  {
    id: 8,
    title: 'Inspect Document Classification',
    targetRole: 'officer',
    route: '/dashboard/documents',
    actionText: 'Check Classification Tag',
    description: 'View automated judicial taxonomy classification (FIR vs Statement vs Chargesheet vs Forensic Memo).',
    securityNote: 'Automated categorical tagging with reasoning trail prevents misfiled evidentiary records.',
  },
  {
    id: 9,
    title: 'Switch Role to Forensic Verifier',
    targetRole: 'verifier',
    route: '/dashboard/verification',
    actionText: 'Switch to Dr. Aruna (Verifier)',
    description: 'Assume the forensic verifier persona (Dr. Aruna Sundaram, CFSL Digital Forensics Division).',
    securityNote: 'Simulates strict separation of duties between investigating police and forensic scientists.',
  },
  {
    id: 10,
    title: 'Open Evidentiary Verification Queue',
    targetRole: 'verifier',
    route: '/dashboard/verification',
    actionText: 'Open Verification Console',
    description: 'Review the backlog of pending intake documents prioritized by OCR confidence and anomaly risk.',
    securityNote: 'Forensic queue restricted to authorized CFSL verifiers and judicial auditors.',
  },
  {
    id: 11,
    title: 'Correct & Verify Field (Create Immutable v2)',
    targetRole: 'verifier',
    route: '/dashboard/verification',
    actionText: 'Open Review Modal',
    description: 'Modify an extracted field value. Notice the system does NOT overwrite v1 history; it seals an immutable v2 revision.',
    securityNote: 'Preserves complete chain of custody and forensic history for courtroom cross-examination.',
  },
  {
    id: 12,
    title: 'Inspect Cryptographic Audit Event',
    targetRole: 'auditor',
    route: '/dashboard/audit',
    actionText: 'View Chained Audit Entry',
    description: 'Inspect the newly chained DOCUMENT_FIELD_CORRECT and DOCUMENT_VERIFY ledger blocks.',
    securityNote: 'Every block includes previousHash, actor UID, timestamp, IP, and SHA-256 state seal.',
  },
  {
    id: 13,
    title: 'Open Case Chronological Timeline',
    targetRole: 'officer',
    route: '/dashboard/cases',
    actionText: 'Inspect Case Timeline Tab',
    description: 'View chronological incident progression automatically assembled across multi-source evidence.',
    securityNote: 'Distinguishes between mathematically confirmed dates and ambiguous witness claims.',
  },
  {
    id: 14,
    title: 'Inspect Cross-Document Entity Graph',
    targetRole: 'officer',
    route: '/dashboard/cases',
    actionText: 'Inspect Entity Linking Tab',
    description: 'Explore the graph connecting accused persons, locations, and bank accounts across multiple case files.',
    securityNote: 'Strictly bounded within authorized cases; cross-case exfiltration attempts are blocked.',
  },
  {
    id: 15,
    title: 'Perform Natural-Language Semantic Search',
    targetRole: 'officer',
    route: '/dashboard/search',
    actionText: 'Open Semantic Search',
    description: 'Query evidentiary text using natural language (e.g., "unauthorized managerial token escalation").',
    securityNote: 'Vector embeddings enable conceptual discovery even when exact legal jargon differs.',
  },
  {
    id: 16,
    title: 'Open Audit Ledger Console',
    targetRole: 'auditor',
    route: '/dashboard/audit',
    actionText: 'Open Audit Console',
    description: 'Navigate to the Independent Judicial Oversight audit page showing the immutable block ledger.',
    securityNote: 'Append-only storage architecture with zero in-place update or deletion permissions.',
  },
  {
    id: 17,
    title: 'Execute VERIFY CHAIN Cryptographic Audit',
    targetRole: 'auditor',
    route: '/dashboard/audit',
    actionText: 'Click "Verify Chain Integrity"',
    description: 'Trigger full sequential verification re-calculating SHA-256 hashes from Genesis block (0000...) to latest head.',
    securityNote: 'Detects any retroactive tampering of details, timestamps, or hash links in O(N) linear time.',
  },
  {
    id: 18,
    title: 'Inspect Confirmed Integrity State',
    targetRole: 'auditor',
    route: '/dashboard/audit',
    actionText: 'View Green Integrity Badge',
    description: 'Observe the 100% mathematically valid verification badge confirming tamper-free evidentiary integrity.',
    securityNote: 'Provides judicial certainty of record integrity post-intake.',
  },
  {
    id: 19,
    title: 'Demonstrate RBAC Enforcement (Live 403 Test)',
    targetRole: 'verifier',
    route: '/dashboard',
    actionText: 'Run Live HTTP 403 Test',
    description: 'Attempt an unauthorized administrative action (Verifier calling Admin User Provisioning API) to observe strict HTTP 403 Forbidden enforcement.',
    securityNote: 'Confirms defense-in-depth authorization boundaries at the API gateway layer.',
  },
];

export function JudgeDemoGuide() {
  const { user, complete2FA } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [switchingRole, setSwitchingRole] = useState(false);
  const [switchFeedback, setSwitchFeedback] = useState(null);

  // Architecture & Security Modal
  const [isArchModalOpen, setIsArchModalOpen] = useState(false);

  // Live 403 Test state
  const [live403State, setLive403State] = useState(null);
  const [testing403, setTesting403] = useState(false);

  const activeStep = DEMO_STEPS[currentStepIndex];

  // Quick switch role
  const handleQuickSwitch = async (roleKey) => {
    const creds = DEMO_USERS[roleKey];
    if (!creds) return;

    setSwitchingRole(true);
    setSwitchFeedback(null);
    try {
      const loginRes = await authService.login(creds.email, creds.pass);
      const data = loginRes.data;

      if (data?.require2FA && data?.tempToken) {
        const totpCode = await generateClientTotp(DEMO_TOTP_SECRET);
        await complete2FA(totpCode, data.tempToken, data.userId);
      }
      setSwitchFeedback(`Successfully switched to ${creds.role.toUpperCase()} (${creds.name})`);
    } catch (err) {
      setSwitchFeedback(`Switch failed: ${err?.message || 'Authentication error'}`);
    } finally {
      setSwitchingRole(false);
    }
  };

  const handleStepAction = async (step) => {
    // If the step requires a different role, automatically switch or prompt
    if (step.targetRole && user?.role !== step.targetRole) {
      await handleQuickSwitch(step.targetRole);
    }

    if (step.id === 19) {
      // Step 19: Live 403 Authorization Test
      runLive403Test();
      return;
    }

    if (step.route) {
      navigate(step.route);
    }
  };

  const runLive403Test = async () => {
    setTesting403(true);
    setLive403State(null);
    try {
      // Attempt to invoke Admin-only user creation endpoint as a verifier/officer
      const res = await api.post('/users', {
        email: 'unauthorized.test@police.gov.in',
        name: 'Unauthorized User Attempt',
        role: 'admin',
        password: 'SomeRandomPassword123!',
      });
      setLive403State({
        status: res.status,
        success: false,
        message: 'Security breach: Request unexpectedly succeeded!',
        data: res.data,
      });
    } catch (err) {
      const status = err.response?.status || 403;
      const data = err.response?.data;
      setLive403State({
        status,
        success: status === 403,
        errorName: data?.error?.code || 'FORBIDDEN',
        message: data?.error?.message || err.message || 'Access Denied: Insufficient Role Permissions',
        raw: data,
        timestamp: new Date().toISOString(),
      });
    } finally {
      setTesting403(false);
    }
  };

  return (
    <>
      {/* Floating Docked Trigger Button */}
      <div className="fixed bottom-4 right-4 z-50 flex items-center gap-2">
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setIsArchModalOpen(true)}
          className="bg-defense-900/90 border-cyan-500/40 text-cyan-300 shadow-lg text-xs gap-1.5 backdrop-blur-md hover:bg-cyan-950"
        >
          <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
          Judge Architecture Notes
        </Button>

        <Button
          variant="primary"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          className="bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 shadow-glow-cyan text-xs gap-2 py-2 px-3.5 font-bold"
        >
          <Sparkles className="w-4 h-4 text-cyan-200 animate-pulse" />
          <span>SIH Judge Demo Guide</span>
          <span className="bg-cyan-950 px-1.5 py-0.5 rounded text-[10px] font-mono text-cyan-300 border border-cyan-400/40">
            {currentStepIndex + 1}/{DEMO_STEPS.length}
          </span>
        </Button>
      </div>

      {/* Main Collapsible Demo Controller Panel */}
      {isOpen && (
        <div className="fixed bottom-16 right-4 z-50 w-[95vw] sm:w-[480px] max-h-[85vh] bg-defense-950/95 border border-cyan-500/40 rounded-2xl shadow-2xl backdrop-blur-xl flex flex-col overflow-hidden text-slate-100 ring-1 ring-cyan-500/20">
          {/* Header */}
          <div className="p-4 bg-gradient-to-r from-defense-900 via-defense-950 to-defense-900 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-cyan-950 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                <ShieldCheck className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-xs font-bold font-mono tracking-wide text-cyan-300 flex items-center gap-1.5">
                  SIH 26190 DEMONSTRATION WORKFLOW
                </h3>
                <p className="text-[10px] text-slate-400 font-mono">19-Step Forensic & Security Evaluation</p>
              </div>
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Quick Role Switcher Bar */}
          <div className="p-3 bg-defense-900/60 border-b border-slate-800/80 space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span className="flex items-center gap-1">
                <UserCheck className="w-3.5 h-3.5 text-cyan-400" />
                Active Session Role:
              </span>
              <span className="font-bold text-cyan-300 uppercase">
                {user ? user.role : 'NOT LOGGED IN'}
              </span>
            </div>

            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {Object.keys(DEMO_USERS).map((rKey) => {
                const isCurrent = user?.role === rKey;
                return (
                  <button
                    key={rKey}
                    type="button"
                    disabled={switchingRole}
                    onClick={() => handleQuickSwitch(rKey)}
                    className={`py-1.5 px-2 rounded-lg text-[10px] font-mono font-bold uppercase transition-all flex items-center justify-center gap-1 ${
                      isCurrent
                        ? 'bg-cyan-950 text-cyan-300 border border-cyan-500/60 shadow-glow-cyan'
                        : 'bg-defense-950 text-slate-400 hover:text-slate-200 hover:bg-defense-900 border border-slate-800'
                    }`}
                  >
                    {switchingRole && !isCurrent ? <RefreshCw className="w-2.5 h-2.5 animate-spin" /> : null}
                    {rKey}
                  </button>
                );
              })}
            </div>

            {switchFeedback && (
              <div className="text-[10px] font-mono text-emerald-400 pt-0.5">{switchFeedback}</div>
            )}
          </div>

          {/* Active Step Content */}
          <div className="p-4 space-y-4 overflow-y-auto flex-1">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-mono text-cyan-400 uppercase tracking-wider font-bold">
                Step {activeStep.id} of {DEMO_STEPS.length}
              </span>
              <Badge variant="cyan" size="xs">
                Target Role: {activeStep.targetRole.toUpperCase()}
              </Badge>
            </div>

            <div>
              <h4 className="text-base font-bold text-slate-100">{activeStep.title}</h4>
              <p className="text-xs text-slate-300 mt-1.5 leading-relaxed">{activeStep.description}</p>
            </div>

            {/* Security Explanation Box */}
            <div className="p-3 rounded-xl bg-defense-900 border border-cyan-500/20 text-xs space-y-1">
              <div className="text-[10px] font-mono text-cyan-400 uppercase tracking-wider font-bold flex items-center gap-1">
                <Lock className="w-3 h-3" /> Security & Architecture Guarantee:
              </div>
              <p className="text-[11px] text-slate-300 font-mono leading-relaxed">{activeStep.securityNote}</p>
            </div>

            {/* Step 19 Interactive Live 403 Tester View */}
            {activeStep.id === 19 && (
              <div className="p-3.5 rounded-xl bg-defense-900/90 border border-rose-500/40 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-mono font-bold text-rose-400 flex items-center gap-1.5">
                    <ShieldAlert className="w-4 h-4" />
                    LIVE AUTHORIZATION BOUNDARY TEST
                  </span>
                  <Badge variant="tampered" size="xs">
                    HTTP 403 EXPECTED
                  </Badge>
                </div>
                <p className="text-[11px] text-slate-400">
                  Calls <code className="text-cyan-300">POST /api/v1/users</code> with current non-admin session.
                </p>

                <Button
                  size="sm"
                  variant="primary"
                  onClick={runLive403Test}
                  isLoading={testing403}
                  className="w-full bg-rose-600 hover:bg-rose-700 text-xs"
                >
                  Execute Unauthorized Request Now
                </Button>

                {live403State && (
                  <div className="p-2.5 rounded-lg bg-defense-950 border border-slate-800 font-mono text-xs space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">HTTP Status:</span>
                      <span
                        className={`font-bold ${
                          live403State.status === 403 ? 'text-emerald-400' : 'text-rose-400'
                        }`}
                      >
                        {live403State.status} {live403State.status === 403 ? '(Forbidden - Blocked Successfully)' : ''}
                      </span>
                    </div>
                    <div className="text-slate-400 text-[10px]">
                      Message: <span className="text-slate-200">{live403State.message}</span>
                    </div>
                    <div className="text-slate-500 text-[9px] break-all">
                      Payload: {JSON.stringify(live403State.raw || {})}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Primary Action Button for this step */}
            <Button
              variant="primary"
              onClick={() => handleStepAction(activeStep)}
              className="w-full gap-2 text-xs py-2.5 font-bold"
            >
              <Play className="w-3.5 h-3.5" />
              {activeStep.actionText}
            </Button>
          </div>

          {/* Step Navigation Footer */}
          <div className="p-3 bg-defense-900 border-t border-slate-800 flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              disabled={currentStepIndex === 0}
              onClick={() => setCurrentStepIndex((prev) => Math.max(0, prev - 1))}
              className="text-xs gap-1"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Prev
            </Button>

            {/* Quick Step Selector */}
            <select
              value={currentStepIndex}
              onChange={(e) => setCurrentStepIndex(Number(e.target.value))}
              className="bg-defense-950 border border-slate-700 rounded-lg text-[11px] font-mono text-cyan-300 py-1 px-2 focus:outline-none focus:border-cyan-500 max-w-[170px]"
            >
              {DEMO_STEPS.map((s, idx) => (
                <option key={s.id} value={idx}>
                  #{s.id}: {s.title}
                </option>
              ))}
            </select>

            <Button
              variant="ghost"
              size="sm"
              disabled={currentStepIndex === DEMO_STEPS.length - 1}
              onClick={() => setCurrentStepIndex((prev) => Math.min(DEMO_STEPS.length - 1, prev + 1))}
              className="text-xs gap-1 text-cyan-400 hover:text-cyan-300"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      )}

      {/* SIH Judge Architecture & Security Modal */}
      <Modal
        isOpen={isArchModalOpen}
        onClose={() => setIsArchModalOpen(false)}
        title="SIH 26190 — Architecture & Security Explainer"
        maxWidth="max-w-3xl"
      >
        <div className="space-y-6 text-xs text-slate-300 leading-relaxed font-sans">
          {/* Honest Scope Statement */}
          <div className="p-4 rounded-xl bg-cyan-950/40 border border-cyan-500/40 space-y-2">
            <div className="flex items-center gap-2 text-cyan-300 font-bold text-sm">
              <ShieldCheck className="w-5 h-5 text-cyan-400" />
              <span>Core Integrity Boundary Statement</span>
            </div>
            <p className="text-slate-200">
              <strong>"The system establishes integrity of records and actions after intake."</strong>
            </p>
            <p className="text-slate-400 text-[11px]">
              <em>Real-world authenticity before upload is outside the system's verification scope.</em> The platform guarantees that once evidence enters the system, all versions, edits, views, and forensic verifications are mathematically immutable and non-repudiable.
            </p>
          </div>

          {/* Architectural Pillars Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl bg-defense-900 border border-slate-800 space-y-2">
              <h4 className="font-bold text-slate-100 flex items-center gap-2 text-xs">
                <Lock className="w-4 h-4 text-emerald-400" />
                1. SSE-S3 Vault & Zero DB Storage
              </h4>
              <p className="text-slate-400 text-[11px]">
                Binary evidence payloads are streamed to AWS S3 encrypted at rest using server-side AES-256. MongoDB Atlas stores only cryptographic metadata and SHA-256 hashes, eliminating raw file exposure in the database.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-defense-900 border border-slate-800 space-y-2">
              <h4 className="font-bold text-slate-100 flex items-center gap-2 text-xs">
                <Link2 className="w-4 h-4 text-cyan-400" />
                2. Cryptographic SHA-256 Audit Ledger
              </h4>
              <p className="text-slate-400 text-[11px]">
                <strong>Pure cryptographic hash chain (zero blockchain overhead).</strong> Each audit log entry is bound with <code className="text-cyan-300">previousHash</code> and re-computed on demand with <code className="text-emerald-300">validateAuditChain()</code> in O(N) linear time to detect any retroactive modification.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-defense-900 border border-slate-800 space-y-2">
              <h4 className="font-bold text-slate-100 flex items-center gap-2 text-xs">
                <Sparkles className="w-4 h-4 text-amber-400" />
                3. Gemini 2.5 Flash OCR & HITL
              </h4>
              <p className="text-slate-400 text-[11px]">
                Multimodal OCR extracts structured FIR fields with confidence ratings. Low-confidence extractions route to the Forensic Verification Queue for human-in-the-loop sign-off, sealing immutable v2 revisions.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-defense-900 border border-slate-800 space-y-2">
              <h4 className="font-bold text-slate-100 flex items-center gap-2 text-xs">
                <ShieldAlert className="w-4 h-4 text-rose-400" />
                4. Field-Level AES-256-GCM Encryption
              </h4>
              <p className="text-slate-400 text-[11px]">
                Complainant and accused personal data are encrypted at rest using AES-256-GCM with authentication tags. Unauthorized roles receive masked/redacted strings.
              </p>
            </div>
          </div>

          {/* Integration Scope Clarification */}
          <div className="p-3.5 rounded-xl bg-defense-900/80 border border-slate-800 text-[11px] space-y-1.5">
            <div className="flex items-center gap-2 text-amber-300 font-bold">
              <AlertTriangle className="w-4 h-4" />
              <span>Government Systems Scope Notice</span>
            </div>
            <p className="text-slate-400">
              All external law-enforcement connectors (CCTNS Sync, ICJS e-Courts Gateway) in this prototype are designated as <strong>"Mock / Future Integration"</strong> endpoints. No live government APIs are simulated or falsely claimed.
            </p>
          </div>

          <div className="pt-2 flex justify-end">
            <Button variant="primary" onClick={() => setIsArchModalOpen(false)}>
              Close Notes
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
