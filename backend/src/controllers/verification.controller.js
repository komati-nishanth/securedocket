const ApiResponse = require('../utils/apiResponse');
const ApiError = require('../utils/apiError');
const extractionService = require('../services/extraction.service');
const { Document } = require('../models');
const config = require('../config/env');
const { decryptDocumentFields } = require('../utils/crypto');

/**
 * Helper to safely decrypt a mongoose document or plain object
 */
function safeDecryptDoc(doc) {
  if (!doc) return doc;
  const plainDoc = doc.toObject ? doc.toObject() : doc;
  return decryptDocumentFields(plainDoc, config.masterEncryptionKey);
}

/**
 * Controller for Forensic Document Verification, AI Extraction Review, and Human Corrections
 */

/**
 * GET /api/v1/verification/queue
 * List documents in the Verifier Review Queue
 */
async function getVerificationQueue(req, res) {
  const { status, priority, documentType, page, limit, search } = req.query;

  const result = await extractionService.getVerificationQueue({
    status,
    priority,
    documentType,
    page,
    limit,
    search,
  });

  return ApiResponse.success(res, {
    message: 'Verification review queue retrieved',
    data: result.documents,
    meta: result.pagination,
  });
}

/**
 * GET /api/v1/verification/:id
 * Get extraction breakdown, classification, and field confidence dossier
 */
async function getDocumentExtraction(req, res) {
  const { id } = req.params;

  const doc = await Document.findById(id)
    .populate('uploadedBy', 'name email badgeNumber role department')
    .populate('caseId', 'caseNumber title status leadOfficer')
    .populate('verifiedBy', 'name email badgeNumber role')
    .lean();

  if (!doc) {
    throw ApiError.notFound('Target evidence document not found');
  }

  const decrypted = safeDecryptDoc(doc);

  return ApiResponse.success(res, {
    message: 'Document extraction intelligence retrieved',
    data: decrypted,
  });
}

/**
 * POST /api/v1/verification/:id/extract
 * Run or re-run AI OCR and structured extraction pipeline
 */
async function triggerExtraction(req, res) {
  const { id } = req.params;

  const updatedDoc = await extractionService.extractAndProcessDocument(id);
  const decrypted = safeDecryptDoc(updatedDoc);

  return ApiResponse.success(res, {
    message: 'Document OCR and field extraction completed successfully',
    data: decrypted,
  });
}

/**
 * PATCH /api/v1/verification/:id/fields
 * Correct an extracted field (Preserves original AI value and records reviewer correction)
 */
async function updateFieldCorrection(req, res) {
  const { id } = req.params;
  const { fieldName, correctedValue } = req.body;

  if (!fieldName || correctedValue === undefined) {
    throw ApiError.badRequest('Both fieldName and correctedValue are required');
  }

  const updatedDoc = await extractionService.correctField({
    documentId: id,
    fieldName,
    correctedValue,
    user: req.user,
  });

  const decrypted = safeDecryptDoc(updatedDoc);

  return ApiResponse.success(res, {
    message: `Field '${fieldName}' updated and human correction recorded in audit trail`,
    data: decrypted,
  });
}

/**
 * POST /api/v1/verification/:id/fields/approve
 * Mark an extracted field as approved
 */
async function approveField(req, res) {
  const { id } = req.params;
  const { fieldName } = req.body;

  if (!fieldName) {
    throw ApiError.badRequest('fieldName is required');
  }

  const updatedDoc = await extractionService.approveField({
    documentId: id,
    fieldName,
    user: req.user,
  });

  const decrypted = safeDecryptDoc(updatedDoc);

  return ApiResponse.success(res, {
    message: `Field '${fieldName}' approved`,
    data: decrypted,
  });
}

/**
 * POST /api/v1/verification/:id/verify
 * Finalize forensic verification and digitally certify document
 */
async function verifyDocument(req, res) {
  const { id } = req.params;
  const { notes } = req.body;

  const verifiedDoc = await extractionService.verifyDocument({
    documentId: id,
    user: req.user,
    notes,
  });

  const decrypted = safeDecryptDoc(verifiedDoc);

  return ApiResponse.success(res, {
    message: 'Document successfully verified and digitally certified by Forensic Verifier',
    data: decrypted,
  });
}

/**
 * POST /api/v1/verification/:id/flag
 * Flag document for anomaly, tampering, or illegibility
 */
async function flagDocument(req, res) {
  const { id } = req.params;
  const { reason } = req.body;

  if (!reason) {
    throw ApiError.badRequest('Reason is required when flagging a document');
  }

  const flaggedDoc = await extractionService.flagDocument({
    documentId: id,
    user: req.user,
    reason,
  });

  const decrypted = safeDecryptDoc(flaggedDoc);

  return ApiResponse.success(res, {
    message: 'Document flagged for forensic review / potential tampering',
    data: decrypted,
  });
}

module.exports = {
  getVerificationQueue,
  getDocumentExtraction,
  triggerExtraction,
  updateFieldCorrection,
  approveField,
  verifyDocument,
  flagDocument,
};
