import api from './api';

export const verificationService = {
  /**
   * Get documents awaiting forensic verification / low confidence review
   */
  getVerificationQueue: (params = {}) => {
    return api.get('/verification/queue', { params });
  },

  /**
   * Get single document extraction dossier with field breakdown
   */
  getDocumentExtraction: (id) => {
    return api.get(`/verification/${id}`);
  },

  /**
   * Trigger / Re-run AI OCR and extraction pipeline
   */
  triggerExtraction: (id) => {
    return api.post(`/verification/${id}/extract`);
  },

  /**
   * Submit human field correction (preserves original AI value)
   */
  correctField: (id, fieldName, correctedValue) => {
    return api.patch(`/verification/${id}/fields`, {
      fieldName,
      correctedValue,
    });
  },

  /**
   * Approve single field extraction without changes
   */
  approveField: (id, fieldName) => {
    return api.post(`/verification/${id}/fields/approve`, {
      fieldName,
    });
  },

  /**
   * Finalize forensic verification and digitally sign off
   */
  verifyDocument: (id, notes = '') => {
    return api.post(`/verification/${id}/verify`, { notes });
  },

  /**
   * Flag document for anomaly, tampering, or illegibility
   */
  flagDocument: (id, reason) => {
    return api.post(`/verification/${id}/flag`, { reason });
  },
};
