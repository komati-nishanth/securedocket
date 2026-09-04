const mongoose = require('mongoose');
const { ALL_DOCUMENT_TYPES, ALL_DOCUMENT_STATUSES, DOCUMENT_STATUS } = require('../constants/documentTypes');

const documentVersionSchema = new mongoose.Schema(
  {
    versionNumber: {
      type: Number,
      min: 1,
      default: function () {
        return this.version || 1;
      },
    },
    version: {
      type: Number,
      min: 1,
      default: function () {
        return this.versionNumber || 1;
      },
    },
    s3Key: {
      type: String,
    },
    sha256Hash: {
      type: String,
    },
    fileSize: {
      type: Number, // bytes
    },
    mimeType: {
      type: String,
    },
    editedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    changeDescription: {
      type: String,
      maxlength: 1000,
      default: 'Initial secure ingestion',
    },
    changeNotes: {
      type: String,
      maxlength: 1000,
      default: 'Initial secure ingestion',
    },
    extractedFields: {
      type: mongoose.Schema.Types.Mixed,
    },
    auditLogId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AuditLog',
    },
  },
  { _id: true }
);

const documentSchema = new mongoose.Schema(
  {
    caseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Case',
      required: [true, 'Associated Case ID is required'],
      index: true,
    },
    title: {
      type: String,
      required: [true, 'Document title is required'],
      trim: true,
      maxlength: [200, 'Title cannot exceed 200 characters'],
    },
    documentType: {
      type: String,
      enum: {
        values: ALL_DOCUMENT_TYPES,
        message: 'Document category {VALUE} is not recognized',
      },
      required: [true, 'Document category is required'],
      index: true,
    },
    s3Key: {
      type: String,
      required: [true, 'AWS S3 object key is required'],
      unique: true,
      trim: true,
    },
    s3Bucket: {
      type: String,
      required: true,
    },
    fileName: {
      type: String,
      required: true,
      trim: true,
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
    },
    fileSize: {
      type: Number, // in bytes
      required: true,
    },
    mimeType: {
      type: String,
      required: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: [true, 'Uploader user ID is required'],
      index: true,
    },
    sha256Hash: {
      type: String,
      required: [true, 'Cryptographic SHA-256 hash is required for integrity assurance'],
      match: [/^[a-f0-9]{64}$/i, 'Must be a valid 64-character SHA-256 hexadecimal hash'],
      index: true,
    },
    version: {
      type: Number,
      default: 1,
      min: 1,
    },
    status: {
      type: String,
      enum: ALL_DOCUMENT_STATUSES,
      default: DOCUMENT_STATUS.PENDING_REVIEW,
      index: true,
    },
    isTampered: {
      type: Boolean,
      default: false,
    },
    tamperFlags: [
      {
        flaggedAt: {
          type: Date,
          default: Date.now,
        },
        flaggedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
        },
        reason: {
          type: String,
          required: true,
        },
        expectedHash: String,
        computedHash: String,
      },
    ],
    ocrConfidence: {
      type: Number,
      min: 0,
      max: 100,
      default: 0,
    },
    extractedFields: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
      // Sensitive fields may be encrypted and stored as:
      // {
      //   isEncrypted: true,
      //   ciphertext: "hex_string",
      //   iv: "hex_string",
      //   authTag: "hex_string",
      //   confidence: Number,
      //   status: String,
      //   ...
      // }
    },
    classification: {
      predictedType: {
        type: String,
        enum: [...ALL_DOCUMENT_TYPES, 'unknown'],
        default: 'unknown',
      },
      confidence: {
        type: Number,
        min: 0,
        max: 1,
        default: 0,
      },
      reasoning: {
        type: String,
        default: '',
      },
      classifiedAt: {
        type: Date,
      },
    },
    ocrMetadata: {
      engine: {
        type: String,
        default: 'none',
      },
      processedAt: {
        type: Date,
      },
      averageConfidence: {
        type: Number,
        min: 0,
        max: 1,
        default: 0,
      },
      needsHumanReview: {
        type: Boolean,
        default: false,
        index: true,
      },
      reviewPriority: {
        type: String,
        enum: ['low', 'medium', 'high', 'critical'],
        default: 'medium',
      },
      rawTextLength: {
        type: Number,
        default: 0,
      },
    },
    extractedText: {
      type: String,
      select: false, // Omit large text block by default
    },
    embeddingVector: {
      type: [Number],
      select: false,
      index: false,
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    verifiedAt: {
      type: Date,
    },
    versions: [documentVersionSchema],
    metadata: {
      description: { type: String, maxlength: 1000 },
      tags: [{ type: String, trim: true }],
    },
  },
  {
    timestamps: true,
  }
);

// Pre-validate hook to guarantee all versions have valid version numbers and required fields
documentSchema.pre('validate', function (next) {
  if (Array.isArray(this.versions)) {
    this.versions.forEach((ver, index) => {
      const vNum = ver.versionNumber || ver.version || index + 1;
      ver.versionNumber = vNum;
      ver.version = vNum;
      if (!ver.s3Key && this.s3Key) ver.s3Key = this.s3Key;
      if (!ver.sha256Hash && this.sha256Hash) ver.sha256Hash = this.sha256Hash;
      if (!ver.uploadedBy && this.uploadedBy) ver.uploadedBy = this.uploadedBy;
      if (!ver.fileSize && this.fileSize) ver.fileSize = this.fileSize;
      if (!ver.mimeType && this.mimeType) ver.mimeType = this.mimeType;
    });
  }
  next();
});

// Compound indexes for fast audit and case retrieval
documentSchema.index({ caseId: 1, documentType: 1, status: 1 });
documentSchema.index({ sha256Hash: 1, s3Key: 1 });

const Document = mongoose.model('Document', documentSchema);

module.exports = Document;
