import React, { useState, useEffect } from 'react';
import {
  FileText,
  ShieldCheck,
  Clock,
  User,
  Calendar,
  Lock,
  ExternalLink,
  Download,
  Copy,
  Check,
  AlertTriangle,
  History,
  Layers,
  Eye,
  Edit3,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  Info,
  X,
  GitCommit,
  Upload,
  GitCompare,
  ArrowDown,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { Button } from '../common/Button';
import { Badge } from '../common/Badge';
import { Alert } from '../common/Alert';
import { Spinner } from '../common/Spinner';
import { useAuth } from '../../hooks/useAuth';
import { documentService } from '../../services/documentService';
import { verificationService } from '../../services/verificationService';
import { formatBytes } from '../../utils/crypto';
import { formatDate, truncateHash } from '../../utils/formatters';

export function DocumentDetailModal({ isOpen, onClose, document, onUpdated }) {
  const { user } = useAuth();
  const [docData, setDocData] = useState(document);
  const [copiedHash, setCopiedHash] = useState(false);
  const [generatingUrl, setGeneratingUrl] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [viewUrlData, setViewUrlData] = useState(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Verifier field edit states
  const [activeFieldEdit, setActiveFieldEdit] = useState(null);
  const [editValue, setEditValue] = useState('');

  // Verification & Flagging confirm modals
  const [showVerifyConfirm, setShowVerifyConfirm] = useState(false);
  const [verifyNotes, setVerifyNotes] = useState('');
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flagReason, setFlagReason] = useState('');

  // Phase 10: Versioning and Edit Integrity states
  const [showNewVersionModal, setShowNewVersionModal] = useState(false);
  const [newVersionFile, setNewVersionFile] = useState(null);
  const [newVersionNotes, setNewVersionNotes] = useState('');
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [compareData, setCompareData] = useState(null);
  const [comparingVersions, setComparingVersions] = useState(false);

  useEffect(() => {
    if (document) {
      setDocData(document);
      setError(null);
      setSuccess(null);
      setActiveFieldEdit(null);
      setShowVerifyConfirm(false);
      setShowFlagModal(false);
    }
  }, [document]);

  if (!isOpen || !docData) return null;

  const isVerifierOrAdmin = user && ['verifier', 'admin'].includes(user.role);
  const canEditFields = user && ['verifier', 'admin', 'officer'].includes(user.role);
  const canFlag = user && ['verifier', 'admin', 'officer'].includes(user.role);
  const extractedFields = docData.extractedFields || {};
  const classification = docData.classification || {};
  const ocrMetadata = docData.ocrMetadata || {};
  const avgConfidence = ocrMetadata.averageConfidence ? Math.round(ocrMetadata.averageConfidence * 100) : (docData.ocrConfidence || 85);

  const getConfidenceBadge = (confidence) => {
    const score = typeof confidence === 'number' ? (confidence <= 1 ? Math.round(confidence * 100) : confidence) : 85;
    if (score >= 90) {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          {score}% High
        </span>
      );
    }
    if (score >= 80) {
      return (
        <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-950/80 text-amber-400 border border-amber-500/40 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
          {score}% Moderate
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-950/80 text-rose-400 border border-rose-500/40 flex items-center gap-1 animate-pulse">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
        {score}% Review Needed
      </span>
    );
  };

  const handleCopyHash = () => {
    navigator.clipboard.writeText(docData.sha256Hash);
    setCopiedHash(true);
    setTimeout(() => setCopiedHash(false), 2000);
  };

  const handleSecureView = async () => {
    setGeneratingUrl(true);
    setError(null);
    try {
      const res = await documentService.getDocumentViewUrl(docData._id);
      setViewUrlData(res.data);
      window.open(res.data.url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err?.message || 'Failed to generate presigned view URL');
    } finally {
      setGeneratingUrl(false);
    }
  };

  const handleDownload = async () => {
    setDownloading(true);
    setError(null);
    try {
      const res = await documentService.getDocumentDownloadUrl(docData._id);
      const url = res.data?.downloadUrl || res.data?.url;
      if (url) {
        const link = window.document.createElement('a');
        link.href = url;
        link.setAttribute('download', docData.fileName || 'evidence-file');
        window.document.body.appendChild(link);
        link.click();
        link.remove();
      }
    } catch (err) {
      setError(err?.message || 'Failed to generate presigned download URL');
    } finally {
      setDownloading(false);
    }
  };

  const handleStartFieldEdit = (fieldName, currentVal) => {
    setActiveFieldEdit(fieldName);
    let valToEdit = currentVal;
    if (typeof currentVal === 'object' && currentVal !== null) {
      if (currentVal.value !== undefined) {
        valToEdit = currentVal.value;
      } else if (currentVal.humanValue !== undefined && currentVal.humanValue !== null) {
        valToEdit = currentVal.humanValue;
      } else if (currentVal.aiValue !== undefined) {
        valToEdit = currentVal.aiValue;
      } else {
        valToEdit = JSON.stringify(currentVal);
      }
    }
    setEditValue(valToEdit !== null && valToEdit !== undefined ? String(valToEdit) : '');
  };

  const handleSaveFieldCorrection = async (fieldName) => {
    try {
      setActionLoading(true);
      setError(null);
      const res = await verificationService.correctField(docData._id, fieldName, editValue);
      const updatedDoc = res.data || res;
      setDocData(updatedDoc);
      setActiveFieldEdit(null);
      setSuccess(`Field '${fieldName}' updated with non-destructive verifier correction.`);
      if (onUpdated) onUpdated(updatedDoc);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveField = async (fieldName) => {
    try {
      setActionLoading(true);
      setError(null);
      const res = await verificationService.approveField(docData._id, fieldName);
      const updatedDoc = res.data || res;
      setDocData(updatedDoc);
      setSuccess(`Field '${fieldName}' certified as approved.`);
      if (onUpdated) onUpdated(updatedDoc);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReRunExtraction = async () => {
    try {
      setActionLoading(true);
      setError(null);
      const res = await verificationService.triggerExtraction(docData._id);
      const updatedDoc = res.data || res;
      setDocData(updatedDoc);
      setSuccess('AI OCR and document classification pipeline completed.');
      if (onUpdated) onUpdated(updatedDoc);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerifyDocument = async () => {
    try {
      setActionLoading(true);
      setError(null);
      const res = await verificationService.verifyDocument(docData._id, verifyNotes);
      const updatedDoc = res.data || res;
      setDocData(updatedDoc);
      setShowVerifyConfirm(false);
      setSuccess('Document successfully certified and verified by Forensic Verifier.');
      if (onUpdated) onUpdated(updatedDoc);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleFlagDocument = async () => {
    if (!flagReason || flagReason.trim().length < 5) {
      setError('Please specify a detailed reason (minimum 5 characters) for flagging this document.');
      return;
    }

    try {
      setActionLoading(true);
      setError(null);
      const res = await verificationService.flagDocument(docData._id, flagReason);
      const updatedDoc = res.data || res;
      setDocData(updatedDoc);
      setShowFlagModal(false);
      setFlagReason('');
      setSuccess('Document flagged for forensic anomaly.');
      if (onUpdated) onUpdated(updatedDoc);
    } catch (err) {
      setError(err.response?.data?.error?.message || err.message);
    } finally {
      setActionLoading(false);
    }
  };

  // Phase 10: Versioning Handlers
  const handleCreateNewVersion = async (e) => {
    e.preventDefault();
    if (!newVersionFile && !newVersionNotes.trim()) {
      setError('Please provide a replacement evidence file or revision change notes.');
      return;
    }

    try {
      setActionLoading(true);
      setError(null);

      const formData = new FormData();
      if (newVersionFile) formData.append('file', newVersionFile);
      formData.append('changeDescription', newVersionNotes.trim() || 'Updated revision');

      const res = await documentService.createDocumentVersion(docData._id, formData);
      setDocData(res.data);
      setShowNewVersionModal(false);
      setNewVersionFile(null);
      setNewVersionNotes('');
      setSuccess(`Created document revision v${res.data.version} with cryptographic SHA-256 seal.`);
      if (onUpdated) onUpdated(res.data);
    } catch (err) {
      setError(err?.message || err.response?.data?.error?.message || 'Failed to create document revision');
    } finally {
      setActionLoading(false);
    }
  };

  const handleViewVersion = async (versionNumber) => {
    try {
      setActionLoading(true);
      setError(null);
      const res = await documentService.getVersionViewUrl(docData._id, versionNumber);
      const streamUrl = res.data?.url || res.url;
      const fullUrl = streamUrl.startsWith('http') ? streamUrl : `http://localhost:5000${streamUrl}`;
      window.open(fullUrl, '_blank', 'noopener,noreferrer');
      setSuccess(`Presigned 5-minute stream opened for version v${versionNumber}`);
    } catch (err) {
      setError(err?.message || 'Failed to open version view stream');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCompareVersions = async (v1, v2) => {
    try {
      setComparingVersions(true);
      setError(null);
      const res = await documentService.compareVersions(docData._id, v1, v2);
      setCompareData(res.data);
      setShowCompareModal(true);
    } catch (err) {
      setError(err?.message || 'Failed to compare document versions');
    } finally {
      setComparingVersions(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <FileText className="w-5 h-5 text-cyan-400" />
          <span className="text-slate-100 font-bold">Evidentiary Document Dossier</span>
        </div>
      }
      size="2xl"
    >
      <div className="space-y-5 max-h-[80vh] overflow-y-auto pr-1">
        {error && <Alert variant="error">{error}</Alert>}
        {success && <Alert variant="success">{success}</Alert>}

        {/* Mandatory Legal Authenticity Disclaimer */}
        <div className="p-3.5 rounded-xl bg-amber-950/30 border border-amber-500/30 space-y-1">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-bold font-mono">
            <Info className="w-4 h-4 shrink-0" />
            <span>AUTHENTICITY & CONFIDENCE PROTOCOL</span>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            <strong>AI Extraction Confidence</strong> measures OCR text fidelity against pixels.
            It does <span className="underline decoration-amber-400 font-semibold">NOT</span> certify physical evidentiary validity or legal authenticity prior to digital intake.
          </p>
        </div>

        {/* Top Header Card */}
        <div className="p-4 rounded-xl bg-defense-900 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center shrink-0">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <Badge variant="cyan" size="xs">
                  {docData.documentType?.toUpperCase() || 'EVIDENCE'}
                </Badge>
                <Badge
                  variant={docData.status === 'verified' ? 'verified' : docData.status === 'flagged_tampered' ? 'tampered' : 'pending'}
                  size="xs"
                >
                  {docData.status?.replace('_', ' ').toUpperCase() || 'PENDING REVIEW'}
                </Badge>
                {docData.isTampered && (
                  <Badge variant="tampered" size="xs">
                    TAMPER ALERT
                  </Badge>
                )}
              </div>
              <h3 className="text-sm font-bold text-slate-100 mt-1">{docData.title}</h3>
              <div className="text-xs text-slate-400 font-mono">{docData.fileName}</div>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <Button
              variant="secondary"
              size="sm"
              icon={Download}
              onClick={handleDownload}
              isLoading={downloading}
              className="text-xs shrink-0"
              title="Download original evidence file"
            >
              Download
            </Button>
            <Button
              variant="primary"
              size="sm"
              icon={ExternalLink}
              onClick={handleSecureView}
              isLoading={generatingUrl}
              className="text-xs shrink-0"
            >
              5m Secure View
            </Button>
            {canEditFields && (
              <Button
                variant="ghost"
                size="sm"
                onClick={handleReRunExtraction}
                disabled={actionLoading}
                className="text-xs text-slate-400 hover:text-slate-200"
                title="Re-run AI OCR pipeline"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
              </Button>
            )}
          </div>
        </div>

        {viewUrlData && (
          <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/30 flex items-center justify-between text-xs font-mono text-cyan-300">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-cyan-400 shrink-0" />
              <span>Temporary Presigned Vault Stream Active</span>
            </div>
            <a
              href={viewUrlData.url}
              target="_blank"
              rel="noopener noreferrer"
              className="underline text-cyan-400 hover:text-cyan-200"
            >
              Re-open Tab
            </a>
          </div>
        )}

        {/* Metadata Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-defense-900/60 border border-slate-800 space-y-1">
            <span className="text-[11px] text-slate-500 font-mono uppercase block">Associated Case</span>
            <div className="font-bold text-slate-200">
              {docData.caseId?.caseNumber || 'CR/2026/XXXX'}
            </div>
            <div className="text-slate-400 text-[11px] truncate">
              {docData.caseId?.title || 'Case Title'}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-defense-900/60 border border-slate-800 space-y-1">
            <span className="text-[11px] text-slate-500 font-mono uppercase block">File Details</span>
            <div className="font-bold text-slate-200">
              {formatBytes(docData.fileSize)} • {docData.mimeType}
            </div>
            <div className="text-slate-400 text-[11px]">
              Uploaded: {formatDate(docData.createdAt)}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-defense-900/60 border border-slate-800 space-y-1">
            <span className="text-[11px] text-slate-500 font-mono uppercase block">Uploaded By</span>
            <div className="font-bold text-slate-200">
              {docData.uploadedBy?.name || 'Investigating Officer'}
            </div>
            <div className="text-slate-400 text-[11px] font-mono">
              Badge: {docData.uploadedBy?.badgeNumber || 'CCB-9842'} ({docData.uploadedBy?.role || 'officer'})
            </div>
          </div>

          <div className="p-3 rounded-xl bg-defense-900/60 border border-slate-800 space-y-1">
            <span className="text-[11px] text-slate-500 font-mono uppercase block">Storage Encryption</span>
            <div className="font-bold text-emerald-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" /> SSE-S3 (AES-256)
            </div>
            <div className="text-slate-400 text-[11px] font-mono truncate">
              Key: {docData.s3Key}
            </div>
          </div>
        </div>

        {/* Cryptographic SHA-256 Hash */}
        <div className="p-3.5 rounded-xl bg-defense-950 border border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-mono text-slate-400 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-cyan-400" />
              Cryptographic SHA-256 Seal
            </span>
            <button
              onClick={handleCopyHash}
              className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono transition-colors"
            >
              {copiedHash ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copiedHash ? 'Copied' : 'Copy Hash'}
            </button>
          </div>
          <div className="text-xs font-mono text-emerald-400 break-all select-all">
            {docData.sha256Hash}
          </div>
        </div>

        {/* AI Document Intelligence & Interactive Field Reconciliation */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <h4 className="text-xs font-bold text-slate-200 uppercase font-mono">
                AI Field Extraction ({docData.documentType?.toUpperCase()} Schema)
              </h4>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-slate-400">Average OCR Confidence:</span>
              {getConfidenceBadge(avgConfidence)}
            </div>
          </div>

          {Object.keys(extractedFields).length === 0 ? (
            <div className="p-6 text-center rounded-xl bg-defense-900/40 border border-slate-800 space-y-2">
              <FileText className="w-8 h-8 text-slate-500 mx-auto" />
              <div className="text-xs text-slate-400">No structured fields extracted yet.</div>
              {canEditFields && (
                <Button size="sm" variant="secondary" onClick={handleReRunExtraction} disabled={actionLoading}>
                  Run AI Extraction Pipeline
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-2.5">
              {Object.entries(extractedFields).map(([fieldName, fieldData]) => {
                const isEditing = activeFieldEdit === fieldName;
                const isCorrected = fieldData.isCorrected;
                const isApproved = fieldData.status === 'approved';

                return (
                  <div
                    key={fieldName}
                    className={`p-3 rounded-xl border transition-all ${
                      isCorrected
                        ? 'bg-defense-900/90 border-cyan-500/40 shadow-glow-cyan'
                        : isApproved
                        ? 'bg-defense-900/60 border-emerald-500/30'
                        : 'bg-defense-900/60 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      <div className="space-y-1 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono font-bold text-cyan-300">
                            {fieldName.replace(/([A-Z])/g, ' $1').toUpperCase()}
                          </span>
                          {getConfidenceBadge(fieldData.confidence)}
                          {isCorrected && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-500/40 font-bold">
                              HUMAN CORRECTED
                            </span>
                          )}
                          {isApproved && (
                            <span className="px-1.5 py-0.5 rounded text-[9px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-500/40 font-bold">
                              CERTIFIED
                            </span>
                          )}
                        </div>

                        {isEditing ? (
                          <div className="space-y-2 pt-1">
                            <textarea
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              rows={2}
                              className="w-full px-3 py-2 rounded-lg bg-defense-950 border border-cyan-500/50 text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-cyan-400"
                              placeholder="Enter verified forensic value..."
                            />
                            <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
                              <span>Original AI: {String(fieldData.aiValue || 'N/A')}</span>
                              <div className="flex items-center gap-2">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 text-xs text-slate-400"
                                  onClick={() => setActiveFieldEdit(null)}
                                >
                                  Cancel
                                </Button>
                                <Button
                                  size="sm"
                                  variant="primary"
                                  className="h-7 text-xs"
                                  onClick={() => handleSaveFieldCorrection(fieldName)}
                                  disabled={actionLoading}
                                >
                                  Save Correction
                                </Button>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <div className="text-xs font-semibold text-slate-100 bg-defense-950/70 p-2 rounded-lg font-mono border border-slate-800">
                              {typeof fieldData.value === 'object'
                                ? JSON.stringify(fieldData.value)
                                : String(fieldData.value || 'Not specified')}
                            </div>

                            {isCorrected && (
                              <div className="p-2 rounded-lg bg-amber-950/20 border border-amber-500/20 text-[11px] font-mono space-y-0.5">
                                <div className="text-slate-400">
                                  <span className="text-amber-400 font-semibold">Original AI Output:</span>{' '}
                                  <span className="line-through text-slate-500">{String(fieldData.aiValue)}</span>
                                </div>
                                <div className="text-cyan-300">
                                  <span>Verified Value:</span> {String(fieldData.humanValue)}
                                </div>
                                {fieldData.correctedAt && (
                                  <div className="text-[10px] text-slate-500">
                                    Corrected on {new Date(fieldData.correctedAt).toLocaleString()}
                                  </div>
                                )}
                              </div>
                            )}

                            {fieldData.sourceReference && (
                              <div className="text-[10px] text-slate-400 font-mono">
                                Reference: <span className="text-slate-300">{fieldData.sourceReference}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {canEditFields && !isEditing && (
                        <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center">
                          <button
                            onClick={() => handleStartFieldEdit(fieldName, fieldData.value)}
                            className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-cyan-950/80 hover:text-cyan-300 text-slate-400 border border-slate-700/60 transition-all"
                            title="Edit / Correct Field"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          {!isApproved && (
                            <button
                              onClick={() => handleApproveField(fieldName)}
                              className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-emerald-950/80 hover:text-emerald-300 text-slate-400 border border-slate-700/60 transition-all"
                              title="Approve Field"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Verification Sign-off Confirm Box */}
        {showVerifyConfirm && (
          <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 space-y-3">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold font-mono">
              <CheckCircle2 className="w-4 h-4" />
              <span>DIGITAL FORENSIC CERTIFICATION SIGN-OFF</span>
            </div>
            <p className="text-xs text-slate-300">
              Certify that all evidentiary fields have been cross-examined against forensic standards.
            </p>
            <input
              type="text"
              value={verifyNotes}
              onChange={(e) => setVerifyNotes(e.target.value)}
              placeholder="Enter forensic certification remarks / verification notes..."
              className="w-full px-3 py-2 rounded-lg bg-defense-950 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-emerald-400"
            />
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setShowVerifyConfirm(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="success" onClick={handleVerifyDocument} disabled={actionLoading}>
                Certify & Verify Document
              </Button>
            </div>
          </div>
        )}

        {/* Flag Tamper Anomaly Box */}
        {showFlagModal && (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 space-y-3">
            <div className="flex items-center gap-2 text-rose-400 text-xs font-bold font-mono">
              <AlertTriangle className="w-4 h-4" />
              <span>FLAG TAMPERING OR INTEGRITY DISCREPANCY</span>
            </div>
            <p className="text-xs text-slate-300">
              Flagging this document marks it as <span className="text-rose-400 font-bold">FLAGGED_TAMPERED</span> and creates a critical alert.
            </p>
            <textarea
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              rows={2}
              placeholder="State precise reason for flagging (e.g. signature timestamp disparity, checksum mismatch)..."
              className="w-full px-3 py-2 rounded-lg bg-defense-950 border border-rose-500/50 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-rose-400"
            />
            <div className="flex items-center justify-end gap-2">
              <Button size="sm" variant="ghost" onClick={() => setShowFlagModal(false)}>
                Cancel
              </Button>
              <Button size="sm" variant="danger" onClick={handleFlagDocument} disabled={actionLoading}>
                Confirm Flagging
              </Button>
            </div>
          </div>
        )}

        {/* Extracted Entities & Case Cross-References */}
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
            <User className="w-4 h-4 text-cyan-400" />
            <span>Extracted Entities & Cross-References</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {/* Persons */}
            <div className="p-3 rounded-xl bg-defense-900/60 border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-500 font-mono uppercase block">Identified Persons</span>
              <div className="text-xs text-slate-200 font-medium space-y-0.5">
                {extractedFields.accusedName?.value || extractedFields.complainantName?.value || extractedFields.witnessName?.value || extractedFields.personName?.value ? (
                  <>
                    {extractedFields.accusedName?.value && <div>• Accused: {String(extractedFields.accusedName.value)}</div>}
                    {extractedFields.complainantName?.value && <div>• Complainant: {String(extractedFields.complainantName.value)}</div>}
                    {extractedFields.witnessName?.value && <div>• Witness: {String(extractedFields.witnessName.value)}</div>}
                  </>
                ) : (
                  <span className="text-slate-500 italic">No person entities identified</span>
                )}
              </div>
            </div>

            {/* Locations */}
            <div className="p-3 rounded-xl bg-defense-900/60 border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-500 font-mono uppercase block">Crime Scenes & Locations</span>
              <div className="text-xs text-slate-200 font-medium">
                {extractedFields.placeOfOccurrence?.value || extractedFields.location?.value || extractedFields.address?.value ? (
                  <div>• {String(extractedFields.placeOfOccurrence?.value || extractedFields.location?.value || extractedFields.address?.value)}</div>
                ) : (
                  <span className="text-slate-500 italic">No specific location extracted</span>
                )}
              </div>
            </div>

            {/* Evidence & Items */}
            <div className="p-3 rounded-xl bg-defense-900/60 border border-slate-800 space-y-1">
              <span className="text-[10px] text-slate-500 font-mono uppercase block">Physical & Forensic Tags</span>
              <div className="text-xs text-slate-200 font-medium">
                {extractedFields.firNumber?.value || extractedFields.exhibitNumber?.value || extractedFields.seizedItems?.value ? (
                  <div>• {String(extractedFields.firNumber?.value || extractedFields.exhibitNumber?.value || extractedFields.seizedItems?.value)}</div>
                ) : (
                  <span className="text-slate-500 italic">Standard case exhibit</span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Version History & Lineage Tree */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-200">
              <History className="w-4 h-4 text-cyan-400" />
              <span>Document Version Lineage (v{docData.version || 1})</span>
            </div>
            {user?.role !== 'auditor' && (
              <Button
                size="xs"
                variant="primary"
                onClick={() => setShowNewVersionModal(true)}
              >
                + Upload New Revision
              </Button>
            )}
          </div>

          <div className="p-4 rounded-xl bg-defense-900/60 border border-slate-800/80 space-y-3">
            {docData.versions && docData.versions.length > 0 ? (
              <div className="space-y-3 relative pl-4 before:absolute before:left-2 before:top-3 before:bottom-3 before:w-0.5 before:bg-slate-800">
                {docData.versions.map((ver, idx) => {
                  const vNumber = ver.versionNumber || ver.version || idx + 1;
                  const isLatest = (docData.version || 1) === vNumber;

                  return (
                    <div key={idx} className="relative group">
                      {/* Node Dot */}
                      <div
                        className={`absolute -left-4 top-1.5 w-3 h-3 rounded-full border-2 bg-defense-950 ${
                          isLatest ? 'border-cyan-400 shadow-glow-cyan' : 'border-slate-600'
                        }`}
                      />

                      <div className="p-3 rounded-xl bg-defense-950/80 border border-slate-800/80 hover:border-slate-700 transition-all space-y-2">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded font-mono text-xs font-bold border ${
                              isLatest
                                ? 'bg-cyan-950 text-cyan-300 border-cyan-500/40'
                                : 'bg-slate-900 text-slate-400 border-slate-800'
                            }`}>
                              Version {vNumber}
                            </span>
                            {isLatest && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-950 text-emerald-400 border border-emerald-500/40">
                                CURRENT SEALED
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => handleViewVersion(vNumber)}
                              className="text-xs text-cyan-400 hover:text-cyan-300 font-mono flex items-center gap-1"
                              title="Generate 5-minute presigned view for this version"
                            >
                              <Eye className="w-3.5 h-3.5" /> 5m View
                            </button>

                            {vNumber > 1 && (
                              <button
                                onClick={() => handleCompareVersions(vNumber - 1, vNumber)}
                                className="text-xs text-indigo-400 hover:text-indigo-300 font-mono flex items-center gap-1 ml-2"
                                title="Compare changes with previous version"
                              >
                                <GitCompare className="w-3.5 h-3.5" /> Compare with v{vNumber - 1}
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Description / Notes */}
                        <div className="text-xs text-slate-300 font-medium">
                          {ver.changeDescription || ver.changeNotes || 'Evidentiary intake sealed'}
                        </div>

                        {/* Cryptographic Seal & Meta */}
                        <div className="flex flex-wrap items-center justify-between text-[11px] font-mono text-slate-400 pt-1 border-t border-slate-800/60 gap-2">
                          <div className="flex items-center gap-1">
                            <span className="text-slate-500">SHA-256:</span>
                            <span className="text-emerald-400">
                              {truncateHash(ver.sha256Hash || docData.sha256Hash, 6, 6)}
                            </span>
                          </div>
                          <div>
                            {formatDate(ver.createdAt || ver.uploadedAt || docData.createdAt)}
                          </div>
                        </div>
                      </div>

                      {idx < docData.versions.length - 1 && (
                        <div className="flex justify-start pl-2 py-0.5 text-slate-600">
                          <ArrowDown className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="text-xs text-slate-400 font-mono text-center py-2">
                Version 1 locked in immutable ledger.
              </div>
            )}
          </div>
        </div>

        {/* Modal Action Footer */}
        <div className="pt-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-800">
          <div className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Secured Audit Trail Active</span>
          </div>

          <div className="flex items-center gap-2">
            {!showVerifyConfirm && !showFlagModal && (
              <>
                {canFlag && (
                  <Button
                    size="sm"
                    variant="danger"
                    className="text-xs"
                    onClick={() => setShowFlagModal(true)}
                    disabled={actionLoading}
                  >
                    <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                    Flag Anomaly
                  </Button>
                )}

                {isVerifierOrAdmin && (
                  <Button
                    size="sm"
                    variant="success"
                    className="text-xs"
                    onClick={() => setShowVerifyConfirm(true)}
                    disabled={actionLoading || docData.status === 'verified'}
                  >
                    <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    {docData.status === 'verified' ? 'Already Verified' : 'Verify & Certify'}
                  </Button>
                )}
              </>
            )}

            <Button variant="secondary" size="sm" onClick={onClose}>
              Close Dossier
            </Button>
          </div>
        </div>

        {/* Upload New Revision Modal */}
        {showNewVersionModal && (
          <div className="p-4 rounded-xl bg-defense-950 border border-cyan-500/40 space-y-3 mt-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2 text-cyan-400 font-bold text-xs font-mono">
                <Upload className="w-4 h-4" />
                <span>UPLOAD NEW DOCUMENT REVISION (v{(docData.version || 1) + 1})</span>
              </div>
              <button
                onClick={() => setShowNewVersionModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Non-destructive update: Previous version v{docData.version || 1} will be cryptographically preserved in version history.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  Replacement File (PDF, DOCX, Image)
                </label>
                <input
                  type="file"
                  onChange={(e) => setNewVersionFile(e.target.files[0])}
                  className="w-full text-xs text-slate-300 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-cyan-500/40 file:text-xs file:bg-cyan-950 file:text-cyan-300 file:cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-[11px] font-mono text-slate-400 mb-1">
                  Revision Change Description / Justification Notes *
                </label>
                <textarea
                  value={newVersionNotes}
                  onChange={(e) => setNewVersionNotes(e.target.value)}
                  rows={2}
                  placeholder="State reason for revision (e.g., Added witness Annexure B, Corrected serial ID)..."
                  className="w-full px-3 py-2 rounded-lg bg-defense-900 border border-slate-700 text-xs text-slate-100 focus:outline-none focus:ring-1 focus:ring-cyan-400"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-800">
                <Button size="sm" variant="ghost" onClick={() => setShowNewVersionModal(false)}>
                  Cancel
                </Button>
                <Button size="sm" variant="primary" onClick={handleCreateNewVersion} disabled={actionLoading}>
                  Seal Revision v{(docData.version || 1) + 1}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Version Comparison Diff Modal */}
        {showCompareModal && compareData && (
          <div className="p-4 rounded-xl bg-defense-950 border border-indigo-500/40 space-y-3 mt-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs font-mono">
                <GitCompare className="w-4 h-4" />
                <span>VERSION DIFF COMPARISON (v{compareData.versionA.versionNumber} ↔ v{compareData.versionB.versionNumber})</span>
              </div>
              <button
                onClick={() => setShowCompareModal(false)}
                className="text-slate-400 hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3 rounded-lg bg-defense-900/80 border border-slate-800 space-y-1">
                <span className="text-[10px] font-mono text-slate-400 uppercase">Version {compareData.versionA.versionNumber}</span>
                <div className="font-semibold text-slate-200">{compareData.versionA.changeDescription}</div>
                <div className="font-mono text-[10px] text-emerald-400">{truncateHash(compareData.versionA.sha256Hash, 8, 8)}</div>
                <div className="text-[10px] text-slate-400">{formatBytes(compareData.versionA.fileSize)} • {formatDate(compareData.versionA.createdAt)}</div>
              </div>

              <div className="p-3 rounded-lg bg-defense-900/80 border border-slate-800 space-y-1">
                <span className="text-[10px] font-mono text-cyan-400 uppercase">Version {compareData.versionB.versionNumber}</span>
                <div className="font-semibold text-slate-200">{compareData.versionB.changeDescription}</div>
                <div className="font-mono text-[10px] text-emerald-400">{truncateHash(compareData.versionB.sha256Hash, 8, 8)}</div>
                <div className="text-[10px] text-slate-400">{formatBytes(compareData.versionB.fileSize)} • {formatDate(compareData.versionB.createdAt)}</div>
              </div>
            </div>

            <div className="p-3 rounded-lg bg-defense-900/50 border border-slate-800 text-xs font-mono space-y-1">
              <div className="text-slate-300 font-bold">Diff Summary:</div>
              <div className="text-slate-400">• Cryptographic Hash Modified: <span className={compareData.diff.hashChanged ? 'text-amber-400' : 'text-emerald-400'}>{compareData.diff.hashChanged ? 'YES (New Content/Signature)' : 'NO (Unchanged)'}</span></div>
              <div className="text-slate-400">• Size Delta: <span className="text-cyan-300">{compareData.diff.sizeDifferenceBytes >= 0 ? `+${compareData.diff.sizeDifferenceBytes} bytes` : `${compareData.diff.sizeDifferenceBytes} bytes`}</span></div>
              <div className="text-slate-400">• Time Delta: <span className="text-slate-200">{compareData.diff.timeDifferenceSeconds} seconds apart</span></div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-800">
              <Button size="sm" variant="secondary" onClick={() => setShowCompareModal(false)}>
                Close Diff
              </Button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
