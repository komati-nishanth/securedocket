import React, { useState, useEffect } from 'react';
import {
  FileCheck2,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  Filter,
  Search,
  ExternalLink,
  Eye,
  RefreshCw,
  ShieldCheck,
  Info,
} from 'lucide-react';
import { Card } from '../../components/common/Card';
import { Badge } from '../../components/common/Badge';
import { Button } from '../../components/common/Button';
import { Spinner } from '../../components/common/Spinner';
import { useAuth } from '../../hooks/useAuth';
import { verificationService } from '../../services/verificationService';
import { documentService } from '../../services/documentService';
import { DocumentReviewModal } from '../../components/verification/DocumentReviewModal';

export function VerificationQueue() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [search, setSearch] = useState('');
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadQueue = async () => {
    try {
      setLoading(true);
      const res = await verificationService.getVerificationQueue({
        status: statusFilter || undefined,
        priority: priorityFilter || undefined,
        documentType: typeFilter || undefined,
        search: search || undefined,
      });
      const docs = Array.isArray(res.data) ? res.data : (Array.isArray(res) ? res : []);
      setDocuments(docs);
    } catch (err) {
      console.error('Failed to load verification queue:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadQueue();
  }, [statusFilter, priorityFilter, typeFilter]);

  const handleSearchSubmit = (e) => {
    e.preventDefault();
    loadQueue();
  };

  const handleOpenReview = (doc) => {
    setSelectedDoc(doc);
    setIsModalOpen(true);
  };

  const handleOpenSecureView = async (docId, e) => {
    e.stopPropagation();
    try {
      const res = await documentService.getDocumentViewUrl(docId);
      const url = res.data?.url || res.data?.viewUrl || res.url;
      if (url) {
        window.open(url, '_blank', 'noopener,noreferrer');
      }
    } catch (err) {
      alert('Failed to generate 5-minute presigned streaming link: ' + (err.response?.data?.error?.message || err.message));
    }
  };

  const getConfidenceBadge = (confidence) => {
    const score = typeof confidence === 'number' ? (confidence <= 1 ? Math.round(confidence * 100) : confidence) : 85;
    if (score >= 90) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-500/40">
          {score}%
        </span>
      );
    }
    if (score >= 80) {
      return (
        <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-amber-950/80 text-amber-400 border border-amber-500/40">
          {score}%
        </span>
      );
    }
    return (
      <span className="px-2 py-0.5 rounded text-[11px] font-mono font-bold bg-rose-950/80 text-rose-400 border border-rose-500/40 animate-pulse">
        {score}%
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl bg-gradient-to-r from-defense-900 via-defense-950 to-defense-900 border border-slate-800">
        <div>
          <div className="flex items-center gap-2 text-amber-400 text-xs font-mono font-semibold mb-1">
            <FileCheck2 className="w-4 h-4" />
            <span>CENTRAL FORENSIC SCIENCE LABORATORY • VERIFICATION CONSOLE</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-100">Evidentiary Verification Queue</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Cross-examine AI OCR extractions, apply human verifier corrections, and issue cryptographic certifications.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={loadQueue} className="text-xs gap-1.5">
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh Queue
          </Button>
        </div>
      </div>

      {/* Mandatory Disclaimer */}
      <div className="p-3.5 rounded-xl bg-defense-900/60 border border-amber-500/30 text-xs text-slate-300 flex items-center gap-3">
        <Info className="w-4 h-4 text-amber-400 shrink-0" />
        <div>
          <span className="font-semibold text-amber-300">Intake Integrity Protocol:</span> The system establishes integrity of records and actions after intake. Real-world authenticity before upload is outside the system's verification scope. Forensic verifier corrections seal immutable v2 revisions and are recorded in the cryptographic audit hash chain.
        </div>
      </div>

      {/* Filter & Search Toolbar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-3 p-4 rounded-xl bg-defense-900/80 border border-slate-800">
        {/* Search */}
        <form onSubmit={handleSearchSubmit} className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search case #, title, or hash..."
            className="w-full pl-9 pr-3 py-1.5 rounded-lg bg-defense-950 border border-slate-700 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-cyan-500"
          />
        </form>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-1.5 text-xs text-slate-400 font-mono">
            <Filter className="w-3.5 h-3.5" />
            <span>Filters:</span>
          </div>

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-defense-950 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
          >
            <option value="">Status: Active Queue</option>
            <option value="pending_review">Pending Review</option>
            <option value="flagged_tampered">Flagged Anomaly</option>
            <option value="verified">Verified Documents</option>
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-defense-950 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
          >
            <option value="">Category: All</option>
            <option value="FIR">FIR</option>
            <option value="statement">Statement</option>
            <option value="chargesheet">Chargesheet</option>
            <option value="evidence">Evidence</option>
            <option value="forensic_report">Forensic Report</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(e) => setPriorityFilter(e.target.value)}
            className="px-2.5 py-1.5 rounded-lg bg-defense-950 border border-slate-700 text-xs text-slate-200 focus:outline-none focus:ring-1 focus:ring-cyan-500 font-mono"
          >
            <option value="">Priority: All</option>
            <option value="critical">Critical Anomaly</option>
            <option value="high">High (Low Conf)</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>
        </div>
      </div>

      {/* Queue List Table */}
      <Card
        title={`Verification Backlog (${documents.length})`}
        subtitle="Documents undergoing optical character intelligence and human verifier reconciliation"
      >
        {loading ? (
          <div className="py-16 text-center">
            <Spinner size="lg" />
          </div>
        ) : documents.length === 0 ? (
          <div className="py-16 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
            <div className="text-sm font-semibold text-slate-300">All Evidentiary Dockets Reconciled</div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              No documents are currently awaiting forensic verification with the selected filter criteria.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-defense-950/40 text-slate-400 font-mono">
                <tr>
                  <th className="py-3 px-4">Case # & Document</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4">AI Confidence</th>
                  <th className="py-3 px-4">Review Priority</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Uploading Officer</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {documents.map((doc) => {
                  const conf = doc.ocrMetadata?.averageConfidence ? Math.round(doc.ocrMetadata.averageConfidence * 100) : (doc.ocrConfidence || 85);
                  const priority = doc.ocrMetadata?.reviewPriority || 'medium';

                  return (
                    <tr
                      key={doc._id}
                      onClick={() => handleOpenReview(doc)}
                      className="hover:bg-defense-900/80 cursor-pointer transition-colors group"
                    >
                      <td className="py-3 px-4 space-y-0.5">
                        <div className="font-mono font-bold text-cyan-400 group-hover:text-cyan-300">
                          {doc.caseId?.caseNumber || 'CR/2026/XXXX'}
                        </div>
                        <div className="font-semibold text-slate-200">{doc.title}</div>
                        <div className="text-[10px] font-mono text-slate-400">{doc.fileName}</div>
                      </td>

                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono uppercase bg-defense-950 border border-slate-700 text-amber-300 font-semibold">
                          {doc.documentType}
                        </span>
                      </td>

                      <td className="py-3 px-4">{getConfidenceBadge(conf)}</td>

                      <td className="py-3 px-4">
                        <span
                          className={`text-[11px] font-mono font-semibold uppercase ${
                            priority === 'critical'
                              ? 'text-rose-400'
                              : priority === 'high'
                              ? 'text-amber-400'
                              : 'text-slate-300'
                          }`}
                        >
                          {priority}
                        </span>
                      </td>

                      <td className="py-3 px-4">
                        <Badge
                          variant={
                            doc.status === 'verified'
                              ? 'verified'
                              : doc.status === 'flagged_tampered'
                              ? 'tampered'
                              : 'pending'
                          }
                          size="xs"
                        >
                          {doc.status.replace('_', ' ')}
                        </Badge>
                      </td>

                      <td className="py-3 px-4 text-slate-300">
                        <div>{doc.uploadedBy?.name || 'Assigned Officer'}</div>
                        <div className="text-[10px] font-mono text-slate-400">
                          {doc.uploadedBy?.badgeNumber || 'CCB-XXXX'}
                        </div>
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <Button
                            size="sm"
                            variant="secondary"
                            className="text-xs h-7 px-2 bg-cyan-950/60 border-cyan-500/40 text-cyan-300 hover:bg-cyan-900/60"
                            onClick={(e) => handleOpenSecureView(doc._id, e)}
                            title="5m Secure View"
                          >
                            <ExternalLink className="w-3 h-3 mr-1" />
                            5m View
                          </Button>

                          <Button
                            size="sm"
                            variant="primary"
                            className="text-xs h-7 px-2.5"
                            onClick={() => handleOpenReview(doc)}
                          >
                            Inspect & Review
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Interactive Review Modal */}
      {selectedDoc && (
        <DocumentReviewModal
          isOpen={isModalOpen}
          onClose={() => {
            setIsModalOpen(false);
            setSelectedDoc(null);
          }}
          document={selectedDoc}
          userRole={user?.role}
          onUpdated={(updated) => {
            setSelectedDoc(updated);
            loadQueue();
          }}
        />
      )}
    </div>
  );
}
