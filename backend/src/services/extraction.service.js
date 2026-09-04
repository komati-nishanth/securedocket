const { Document, User, DOCUMENT_STATUS } = require('../models');
const aiOcrService = require('./aiOcr.service');
const s3Service = require('./s3.service');
const { recordAuditEntry } = require('./audit.service');
const { AUDIT_ACTIONS } = require('../constants/actions');
const { ROLES } = require('../constants/roles');
const ApiError = require('../utils/apiError');
const { HTTP_STATUS, ERROR_CODES } = require('../constants/statusCodes');
const config = require('../config/env');
const logger = require('../config/logger');
const vectorService = require('./vector.service');
const { encryptAES256GCM } = require('../utils/crypto');

const SENSITIVE_FIELDS = new Set([
  'complainant',
  'complainant_name',
  'accused',
  'accused_name',
  'witness',
  'witness_name',
  'address',
  'phone',
  'identification_number',
  'sections_laws',
  'person_name'
]);

/**
 * Helper to encrypt a field object's values if it is sensitive
 */
function encryptFieldValues(fieldObj) {
  if (!SENSITIVE_FIELDS.has(fieldObj.field)) {
    return fieldObj;
  }

  const encryptIfString = (val) => {
    if (typeof val === 'string' && val.trim().length > 0) {
      return encryptAES256GCM(val, config.masterEncryptionKey);
    }
    return val;
  };

  fieldObj.aiValue = encryptIfString(fieldObj.aiValue);
  fieldObj.humanValue = encryptIfString(fieldObj.humanValue);
  fieldObj.value = encryptIfString(fieldObj.value);
  fieldObj.isEncrypted = true;

  return fieldObj;
}

class ExtractionService {
  /**
   * Run OCR, Document Classification, and Field Extraction on a Vault Document
   */
  async extractAndProcessDocument(documentId) {
    const doc = await Document.findById(documentId).populate('caseId uploadedBy');
    if (!doc) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Document not found for OCR processing', ERROR_CODES.DOCUMENT_NOT_FOUND);
    }

    logger.info(`[Extraction Pipeline] Commencing AI OCR & extraction for doc ${doc._id} (${doc.fileName})`);

    // 1. Get file buffer from S3 or local vault
    let fileBuffer = await s3Service.getObjectBuffer(doc.s3Key);
    if (!fileBuffer || fileBuffer.length === 0) {
      fileBuffer = await s3Service.generateFallbackBuffer(doc);
    }

    // 2. Execute AI OCR Intelligence Pipeline
    let ocrResult;
    try {
      ocrResult = await aiOcrService.processDocument({
        fileBuffer,
        mimeType: doc.mimeType,
        fileName: doc.fileName,
        documentTypeHint: doc.documentType,
      });
    } catch (err) {
      logger.error(`[Extraction Pipeline] OCR processing failure for doc ${doc._id}`, { error: err.message });
      await recordAuditEntry({
        userId: doc.uploadedBy?._id || doc.uploadedBy,
        documentId: doc._id,
        caseId: doc.caseId?._id || doc.caseId,
        action: AUDIT_ACTIONS.OCR_EXTRACTION_FAILURE,
        details: { fileName: doc.fileName, error: err.message },
      });
      throw new ApiError(HTTP_STATUS.INTERNAL_SERVER_ERROR, `AI OCR extraction failed: ${err.message}`);
    }

    // 3. Transform extracted fields into non-destructive audit dictionary
    const structuredFields = {};
    const threshold = config.gemini.confidenceThreshold || 0.80;
    let hasLowConfidenceField = false;

    if (Array.isArray(ocrResult.fields)) {
      for (const f of ocrResult.fields) {
        const conf = typeof f.confidence === 'number' ? f.confidence : 0.85;
        if (conf < threshold) {
          hasLowConfidenceField = true;
        }

        // Preserve previous human corrections if re-running extraction
        const existingField = doc.extractedFields && doc.extractedFields[f.field];
        if (existingField && existingField.isCorrected) {
          structuredFields[f.field] = encryptFieldValues({
            field: f.field,
            aiValue: f.value,
            humanValue: existingField.humanValue,
            value: existingField.humanValue,
            confidence: conf,
            sourceReference: f.sourceReference || 'Document Body',
            status: existingField.status || 'corrected',
            isCorrected: true,
            correctedBy: existingField.correctedBy,
            correctedAt: existingField.correctedAt,
          });
        } else {
          structuredFields[f.field] = encryptFieldValues({
            field: f.field,
            aiValue: f.value,
            humanValue: null,
            value: f.value,
            confidence: conf,
            sourceReference: f.sourceReference || 'Document Body',
            status: conf >= 0.90 ? 'approved' : 'pending',
            isCorrected: false,
            correctedBy: null,
            correctedAt: null,
          });
        }
      }
    }

    // 4. Evaluate Review Threshold & Priority
    const avgConfidence = ocrResult.ocrMetadata?.averageConfidence || 0.85;
    const isBelowThreshold = avgConfidence < threshold || hasLowConfidenceField;

    let reviewPriority = 'low';
    if (avgConfidence < 0.65) reviewPriority = 'critical';
    else if (avgConfidence < 0.80 || hasLowConfidenceField) reviewPriority = 'high';
    else if (avgConfidence < 0.90) reviewPriority = 'medium';

    // 5. Update MongoDB Record
    doc.extractedFields = structuredFields;
    doc.classification = {
      predictedType: ocrResult.classification?.predictedType || doc.documentType,
      confidence: ocrResult.classification?.confidence || avgConfidence,
      reasoning: ocrResult.classification?.reasoning || 'Extracted via Document Intelligence Engine',
      classifiedAt: new Date(),
    };
    doc.ocrConfidence = Math.round(avgConfidence * 100);
    doc.ocrMetadata = {
      engine: ocrResult.ocrMetadata?.engine || 'local-legal-ocr-engine',
      processedAt: new Date(),
      averageConfidence: avgConfidence,
      needsHumanReview: isBelowThreshold || doc.status === DOCUMENT_STATUS.PENDING_REVIEW,
      reviewPriority,
      rawTextLength: ocrResult.ocrMetadata?.rawTextLength || (ocrResult.rawText ? ocrResult.rawText.length : 0),
    };
    doc.extractedText = ocrResult.rawText || '';

    // Generate semantic embedding
    if (doc.extractedText) {
      const embedding = await vectorService.generateEmbedding(doc.extractedText);
      if (embedding) {
        doc.embeddingVector = embedding;
        doc.markModified('embeddingVector');
      }
    }

    // Mark modified for mixed schema
    doc.markModified('extractedFields');
    doc.markModified('classification');
    doc.markModified('ocrMetadata');

    await doc.save();

    await recordAuditEntry({
      userId: doc.uploadedBy?._id || doc.uploadedBy,
      documentId: doc._id,
      caseId: doc.caseId?._id || doc.caseId,
      action: AUDIT_ACTIONS.OCR_EXTRACTION_SUCCESS,
      details: {
        engine: doc.ocrMetadata.engine,
        averageConfidence: avgConfidence,
        classifiedAs: doc.classification.predictedType,
        needsHumanReview: doc.ocrMetadata.needsHumanReview,
        fieldCount: Object.keys(structuredFields).length,
      },
    });

    logger.info(`[Extraction Pipeline] Successfully processed doc ${doc._id}. Avg Conf: ${(avgConfidence * 100).toFixed(1)}%. Review Needed: ${doc.ocrMetadata.needsHumanReview}`);

    return doc;
  }

  /**
   * Correct a single extracted field (Preserves original AI value)
   * Forensic Verifiers, Administrators, and Investigating Officers can perform corrections
   */
  async correctField({ documentId, fieldName, correctedValue, user }) {
    if (![ROLES.VERIFIER, ROLES.ADMIN, ROLES.OFFICER].includes(user.role)) {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        `Access forbidden: Role '${user.role}' is not authorized to modify forensic extraction values.`,
        ERROR_CODES.INSUFFICIENT_PERMISSIONS
      );
    }

    const doc = await Document.findById(documentId).populate('caseId');
    if (!doc) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Document not found', ERROR_CODES.DOCUMENT_NOT_FOUND);
    }

    if (!doc.extractedFields) {
      doc.extractedFields = {};
    }

    const existing = doc.extractedFields[fieldName] || {
      field: fieldName,
      aiValue: null,
      confidence: 1.0,
      sourceReference: 'Manual Entry',
    };

    const previousValue = existing.value;
    const aiOriginalValue = existing.aiValue !== undefined ? existing.aiValue : previousValue;

    doc.extractedFields[fieldName] = encryptFieldValues({
      ...existing,
      field: fieldName,
      aiValue: aiOriginalValue, // Preserve original AI value
      humanValue: correctedValue,
      value: correctedValue,
      isCorrected: true,
      status: 'corrected',
      correctedBy: user.id,
      correctedAt: new Date(),
    });

    doc.markModified('extractedFields');
    await doc.save();

    await recordAuditEntry({
      userId: user.id,
      documentId: doc._id,
      caseId: doc.caseId?._id || doc.caseId,
      action: AUDIT_ACTIONS.DOCUMENT_FIELD_CORRECT,
      details: {
        fieldName,
        originalAiValue: aiOriginalValue,
        previousValue,
        correctedValue,
        correctedByRole: user.role,
      },
    });

    logger.info(`[Field Correction] Field '${fieldName}' corrected for doc ${doc._id} by ${user.role} ${user.id}`);

    return doc;
  }

  /**
   * Approve a field extraction without modification
   */
  async approveField({ documentId, fieldName, user }) {
    if (![ROLES.VERIFIER, ROLES.ADMIN, ROLES.OFFICER].includes(user.role)) {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        `Access forbidden: Role '${user.role}' is not authorized to approve forensic fields.`,
        ERROR_CODES.INSUFFICIENT_PERMISSIONS
      );
    }

    const doc = await Document.findById(documentId);
    if (!doc || !doc.extractedFields || !doc.extractedFields[fieldName]) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, `Field '${fieldName}' not found in document extraction`);
    }

    doc.extractedFields[fieldName].status = 'approved';
    doc.extractedFields[fieldName].approvedBy = user.id;
    doc.extractedFields[fieldName].approvedAt = new Date();

    doc.markModified('extractedFields');
    await doc.save();

    return doc;
  }

  /**
   * Finalize verification and certify document dossier
   */
  async verifyDocument({ documentId, user, notes = '' }) {
    if (![ROLES.VERIFIER, ROLES.ADMIN].includes(user.role)) {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        `Access forbidden: Role '${user.role}' cannot certify or verify legal evidence documents.`,
        ERROR_CODES.INSUFFICIENT_PERMISSIONS
      );
    }

    const doc = await Document.findById(documentId).populate('caseId uploadedBy');
    if (!doc) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Document not found', ERROR_CODES.DOCUMENT_NOT_FOUND);
    }

    doc.status = DOCUMENT_STATUS.VERIFIED;
    doc.verifiedBy = user.id;
    doc.verifiedAt = new Date();
    doc.verificationNotes = notes.trim();
    if (doc.ocrMetadata) {
      doc.ocrMetadata.needsHumanReview = false;
    }

    doc.markModified('ocrMetadata');
    await doc.save();

    await recordAuditEntry({
      userId: user.id,
      documentId: doc._id,
      caseId: doc.caseId?._id || doc.caseId,
      action: AUDIT_ACTIONS.DOCUMENT_VERIFY,
      details: {
        verifiedByBadge: user.badgeNumber,
        verifiedByRole: user.role,
        notes: doc.verificationNotes,
        sha256Hash: doc.sha256Hash,
      },
    });

    logger.info(`[Forensic Verification] Document ${doc._id} certified and verified by ${user.name}`);

    return doc;
  }

  /**
   * Flag document for discrepancy, tampering, or illegibility
   */
  async flagDocument({ documentId, user, reason }) {
    if (![ROLES.VERIFIER, ROLES.ADMIN, ROLES.OFFICER].includes(user.role)) {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        `Access forbidden: Role '${user.role}' cannot flag legal documents.`,
        ERROR_CODES.INSUFFICIENT_PERMISSIONS
      );
    }

    if (!reason || reason.trim().length < 5) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'A detailed reason (min 5 characters) is required when flagging a document.');
    }

    const doc = await Document.findById(documentId).populate('caseId');
    if (!doc) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Document not found', ERROR_CODES.DOCUMENT_NOT_FOUND);
    }

    doc.status = DOCUMENT_STATUS.FLAGGED_TAMPERED;
    doc.isTampered = true;
    doc.tamperFlags.push({
      flaggedAt: new Date(),
      flaggedBy: user.id,
      reason: reason.trim(),
      expectedHash: doc.sha256Hash,
      computedHash: doc.sha256Hash,
    });

    if (doc.ocrMetadata) {
      doc.ocrMetadata.needsHumanReview = true;
      doc.ocrMetadata.reviewPriority = 'critical';
    }

    doc.markModified('ocrMetadata');
    await doc.save();

    await recordAuditEntry({
      userId: user.id,
      documentId: doc._id,
      caseId: doc.caseId?._id || doc.caseId,
      action: AUDIT_ACTIONS.DOCUMENT_TAMPER_FLAG,
      details: {
        reason: reason.trim(),
        flaggedByRole: user.role,
        flaggedByBadge: user.badgeNumber,
      },
    });

    logger.warn(`[Tamper Flag] Document ${doc._id} flagged by ${user.role} ${user.id}: ${reason}`);

    return doc;
  }

  /**
   * Retrieve documents in the Verifier Review Queue
   */
  async getVerificationQueue({ status, priority, documentType, page = 1, limit = 20, search }) {
    const conditions = [];

    if (status && status !== 'all') {
      if (status === 'flagged_tampered' || status === 'tampered') {
        conditions.push({
          $or: [{ status: DOCUMENT_STATUS.FLAGGED_TAMPERED }, { isTampered: true }],
        });
      } else {
        conditions.push({ status });
      }
    } else if (status === 'all') {
      // no status condition
    } else {
      // Default: show documents needing review or flagged as tampered
      conditions.push({
        $or: [
          { status: { $in: [DOCUMENT_STATUS.PENDING_REVIEW, DOCUMENT_STATUS.PENDING_OCR, DOCUMENT_STATUS.OCR_COMPLETED, DOCUMENT_STATUS.FLAGGED_TAMPERED] } },
          { isTampered: true },
        ],
      });
    }

    if (priority) {
      conditions.push({ 'ocrMetadata.reviewPriority': priority });
    }

    if (documentType) {
      conditions.push({ documentType });
    }

    if (search && search.trim().length > 0) {
      const s = search.trim();
      conditions.push({
        $or: [
          { title: { $regex: s, $options: 'i' } },
          { fileName: { $regex: s, $options: 'i' } },
          { sha256Hash: { $regex: s, $options: 'i' } },
        ],
      });
    }

    const query = conditions.length === 1 ? conditions[0] : (conditions.length > 1 ? { $and: conditions } : {});

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [documents, total] = await Promise.all([
      Document.find(query)
        .populate('uploadedBy', 'name email badgeNumber role')
        .populate('caseId', 'caseNumber title status leadOfficer')
        .populate('verifiedBy', 'name email badgeNumber role')
        .sort({ 'ocrMetadata.needsHumanReview': -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Document.countDocuments(query),
    ]);

    const { decryptDocumentFields } = require('../utils/crypto');
    const decryptedDocs = documents.map(doc => decryptDocumentFields(doc, config.masterEncryptionKey));

    return {
      documents: decryptedDocs,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        pages: Math.ceil(total / limitNum),
      },
    };
  }
}

module.exports = new ExtractionService();
