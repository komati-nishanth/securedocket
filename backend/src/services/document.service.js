const crypto = require('crypto');
const { Document, Case, User, DOCUMENT_STATUS, ALL_DOCUMENT_TYPES } = require('../models');
const ApiError = require('../utils/apiError');
const { ERROR_CODES, HTTP_STATUS } = require('../constants/statusCodes');
const { ROLES } = require('../constants/roles');
const { AUDIT_ACTIONS } = require('../constants/actions');
const { validateUploadedFile, generateServerS3Key } = require('../utils/fileValidator');
const s3Service = require('./s3.service');
const auditService = require('./audit.service');
const { calculateSha256, timingSafeEqual, decryptDocumentFields } = require('../utils/crypto');
const config = require('../config/env');
const logger = require('../config/logger');

class DocumentService {
  /**
   * Securely ingest and cryptographically hash an evidence document
   */
  async ingestDocument({ caseId, title, documentType, file, description, tags = [], user }) {
    // 1. Verify Case Existence and Clearance
    const caseItem = await Case.findById(caseId);
    if (!caseItem) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Target case file not found in registry', ERROR_CODES.CASE_NOT_FOUND);
    }

    // Role-based boundary: Officer must be assigned to this specific case
    if (user.role === ROLES.OFFICER) {
      const isLead = caseItem.leadOfficer?.toString() === user.id.toString();
      const isAssigned = Array.isArray(caseItem.assignedOfficers) && caseItem.assignedOfficers.some(
        (id) => (id._id ? id._id.toString() : id.toString()) === user.id.toString()
      );

      if (!isLead && !isAssigned) {
        logger.warn(`Unauthorized upload attempt: Officer ${user.id} attempted to upload to unassigned case ${caseId}`);
        throw new ApiError(
          HTTP_STATUS.FORBIDDEN,
          'Access forbidden: You cannot upload evidence to an unassigned case dossier.',
          ERROR_CODES.INSUFFICIENT_PERMISSIONS
        );
      }
    }

    // 2. Validate Document Category
    if (!documentType || !ALL_DOCUMENT_TYPES.includes(documentType)) {
      throw new ApiError(
        HTTP_STATUS.BAD_REQUEST,
        `Invalid document category. Allowed categories: ${ALL_DOCUMENT_TYPES.join(', ')}`,
        ERROR_CODES.INVALID_INPUT
      );
    }

    // 3. Security Validation & Binary Magic-Number Verification
    const fileValidation = validateUploadedFile(file);

    // 4. Calculate Exact SHA-256 Hash of Accepted Bytes
    const sha256Hash = calculateSha256(file.buffer);

    // 5. Generate Server-Controlled S3 Key
    const s3Key = generateServerS3Key(caseItem.caseNumber, fileValidation.sanitizedName);

    // 6. Store File Bytes in AWS S3 Vault with SSE-S3 Encryption
    const s3UploadResult = await s3Service.uploadDocument({
      key: s3Key,
      fileBuffer: file.buffer,
      mimeType: fileValidation.mimeType,
      metadata: {
        caseNumber: caseItem.caseNumber,
        sha256Hash,
        uploadedBy: user.id,
      },
    });

    // 7. Store Metadata only in MongoDB
    const newDoc = await Document.create({
      caseId: caseItem._id,
      title: title ? title.trim() : fileValidation.sanitizedName,
      documentType,
      s3Key,
      s3Bucket: s3UploadResult.bucket,
      fileName: fileValidation.sanitizedName,
      originalName: fileValidation.originalName,
      fileSize: fileValidation.fileSize,
      mimeType: fileValidation.mimeType,
      uploadedBy: user.id,
      sha256Hash,
      status: DOCUMENT_STATUS.PENDING_REVIEW,
      version: 1,
      versions: [
        {
          versionNumber: 1,
          version: 1,
          s3Key,
          sha256Hash,
          fileSize: fileValidation.fileSize,
          mimeType: fileValidation.mimeType,
          uploadedBy: user.id,
          uploadedAt: new Date(),
          createdAt: new Date(),
          changeDescription: 'Initial secure ingestion',
          changeNotes: 'Initial secure ingestion',
        },
      ],
      metadata: {
        description: description ? description.trim() : '',
        tags: Array.isArray(tags) ? tags : [],
      },
    });

    // 8. Trigger AI OCR, Classification & Structured Extraction Pipeline
    try {
      const extractionService = require('./extraction.service');
      await extractionService.extractAndProcessDocument(newDoc._id);
    } catch (err) {
      logger.warn(`[Document Ingestion] Automated extraction encountered non-blocking issue: ${err.message}`);
    }

    const populated = await Document.findById(newDoc._id)
      .populate('uploadedBy', 'name email badgeNumber role')
      .populate('caseId', 'caseNumber title status')
      .lean();

    logger.info(`[Document Ingestion] Successfully vaulted document ${newDoc.fileName}`, {
      documentId: newDoc._id,
      caseNumber: caseItem.caseNumber,
      sha256Hash,
      sizeBytes: fileValidation.fileSize,
    });

    return populated;
  }

  /**
   * Upload Document Alias for Ingestion
   */
  async uploadDocument(metadata, file, user) {
    if (file && user) {
      return this.ingestDocument({ ...metadata, file, user });
    }
    return this.ingestDocument(metadata);
  }

  /**
   * List vaulted documents with role-based scoping
   */
  async listDocuments({ caseId, documentType, status, page = 1, limit = 20, search }, user) {
    const queryConditions = [];

    // Role-based data scoping for Officers
    if (user.role === ROLES.OFFICER) {
      // Find cases assigned to this officer
      const assignedCases = await Case.find({
        $or: [{ leadOfficer: user.id }, { assignedOfficers: user.id }],
      }).select('_id');
      const assignedCaseIds = assignedCases.map((c) => c._id);
      queryConditions.push({ caseId: { $in: assignedCaseIds } });
    }

    if (caseId) {
      queryConditions.push({ caseId });
    }

    if (documentType) {
      queryConditions.push({ documentType });
    }

    if (status) {
      queryConditions.push({ status });
    }

    if (search) {
      queryConditions.push({
        $or: [
          { title: { $regex: search, $options: 'i' } },
          { fileName: { $regex: search, $options: 'i' } },
          { sha256Hash: { $regex: search, $options: 'i' } },
        ],
      });
    }

    const query = queryConditions.length > 0 ? { $and: queryConditions } : {};

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const [documents, total] = await Promise.all([
      Document.find(query)
        .populate('uploadedBy', 'name email badgeNumber role')
        .populate('verifiedBy', 'name email badgeNumber role')
        .populate('caseId', 'caseNumber title status')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Document.countDocuments(query),
    ]);

    // Decrypt any sensitive fields before returning
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

  /**
   * Get single document metadata with clearance check
   */
  async getDocumentById(documentId, user) {
    const doc = await Document.findById(documentId)
      .populate('uploadedBy', 'name email badgeNumber role')
      .populate('verifiedBy', 'name email badgeNumber role')
      .populate('caseId', 'caseNumber title status leadOfficer assignedOfficers')
      .lean();

    if (!doc) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Document not found in vault', ERROR_CODES.DOCUMENT_NOT_FOUND);
    }

    // Role-based boundary enforcement for Officer
    if (user && user.role === ROLES.OFFICER && doc.caseId) {
      const caseItem = doc.caseId;
      const isLead = (caseItem.leadOfficer?._id || caseItem.leadOfficer)?.toString() === user.id.toString();
      const isAssigned = Array.isArray(caseItem.assignedOfficers) && caseItem.assignedOfficers.some(
        (o) => (o._id ? o._id.toString() : o.toString()) === user.id.toString()
      );

      if (!isLead && !isAssigned) {
        throw new ApiError(
          HTTP_STATUS.FORBIDDEN,
          'Access forbidden: You do not have clearance for this case file.',
          ERROR_CODES.INSUFFICIENT_PERMISSIONS
        );
      }
    }

    return decryptDocumentFields(doc, config.masterEncryptionKey);
  }

  /**
   * Generate 5-Minute Presigned S3 Access URL
   * Enforces clearance check & returns temporary access token
   */
  async generatePresignedViewUrl(documentIdOrOptions, maybeUser, expiresInSeconds = 300, disposition = 'inline') {
    let documentId, user, expires, disp;
    if (typeof documentIdOrOptions === 'object' && documentIdOrOptions !== null && documentIdOrOptions.documentId) {
      documentId = documentIdOrOptions.documentId;
      user = documentIdOrOptions.user;
      expires = documentIdOrOptions.expiresInSeconds || 300;
      disp = documentIdOrOptions.disposition || 'inline';
    } else {
      documentId = documentIdOrOptions;
      user = maybeUser;
      expires = expiresInSeconds;
      disp = disposition;
    }

    const doc = await this.getDocumentById(documentId, user);

    const presignedData = await s3Service.getPresignedDownloadUrl(
      doc.s3Key,
      expires,
      doc._id.toString(),
      disp
    );

    // Record audit entry
    await auditService.recordAuditEntry({
      userId: user.id,
      action: 'DOCUMENT_VIEW',
      documentId: doc._id,
      caseId: doc.caseId,
      details: { expiresInSeconds, disposition },
    });

    logger.info(`[Secure Access] Generated presigned view URL for document ${doc._id}`, {
      userId: user.id,
      documentId: doc._id,
      expiresInSeconds,
      disposition,
    });

    return {
      url: presignedData.url,
      expiresInSeconds,
      expiresAt: presignedData.expiresAt,
      sha256Hash: doc.sha256Hash,
      mimeType: doc.mimeType,
      fileName: doc.fileName,
      document: doc,
    };
  }

  /**
   * Validate presigned HMAC token and stream document from vault
   */
  async getVaultStreamFile({ documentIdOrKey, expires, signature }) {
    if (!expires || isNaN(expires)) {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Presigned URL parameter "expires" is missing or invalid', ERROR_CODES.INVALID_INPUT);
    }

    const expiresNum = parseInt(expires, 10);
    const nowSec = Math.floor(Date.now() / 1000);
    if (nowSec > expiresNum) {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        'Presigned access URL has expired (5-minute TTL exceeded). Please generate a new access token in the DMS.',
        ERROR_CODES.INSUFFICIENT_PERMISSIONS
      );
    }

    if (!signature) {
      throw new ApiError(HTTP_STATUS.FORBIDDEN, 'Missing cryptographic HMAC presigned signature', ERROR_CODES.INVALID_CREDENTIALS);
    }

    const decodedTarget = decodeURIComponent(documentIdOrKey);
    let doc = null;

    const mongoose = require('mongoose');
    if (mongoose.Types.ObjectId.isValid(decodedTarget)) {
      doc = await Document.findById(decodedTarget).populate('caseId uploadedBy').lean();
    }
    if (!doc) {
      doc = await Document.findOne({ s3Key: decodedTarget }).populate('caseId uploadedBy').lean();
    }
    if (!doc) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Evidentiary document not found in vault registry', ERROR_CODES.DOCUMENT_NOT_FOUND);
    }

    // Validate HMAC Signature (check against document ID and s3Key)
    const config = require('../config/env');
    const expectedSigId = crypto
      .createHmac('sha256', config.jwt.accessSecret || 's3_secure_signing_secret')
      .update(`${doc._id.toString()}:${expires}`)
      .digest('hex');

    const expectedSigKey = crypto
      .createHmac('sha256', config.jwt.accessSecret || 's3_secure_signing_secret')
      .update(`${doc.s3Key}:${expires}`)
      .digest('hex');

    const isValidSignature = timingSafeEqual(expectedSigId, signature) || timingSafeEqual(expectedSigKey, signature);

    if (!isValidSignature) {
      logger.warn(`[Vault Security] Invalid presigned signature attempt for document ${doc._id}`);
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        'Cryptographic signature mismatch: Access token is invalid or has been tampered with.',
        ERROR_CODES.INVALID_CREDENTIALS
      );
    }

    // Retrieve file buffer from storage
    let buffer = await s3Service.getObjectBuffer(doc.s3Key);
    if (!buffer || buffer.length === 0) {
      logger.info(`[Vault Stream] Serving generated official evidentiary dossier plate for doc ${doc._id}`);
      buffer = await s3Service.generateFallbackBuffer(doc);
    }

    return {
      buffer,
      mimeType: doc.mimeType || 'application/pdf',
      fileName: doc.fileName || `${doc.title || 'document'}.pdf`,
      document: doc,
    };
  }

  /**
   * Create a new non-destructive document version
   */
  async createDocumentVersion({ documentId, file, changeDescription, updatedFields, title, user }) {
    // 1. RBAC Clearance Check
    if (user.role === ROLES.AUDITOR) {
      throw new ApiError(
        HTTP_STATUS.FORBIDDEN,
        'Access forbidden: Auditors are granted read-only oversight clearance and cannot modify documents.',
        ERROR_CODES.INSUFFICIENT_PERMISSIONS
      );
    }

    const doc = await Document.findById(documentId).populate('caseId');
    if (!doc) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Document not found in vault registry', ERROR_CODES.DOCUMENT_NOT_FOUND);
    }

    const caseItem = doc.caseId;
    if (user.role === ROLES.OFFICER) {
      const isLead = caseItem.leadOfficer?.toString() === user.id.toString();
      const isAssigned = Array.isArray(caseItem.assignedOfficers) && caseItem.assignedOfficers.some(
        (id) => (id._id ? id._id.toString() : id.toString()) === user.id.toString()
      );

      if (!isLead && !isAssigned) {
        throw new ApiError(
          HTTP_STATUS.FORBIDDEN,
          'Access forbidden: You cannot modify documents belonging to an unassigned case dossier.',
          ERROR_CODES.INSUFFICIENT_PERMISSIONS
        );
      }
    }

    // Determine next version number
    const currentVersion = doc.version || 1;
    const nextVersion = currentVersion + 1;

    let newS3Key = doc.s3Key;
    let newSha256Hash = doc.sha256Hash;
    let newFileSize = doc.fileSize;
    let newMimeType = doc.mimeType;
    let newFileName = doc.fileName;

    // Handle file replacement / upload if provided
    if (file) {
      const fileValidation = validateUploadedFile(file);
      newSha256Hash = calculateSha256(file.buffer);
      newS3Key = generateServerS3Key(caseItem.caseNumber, `v${nextVersion}_${fileValidation.sanitizedName}`);
      newFileSize = fileValidation.fileSize;
      newMimeType = fileValidation.mimeType;
      newFileName = fileValidation.sanitizedName;

      await s3Service.uploadDocument({
        key: newS3Key,
        fileBuffer: file.buffer,
        mimeType: newMimeType,
        metadata: {
          caseNumber: caseItem.caseNumber,
          sha256Hash: newSha256Hash,
          version: String(nextVersion),
          uploadedBy: user.id,
        },
      });
    }

    // Ensure initial version exists in versions array
    if (!doc.versions || doc.versions.length === 0) {
      doc.versions = [
        {
          versionNumber: 1,
          version: 1,
          s3Key: doc.s3Key,
          sha256Hash: doc.sha256Hash,
          fileSize: doc.fileSize,
          mimeType: doc.mimeType,
          uploadedBy: doc.uploadedBy,
          editedBy: doc.uploadedBy,
          createdAt: doc.createdAt || new Date(),
          uploadedAt: doc.createdAt || new Date(),
          changeDescription: 'Initial secure ingestion',
          changeNotes: 'Initial secure ingestion',
        },
      ];
    }

    const description = changeDescription || `Version ${nextVersion} revision`;

    // 2. Create Audit Record first to link ID
    const auditRecord = await auditService.recordAuditEntry({
      userId: user.id,
      action: AUDIT_ACTIONS.DOCUMENT_NEW_VERSION,
      documentId: doc._id,
      caseId: caseItem._id,
      details: {
        previousVersion: currentVersion,
        newVersion: nextVersion,
        previousHash: doc.sha256Hash,
        newHash: newSha256Hash,
        changeDescription: description,
        editorRole: user.role,
        hasNewFile: Boolean(file),
      },
    });

    // 3. Create Version Record
    const versionRecord = {
      versionNumber: nextVersion,
      version: nextVersion,
      s3Key: newS3Key,
      sha256Hash: newSha256Hash,
      fileSize: newFileSize,
      mimeType: newMimeType,
      uploadedBy: user.id,
      editedBy: user.id,
      createdAt: new Date(),
      uploadedAt: new Date(),
      changeDescription: description,
      changeNotes: description,
      extractedFields: updatedFields || doc.extractedFields,
      auditLogId: auditRecord._id,
    };

    doc.versions.push(versionRecord);
    doc.version = nextVersion;
    doc.s3Key = newS3Key;
    doc.sha256Hash = newSha256Hash;
    doc.fileSize = newFileSize;
    doc.mimeType = newMimeType;
    doc.fileName = newFileName;
    if (title) doc.title = title.trim();
    if (updatedFields) doc.extractedFields = updatedFields;

    await doc.save();

    logger.info(`[Version System] Created version v${nextVersion} for document ${doc._id}`, {
      userId: user.id,
      documentId: doc._id,
      versionNumber: nextVersion,
      sha256Hash: newSha256Hash,
    });

    return doc;
  }

  /**
   * Get all version records for a document
   */
  async getDocumentVersions(documentId, user) {
    const doc = await Document.findById(documentId)
      .populate('caseId')
      .populate('versions.uploadedBy', 'name email role badgeNumber')
      .populate('versions.editedBy', 'name email role badgeNumber')
      .populate('versions.auditLogId', 'currentHash previousHash timestamp action');

    if (!doc) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Document not found', ERROR_CODES.DOCUMENT_NOT_FOUND);
    }

    // Role-based boundary
    if (user.role === ROLES.OFFICER) {
      const caseItem = doc.caseId;
      const isLead = caseItem.leadOfficer?.toString() === user.id.toString();
      const isAssigned = Array.isArray(caseItem.assignedOfficers) && caseItem.assignedOfficers.some(
        (id) => (id._id ? id._id.toString() : id.toString()) === user.id.toString()
      );

      if (!isLead && !isAssigned) {
        throw new ApiError(
          HTTP_STATUS.FORBIDDEN,
          'Access forbidden: Clearance restricted for unassigned case documents',
          ERROR_CODES.INSUFFICIENT_PERMISSIONS
        );
      }
    }

    const versions = doc.versions || [];
    return {
      documentId: doc._id,
      title: doc.title,
      currentVersion: doc.version || 1,
      totalVersions: versions.length,
      versions: versions.map((v) => ({
        versionNumber: v.versionNumber || v.version,
        s3Key: v.s3Key,
        sha256Hash: v.sha256Hash,
        fileSize: v.fileSize,
        mimeType: v.mimeType,
        editedBy: v.editedBy || v.uploadedBy,
        createdAt: v.createdAt || v.uploadedAt,
        changeDescription: v.changeDescription || v.changeNotes,
        auditLog: v.auditLogId || null,
      })),
    };
  }

  /**
   * Get specific version record
   */
  async getDocumentVersion(documentId, versionNumber, user) {
    const doc = await Document.findById(documentId)
      .populate('caseId')
      .populate('versions.uploadedBy', 'name email role badgeNumber')
      .populate('versions.editedBy', 'name email role badgeNumber')
      .populate('versions.auditLogId', 'currentHash previousHash timestamp action');

    if (!doc) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Document not found', ERROR_CODES.DOCUMENT_NOT_FOUND);
    }

    const vNum = parseInt(versionNumber, 10);
    const targetVersion = (doc.versions || []).find(
      (v) => (v.versionNumber || v.version) === vNum
    );

    if (!targetVersion) {
      throw new ApiError(
        HTTP_STATUS.NOT_FOUND,
        `Version v${versionNumber} not found for document ${documentId}`,
        ERROR_CODES.RESOURCE_NOT_FOUND
      );
    }

    return {
      documentId: doc._id,
      title: doc.title,
      version: targetVersion.versionNumber || targetVersion.version,
      versionNumber: targetVersion.versionNumber || targetVersion.version,
      s3Key: targetVersion.s3Key,
      sha256Hash: targetVersion.sha256Hash,
      fileSize: targetVersion.fileSize,
      mimeType: targetVersion.mimeType,
      editedBy: targetVersion.editedBy || targetVersion.uploadedBy,
      createdAt: targetVersion.createdAt || targetVersion.uploadedAt,
      changeDescription: targetVersion.changeDescription || targetVersion.changeNotes,
      extractedFields: targetVersion.extractedFields || doc.extractedFields || {},
      auditLog: targetVersion.auditLogId,
      isCurrent: (doc.version || 1) === (targetVersion.versionNumber || targetVersion.version),
    };
  }

  /**
   * Generate Presigned 5-minute View URL for a specific historical version
   */
  async generateVersionPresignedViewUrl({ documentId, versionNumber, user, expiresInSeconds = 300 }) {
    const versionData = await this.getDocumentVersion(documentId, versionNumber, user);

    const expires = Math.floor(Date.now() / 1000) + expiresInSeconds;
    const config = require('../config/env');
    const signature = crypto
      .createHmac('sha256', config.jwt.accessSecret || 's3_secure_signing_secret')
      .update(`${documentId}:${expires}`)
      .digest('hex');

    const presignedUrl = `/api/v1/documents/vault-stream/${documentId}?expires=${expires}&signature=${signature}`;

    // Record audit entry for version view
    await auditService.recordAuditEntry({
      userId: user.id,
      action: AUDIT_ACTIONS.DOCUMENT_VERSION_VIEW,
      documentId,
      details: {
        versionNumber: versionData.versionNumber,
        s3Key: versionData.s3Key,
        sha256Hash: versionData.sha256Hash,
        expiresInSeconds,
      },
    });

    return {
      url: presignedUrl,
      expiresInSeconds,
      expiresAt: new Date(expires * 1000).toISOString(),
      sha256Hash: versionData.sha256Hash,
      version: versionData.versionNumber,
    };
  }

  /**
   * Compare two versions of a document
   */
  async compareDocumentVersions({ documentId, versionA, versionB, user }) {
    const vA = await this.getDocumentVersion(documentId, versionA, user);
    const vB = await this.getDocumentVersion(documentId, versionB, user);

    const fieldsA = vA.extractedFields || {};
    const fieldsB = vB.extractedFields || {};
    const allFieldKeys = Array.from(new Set([...Object.keys(fieldsA), ...Object.keys(fieldsB)]));
    const fieldChanges = [];

    for (const key of allFieldKeys) {
      const valA = fieldsA[key]?.value !== undefined ? fieldsA[key]?.value : (fieldsA[key]?.humanValue || fieldsA[key]?.aiValue);
      const valB = fieldsB[key]?.value !== undefined ? fieldsB[key]?.value : (fieldsB[key]?.humanValue || fieldsB[key]?.aiValue);
      if (valA !== valB) {
        fieldChanges.push({
          field: key,
          from: valA !== undefined ? valA : 'N/A',
          to: valB !== undefined ? valB : 'N/A',
          isCorrected: !!fieldsB[key]?.isCorrected,
        });
      }
    }

    return {
      documentId,
      versionA: {
        versionNumber: vA.versionNumber,
        sha256Hash: vA.sha256Hash,
        fileSize: vA.fileSize,
        editedBy: vA.editedBy,
        createdAt: vA.createdAt,
        changeDescription: vA.changeDescription,
        extractedFields: vA.extractedFields,
      },
      versionB: {
        versionNumber: vB.versionNumber,
        sha256Hash: vB.sha256Hash,
        fileSize: vB.fileSize,
        editedBy: vB.editedBy,
        createdAt: vB.createdAt,
        changeDescription: vB.changeDescription,
        extractedFields: vB.extractedFields,
      },
      diff: {
        hashChanged: vA.sha256Hash !== vB.sha256Hash,
        sizeDifferenceBytes: (vB.fileSize || 0) - (vA.fileSize || 0),
        timeDifferenceSeconds: Math.round(
          (new Date(vB.createdAt).getTime() - new Date(vA.createdAt).getTime()) / 1000
        ),
        editorChanged: vA.editedBy?._id?.toString() !== vB.editedBy?._id?.toString(),
        fieldChanges,
      },
    };
  }

  /**
   * Verify document SHA-256 hash against target buffer / downloaded content
   */
  async verifyIntegrity(documentId, targetBuffer) {
    const doc = await Document.findById(documentId).lean();
    if (!doc) {
      throw new ApiError(HTTP_STATUS.NOT_FOUND, 'Document not found');
    }

    const computedHash = calculateSha256(targetBuffer);
    const isValid = timingSafeEqual(doc.sha256Hash, computedHash);

    if (!isValid) {
      logger.error(`DOCUMENT TAMPER ALERT: Hash mismatch for doc ${documentId}`, {
        documentId,
        expectedHash: doc.sha256Hash,
        computedHash,
      });
    }

    return {
      documentId,
      expectedHash: doc.sha256Hash,
      computedHash,
      isValid,
      verifiedAt: new Date().toISOString(),
    };
  }
}

module.exports = new DocumentService();
