import React, { useState, useRef, useEffect } from 'react';
import {
  UploadCloud,
  FileText,
  CheckCircle2,
  AlertTriangle,
  Lock,
  ShieldCheck,
  X,
  FileCode,
  Hash,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Alert } from '../common/Alert';
import { Badge } from '../common/Badge';
import { Spinner } from '../common/Spinner';
import { documentService } from '../../services/documentService';
import { caseService } from '../../services/caseService';
import { computeClientSha256, formatBytes } from '../../utils/crypto';
import { truncateHash } from '../../utils/formatters';

const ALLOWED_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.tiff', '.tif', '.webp', '.docx', '.doc', '.txt'];
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

const DOCUMENT_CATEGORIES = [
  { value: 'FIR', label: 'FIR (First Information Report)' },
  { value: 'statement', label: 'Witness / Accused Statement (Sec 161/164)' },
  { value: 'chargesheet', label: 'Police Charge Sheet / Final Report' },
  { value: 'evidence', label: 'Material Evidence / Seizure Memo' },
  { value: 'forensic_report', label: 'CFSL / Forensic Ballistics Report' },
];

export function DocumentUploadModal({ isOpen, onClose, onUploadSuccess, initialCaseId }) {
  const [file, setFile] = useState(null);
  const [clientHash, setClientHash] = useState('');
  const [hashing, setHashing] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  // Form Fields
  const [caseId, setCaseId] = useState(initialCaseId || '');
  const [cases, setCases] = useState([]);
  const [loadingCases, setLoadingCases] = useState(false);
  const [documentType, setDocumentType] = useState('FIR');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');

  // Upload Progress State
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [successData, setSuccessData] = useState(null);

  const fileInputRef = useRef(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setSuccessData(null);
      setUploadProgress(0);
      if (initialCaseId) {
        setCaseId(initialCaseId);
      }
      fetchCases();
    } else {
      resetForm();
    }
  }, [isOpen, initialCaseId]);

  const fetchCases = async () => {
    setLoadingCases(true);
    try {
      const res = await caseService.getCases({ limit: 50 });
      setCases(res.data || []);
      if (!initialCaseId && res.data?.length > 0) {
        setCaseId(res.data[0]._id);
      }
    } catch (err) {
      setError('Failed to load active cases list');
    } finally {
      setLoadingCases(false);
    }
  };

  const resetForm = () => {
    setFile(null);
    setClientHash('');
    setHashing(false);
    setTitle('');
    setDescription('');
    setUploadProgress(0);
    setUploading(false);
    setError(null);
    setSuccessData(null);
  };

  const handleFileSelect = async (selectedFile) => {
    if (!selectedFile) return;
    setError(null);

    // 1. Size Validation
    if (selectedFile.size > MAX_FILE_SIZE) {
      setError(`File size (${formatBytes(selectedFile.size)}) exceeds maximum allowed limit of 25 MB`);
      return;
    }

    // 2. Extension Validation
    const ext = '.' + selectedFile.name.split('.').pop().toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      setError(`Extension '${ext}' is not permitted. Allowed formats: PDF, PNG, JPG, TIFF, WebP, DOCX, TXT`);
      return;
    }

    setFile(selectedFile);
    if (!title) {
      setTitle(selectedFile.name.replace(/\.[^/.]+$/, ''));
    }

    // 3. Client-Side SHA-256 Pre-calculation
    setHashing(true);
    try {
      const hash = await computeClientSha256(selectedFile);
      setClientHash(hash);
    } catch (err) {
      console.error('Client hash calculation error:', err);
    } finally {
      setHashing(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleLoadSyntheticFIR = () => {
    const syntheticContent = `================================================================================
FIRST INFORMATION REPORT (Under Section 154 Cr.P.C.)
POLICE STATION: Cyber Crime Police Station (CCPS) - Bengaluru
DISTRICT: Bengaluru Urban City | STATE: Karnataka
FIR NO: CCPS/FIR/2026/0891
DATE & TIME OF REPORT: 14-Aug-2026 10:30 IST

1. ACTS & SECTIONS APPLICABLE:
   (a) Information Technology Act, 2000: Section 66C (Identity Theft), Section 66D (Cheating by Impersonation)
   (b) Indian Penal Code (IPC): Section 420 (Cheating), Section 468 (Forgery for Cheating), Section 471 (Using Forged Document)

2. OCCURRENCE OF OFFENCE:
   (a) Day/Date: Tuesday, 12-Aug-2026 at approx. 14:30 IST
   (b) Place of Occurrence: Apex Financial Services Hub, 4th Block, Koramangala, Bengaluru

3. COMPLAINANT / INFORMANT DETAILS:
   (a) Name: Ananya Rameshwaram (Chief Compliance Officer)
   (b) Organization: Apex FinCorp Micro-Lending Ltd.
   (c) Address: Residency Road, Bengaluru - 560025

4. DETAILS OF KNOWN / SUSPECTED / ACCUSED PERSONS:
   (a) Name: Sameer Rohan Verma
   (b) Designation: Former Senior Cloud Infrastructure Engineer (Terminated)
   (c) Known Alias: 'SamV-Root'

5. BRIEF STATEMENT OF FACTS / OFFENCE:
   On 12-Aug-2026 between 14:15 and 14:45 IST, an unauthorized administrator session was established from external IP 198.51.100.44 using compromised 2FA master tokens belonging to senior management. The actor executed privilege escalation scripts, initiating four unauthorized wire disbursements totaling INR 4,20,00,000 (Four Crores Twenty Lakhs) to offshore synthetic accounts.

[DEMO EVIDENCE RECORD - 100% SYNTHETIC DATA FOR SIH 26190 EVALUATION]
================================================================================`;

    const blob = new Blob([syntheticContent], { type: 'text/plain' });
    const syntheticFile = new File([blob], 'SYNTHETIC_FIR_CCPS_2026_0891.txt', { type: 'text/plain' });

    setDocumentType('FIR');
    setTitle('Synthetic FIR: Unauthorized Token Escalation');
    setDescription('Fictional FIR document for SIH 26190 demonstration purposes [DEMO DATA - NOT REAL PII]');
    handleFileSelect(syntheticFile);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError('Please select a file to upload');
      return;
    }
    if (!caseId) {
      setError('Please select a target case dossier');
      return;
    }

    setUploading(true);
    setError(null);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('caseId', caseId);
    formData.append('documentType', documentType);
    formData.append('title', title || file.name);
    if (description) formData.append('description', description);

    try {
      const res = await documentService.uploadDocument(formData, (progress) => {
        setUploadProgress(progress);
      });
      setSuccessData(res.data);
      if (onUploadSuccess) {
        onUploadSuccess(res.data);
      }
    } catch (err) {
      setError(err?.message || 'Secure document ingestion failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={uploading ? () => {} : onClose}
      title="Secure Document Ingestion Vault"
      maxWidth="max-w-xl"
    >
      {error && <Alert variant="error" className="mb-4">{error}</Alert>}

      {successData ? (
        <div className="space-y-5 text-center py-4">
          <div className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-lg shadow-emerald-500/10">
            <ShieldCheck className="w-8 h-8" />
          </div>

          <div className="space-y-1">
            <h3 className="text-base font-bold text-slate-100">Document Ingested & Cryptographically Sealed</h3>
            <p className="text-xs text-slate-400">
              SSE-S3 encrypted bytes stored in AWS S3 with SHA-256 hash verified.
            </p>
          </div>

          <div className="p-4 rounded-xl bg-defense-900 border border-slate-800 text-left space-y-2.5 font-mono text-xs">
            <div className="flex justify-between items-center text-slate-300">
              <span className="text-slate-500">Document ID:</span>
              <span className="text-cyan-400">{successData._id}</span>
            </div>
            <div className="flex justify-between items-center text-slate-300">
              <span className="text-slate-500">Document Type:</span>
              <Badge variant="cyan" size="xs">{successData.documentType}</Badge>
            </div>
            <div className="flex justify-between items-center text-slate-300">
              <span className="text-slate-500">File Size:</span>
              <span>{formatBytes(successData.fileSize)}</span>
            </div>
            <div className="pt-2 border-t border-slate-800 space-y-1">
              <span className="text-slate-500 text-[11px] block">Cryptographic SHA-256 Hash:</span>
              <div className="p-2 rounded bg-defense-950 border border-slate-800 text-emerald-400 text-[11px] break-all select-all font-mono">
                {successData.sha256Hash}
              </div>
            </div>
          </div>

          <div className="pt-3 flex justify-end gap-3">
            <Button variant="secondary" onClick={resetForm}>
              Upload Another
            </Button>
            <Button variant="primary" onClick={onClose}>
              Done
            </Button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Target Case Dossier Selection */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5 block">
              Target Legal Case Dossier <span className="text-rose-400">*</span>
            </label>
            {loadingCases ? (
              <div className="text-xs text-slate-400 flex items-center gap-2">
                <Spinner size="sm" /> Loading assigned cases...
              </div>
            ) : (
              <select
                value={caseId}
                onChange={(e) => setCaseId(e.target.value)}
                disabled={uploading || Boolean(initialCaseId)}
                className="w-full bg-defense-900 border border-slate-700/80 rounded-lg p-2.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                {cases.map((c) => (
                  <option key={c._id} value={c._id}>
                    {c.caseNumber} - {c.title}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Document Category / Type Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5 block">
                Category <span className="text-rose-400">*</span>
              </label>
              <select
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
                disabled={uploading}
                className="w-full bg-defense-900 border border-slate-700/80 rounded-lg p-2.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
              >
                {DOCUMENT_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>
                    {cat.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 mb-1.5 block">
                Document Title
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={uploading}
                placeholder="e.g. Seizure Memo 01"
                className="w-full bg-defense-900 border border-slate-700/80 rounded-lg p-2.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
              />
            </div>
          </div>

          {/* Drag & Drop File Zone */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300 block">
                Document File (PDF, PNG, JPG, TIFF, DOCX, TXT) <span className="text-rose-400">*</span>
              </label>
              <button
                type="button"
                onClick={handleLoadSyntheticFIR}
                disabled={uploading}
                className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 bg-cyan-950/60 hover:bg-cyan-900/60 px-2 py-0.5 rounded border border-cyan-500/40 transition-colors flex items-center gap-1"
              >
                <span>⚡ Load Fictional FIR Sample</span>
              </button>
            </div>

            <input
              type="file"
              ref={fileInputRef}
              onChange={(e) => handleFileSelect(e.target.files[0])}
              accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif,.webp,.docx,.doc,.txt"
              className="hidden"
            />

            {!file ? (
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`p-6 border-2 border-dashed rounded-xl cursor-pointer text-center transition-all ${
                  dragOver
                    ? 'border-cyan-400 bg-cyan-950/20'
                    : 'border-slate-800 hover:border-slate-700 bg-defense-900/40'
                }`}
              >
                <UploadCloud className="w-9 h-9 text-cyan-400/80 mx-auto mb-2" />
                <div className="text-xs font-semibold text-slate-200">
                  Drag and drop legal evidence file here, or <span className="text-cyan-400 underline">browse</span>
                </div>
                <div className="text-[11px] text-slate-500 font-mono mt-1">
                  Enforces SSE-S3 AES-256 encryption • Max 25 MB
                </div>
              </div>
            ) : (
              <div className="p-3.5 rounded-xl bg-defense-900 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2.5 overflow-hidden">
                    <FileText className="w-5 h-5 text-cyan-400 shrink-0" />
                    <div className="overflow-hidden text-left">
                      <div className="text-xs font-bold text-slate-200 truncate">{file.name}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{formatBytes(file.size)}</div>
                    </div>
                  </div>
                  {!uploading && (
                    <button
                      type="button"
                      onClick={() => setFile(null)}
                      className="text-slate-500 hover:text-rose-400 p-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Client-side SHA-256 Pre-calculated hash */}
                <div className="pt-2 border-t border-slate-800/80 text-left">
                  <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 mb-0.5">
                    <span>CLIENT-SIDE SHA-256 CHECKSUM:</span>
                    {hashing && <span className="text-cyan-400 flex items-center gap-1"><Spinner size="xs" /> Computing...</span>}
                  </div>
                  <div className="text-[11px] font-mono text-emerald-400 break-all bg-defense-950 px-2 py-1 rounded border border-slate-800">
                    {hashing ? 'Calculating binary checksum...' : clientHash || 'SHA-256 ready'}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Real Upload Progress Bar */}
          {uploading && (
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-cyan-400 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5" /> Transmitting to SSE-S3 Vault...
                </span>
                <span className="text-slate-300 font-bold">{uploadProgress}%</span>
              </div>
              <div className="w-full bg-defense-950 h-2 rounded-full overflow-hidden border border-slate-800">
                <div
                  className="bg-gradient-to-r from-cyan-500 to-emerald-400 h-full transition-all duration-150"
                  style={{ width: `${uploadProgress}%` }}
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-3 flex justify-end gap-3">
            <Button variant="secondary" type="button" onClick={onClose} disabled={uploading}>
              Cancel
            </Button>
            <Button variant="primary" type="submit" isLoading={uploading} disabled={!file || hashing}>
              Ingest & Encrypt
            </Button>
          </div>
        </form>
      )}
    </Modal>
  );
}
