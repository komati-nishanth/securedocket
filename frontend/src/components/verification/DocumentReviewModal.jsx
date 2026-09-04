import React, { useState } from 'react';
import {
  FileCheck2,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  ExternalLink,
  Edit3,
  Check,
  X,
  Clock,
  User,
  Info,
  RefreshCw,
  FileText,
  Lock,
} from 'lucide-react';
import { Modal } from '../common/Modal';
import { Badge } from '../common/Badge';
import { Button } from '../common/Button';
import { Spinner } from '../common/Spinner';
import { verificationService } from '../../services/verificationService';
import { documentService } from '../../services/documentService';

export function DocumentReviewModal({ isOpen, onClose, document, onUpdated, userRole }) {
  const [docData, setDocData] = useState(document);
  const [activeFieldEdit, setActiveFieldEdit] = useState(null); // field name currently editing
  const [editValue, setEditValue] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [verifyNotes, setVerifyNotes] = useState('');
  const [showVerifyConfirm, setShowVerifyConfirm] = useState(false);
  const [showFlagModal, setShowFlagModal] = useState(false);
  const [flagReason, setFlagReason] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const [successMsg, setSuccessMsg] = useState(null);

  // Sync state if document prop changes
  React.useEffect(() => {
    if (document) {
      setDocData(document);
      setErrorMsg(null);
      setSuccessMsg(null);
      setActiveFieldEdit(null);
    }
  }, [document]);

  if (!isOpen || !docData) return null;

  const isVerifierOrAdmin = ['verifier', 'admin'].includes(userRole);
  const extractedFields = docData.extractedFields || {};
  const classification = docData.classification || {};
  const ocrMetadata = docData.ocrMetadata || {};
  const avgConfidence = ocrMetadata.averageConfidence ? Math.round(ocrMetadata.averageConfidence * 100) : (docData.ocrConfidence || 85);

  const getConfidenceBadge = (confidence) => {
    const score = typeof confidence === 'number' ? (confidence <= 1 ? Math.round(confidence * 100) : confidence) : 85;
    if (score >= 90) {
      return (
        <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-500/40 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
          {score}% High Confidence
        </span>
      );
    }
    if (score >= 80) {
      return (
        <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-amber-950/80 text-amber-400 border border-amber-500/40 flex items-center gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
          {score}% Moderate
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded-md text-[11px] font-mono font-bold bg-rose-950/80 text-rose-400 border border-rose-500/40 flex items-center gap-1">
        <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse"></span>
        {score}% Review Required
      </span>
    );
  };

  const handleOpenSecureView = async () => {
    try {
      const res = await documentService.getDocumentViewUrl(docData._id);
      const url = res.data?.url || res.data?.viewUrl || res.url;
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      setErrorMsg('Failed to generate 5-minute presigned streaming link: ' + (err.response?.data?.error?.message || err.message));
    }
  };

  const handleStartFieldEdit = (fieldName, currentVal) => {
    setActiveFieldEdit(fieldName);
    setEditValue(typeof currentVal === 'string' ? currentVal : JSON.stringify(currentVal));
  };

  const handleSaveFieldCorrection = async (fieldName) => {
    try {
      setActionLoading(true);
      setErrorMsg(null);
      const res = await verificationService.correctField(docData._id, fieldName, editValue);
      const updatedDoc = res.data || res;
      setDocData(updatedDoc);
      setActiveFieldEdit(null);
      setSuccessMsg(`Field '${fieldName}' successfully updated with human verification correction.`);
      if (onUpdated) onUpdated(updatedDoc);
    } catch (err) {
      setErrorMsg(err.response?.data?.error?.message || err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleApproveField = async (fieldName) => {
    try {
      setActionLoading(true);
      setErrorMsg(null);
      const res = await verificationService.approveField(docData._id, fieldName);
      const updatedDoc = res.data || res;
      setDocData(updatedDoc);
      setSuccessMsg(`Field '${fieldName}' certified and locked as approved.`);
      if (onUpdated) onUpdated(updatedDoc);
    } catch (err) {
      setErrorMsg(err.response?.data?.error?.message || err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleReRunExtraction = async () => {
    try {
      setActionLoading(true);
      setErrorMsg(null);
      const res = await verificationService.triggerExtraction(docData._id);
      const updatedDoc = res.data || res;
      setDocData(updatedDoc);
      setSuccessMsg('AI OCR and document classification re-processed successfully.');
      if (onUpdated) onUpdated(updatedDoc);
    } catch (err) {
      setErrorMsg(err.response?.data?.error?.message || err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleVerifyDocument = async () => {
    try {
      setActionLoading(true);
      setErrorMsg(null);
      const res = await verificationService.verifyDocument(docData._id, verifyNotes);
      const updatedDoc = res.data || res;
      setDocData(updatedDoc);
      setShowVerifyConfirm(false);
      setSuccessMsg('Document successfully verified and digitally certified in the forensic ledger.');
      if (onUpdated) onUpdated(updatedDoc);
    } catch (err) {
      setErrorMsg(err.response?.data?.error?.message || err.message);
    } finally {
      setActionLoading(false);
    }
  };

  const handleFlagDocument = async () => {
    if (!flagReason || flagReason.trim().length < 5) {
      setErrorMsg('Please specify a detailed reason (minimum 5 characters) for flagging this document.');
      return;
    }

    try {
      setActionLoading(true);
      setErrorMsg(null);
      const res = await verificationService.flagDocument(docData._id, flagReason);
      const updatedDoc = res.data || res;
      setDocData(updatedDoc);
      setShowFlagModal(false);
      setSuccessMsg('Document flagged for forensic integrity anomaly.');
      if (onUpdated) onUpdated(updatedDoc);
    } catch (err) {
      setErrorMsg(err.response?.data?.error?.message || err.message);
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={
        <div className="flex items-center gap-2">
          <FileCheck2 className="w-5 h-5 text-amber-400" />
          <span className="text-slate-100 font-bold">Forensic Document Intelligence Dossier</span>
        </div>
      }
      size="2xl"
    >
      <div className="space-y-5 max-h-[80vh] overflow-y-auto pr-1">
        {/* Status Alerts */}
        {errorMsg && (
          <div className="p-3.5 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-300 text-xs flex items-center justify-between">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-rose-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs flex items-center justify-between">
            <span>{successMsg}</span>
            <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-emerald-200">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Mandatory Legal Authenticity Disclaimer */}
        <div className="p-4 rounded-xl bg-amber-950/30 border border-amber-500/30 space-y-1.5">
          <div className="flex items-center gap-2 text-amber-400 text-xs font-bold font-mono">
            <Info className="w-4 h-4 shrink-0" />
            <span>FORENSIC SYSTEM LEGAL NOTICE & DISCLAIMER</span>
          </div>
          <p className="text-[11px] text-slate-300 leading-relaxed">
            <strong>AI Extraction Confidence</strong> measures optical text recognition fidelity against digital document pixels.
            It does <span className="underline decoration-amber-400 font-semibold">NOT</span> certify physical evidentiary validity,
            legal authenticity, or genuine chain-of-custody prior to digital intake. Verifiers must cross-reference primary source evidence.
          </p>
        </div>

        {/* Document Header Info Bar */}
        <div className="p-4 rounded-xl bg-defense-900/90 border border-slate-800 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-xs font-mono font-bold text-cyan-400">
                  {docData.caseId?.caseNumber || 'CASE DOSSIER'}
                </span>
                <Badge variant={docData.status === 'verified' ? 'verified' : docData.status === 'flagged_tampered' ? 'tampered' : 'pending'} size="xs">
                  {docData.status.replace('_', ' ')}
                </Badge>
              </div>
              <h3 className="text-base font-bold text-slate-100">{docData.title}</h3>
              <div className="text-xs text-slate-400 font-mono mt-0.5">
                File: {docData.fileName} • SHA-256: <span className="text-slate-300">{docData.sha256Hash?.substring(0, 16)}...</span>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center">
              <Button
                variant="secondary"
                size="sm"
                className="text-xs gap-1.5 bg-cyan-950/60 border-cyan-500/40 text-cyan-300 hover:bg-cyan-900/60"
                onClick={handleOpenSecureView}
              >
                <ExternalLink className="w-3.5 h-3.5" />
                5m Secure View
              </Button>

              {isVerifierOrAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-slate-400 hover:text-slate-200"
                  onClick={handleReRunExtraction}
                  disabled={actionLoading}
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${actionLoading ? 'animate-spin' : ''}`} />
                </Button>
              )}
            </div>
          </div>

          {/* AI OCR & Classification Summary Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-800/80">
            <div className="p-2.5 rounded-lg bg-defense-950/60 border border-slate-800/80 space-y-1">
              <span className="text-[10px] font-mono text-slate-400 uppercase">AI Classification</span>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-cyan-300 uppercase font-mono">
                  {classification.predictedType || docData.documentType}
                </span>
                {classification.confidence && (
                  <span className="text-[10px] font-mono text-slate-400">
                    ({Math.round(classification.confidence * 100)}%)
                  </span>
                )}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-defense-950/60 border border-slate-800/80 space-y-1">
              <span className="text-[10px] font-mono text-slate-400 uppercase">Average OCR Confidence</span>
              <div>{getConfidenceBadge(avgConfidence)}</div>
            </div>

            <div className="p-2.5 rounded-lg bg-defense-950/60 border border-slate-800/80 space-y-1">
              <span className="text-[10px] font-mono text-slate-400 uppercase">Engine Architecture</span>
              <div className="text-xs font-mono text-slate-300 truncate">
                {ocrMetadata.engine || 'Gemini Vision / Fallback OCR'}
              </div>
            </div>
          </div>
        </div>

        {/* Structured Field Extractions & Verifier Corrections */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <h4 className="text-sm font-bold text-slate-200">
                Document-Specific Extracted Fields ({Object.keys(extractedFields).length})
              </h4>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              Schema: <span className="text-amber-400 font-bold uppercase">{docData.documentType}</span>
            </span>
          </div>

          {Object.keys(extractedFields).length === 0 ? (
            <div className="p-8 text-center rounded-xl bg-defense-900/40 border border-slate-800 space-y-2">
              <FileText className="w-8 h-8 text-slate-500 mx-auto" />
              <div className="text-xs text-slate-400">No structured fields extracted yet.</div>
              {isVerifierOrAdmin && (
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
                    className={`p-3.5 rounded-xl border transition-all ${
                      isCorrected
                        ? 'bg-defense-900/90 border-cyan-500/40 shadow-glow-cyan'
                        : isApproved
                        ? 'bg-defense-900/60 border-emerald-500/30'
                        : 'bg-defense-900/60 border-slate-800/80 hover:border-slate-700'
                    }`}
                  >
                    <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
                      {/* Field Metadata & Values */}
                      <div className="space-y-1.5 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono font-bold text-cyan-300">
                            {fieldName.replace(/([A-Z])/g, ' $1').toUpperCase()}
                          </span>
                          {getConfidenceBadge(fieldData.confidence)}
                          {isCorrected && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-cyan-950 text-cyan-300 border border-cyan-500/40 font-bold">
                              HUMAN CORRECTED
                            </span>
                          )}
                          {isApproved && (
                            <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-emerald-950 text-emerald-300 border border-emerald-500/40 font-bold">
                              CERTIFIED
                            </span>
                          )}
                        </div>

                        {/* Field Value Display or Inline Edit Form */}
                        {isEditing ? (
                          <div className="space-y-2 pt-1">
                            <textarea
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              rows={2}
                              className="w-full px-3 py-2 rounded-lg bg-defense-950 border border-cyan-500/50 text-xs text-slate-100 font-mono focus:outline-none focus:ring-1 focus:ring-cyan-400"
                              placeholder="Enter corrected forensic value..."
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
                            {/* Current Effective Value */}
                            <div className="text-xs font-semibold text-slate-100 bg-defense-950/70 p-2 rounded-lg font-mono border border-slate-800">
                              {typeof fieldData.value === 'object'
                                ? JSON.stringify(fieldData.value)
                                : String(fieldData.value || 'Not specified')}
                            </div>

                            {/* Non-destructive History audit if corrected */}
                            {isCorrected && (
                              <div className="p-2 rounded-lg bg-amber-950/20 border border-amber-500/20 text-[11px] font-mono space-y-1">
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
                                Source Reference: <span className="text-slate-300">{fieldData.sourceReference}</span>
                              </div>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Verifier Field Level Actions */}
                      {isVerifierOrAdmin && !isEditing && (
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

        {/* Verification Sign-off & Tamper Modals */}
        {showVerifyConfirm && (
          <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/40 space-y-3">
            <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold font-mono">
              <CheckCircle2 className="w-4 h-4" />
              <span>DIGITAL CERTIFICATION & SIGN-OFF</span>
            </div>
            <p className="text-xs text-slate-300">
              You are certifying that you have cross-examined the document fields against forensic standards.
              This action creates an immutable cryptographic audit record.
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

        {showFlagModal && (
          <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-500/40 space-y-3">
            <div className="flex items-center gap-2 text-rose-400 text-xs font-bold font-mono">
              <AlertTriangle className="w-4 h-4" />
              <span>FLAG TAMPERING OR FORENSIC DISCREPANCY</span>
            </div>
            <p className="text-xs text-slate-300">
              Flagging this document updates its status to <span className="text-rose-400 font-bold">FLAGGED_TAMPERED</span> and
              logs a critical security incident in the judicial audit hash chain.
            </p>
            <textarea
              value={flagReason}
              onChange={(e) => setFlagReason(e.target.value)}
              rows={2}
              placeholder="State precise reason for flagging (e.g. signature timestamp disparity, checksum alteration, low fidelity)..."
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

        {/* Action Footer Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <div className="text-xs text-slate-400 font-mono flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-emerald-400" />
            <span>Audited Verification Session</span>
          </div>

          <div className="flex items-center gap-2">
            {isVerifierOrAdmin && !showVerifyConfirm && !showFlagModal && (
              <>
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
              </>
            )}

            <Button size="sm" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
