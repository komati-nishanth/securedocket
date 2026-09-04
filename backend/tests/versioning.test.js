jest.setTimeout(60000);
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const documentService = require('../src/services/document.service');
const { Case, Document, User, AuditLog } = require('../src/models');
const { ROLES } = require('../src/constants/roles');
const { calculateSha256 } = require('../src/utils/crypto');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

afterEach(async () => {
  await Document.deleteMany({});
  await Case.deleteMany({});
  await User.deleteMany({});
  await AuditLog.deleteMany({});
});

describe('Phase 10: Document Versioning and Edit Integrity', () => {
  let adminUser, officerUser, unauthorizedOfficer, auditorUser, verifierUser;
  let testCase, testDocument;

  beforeEach(async () => {
    adminUser = await User.create({
      email: 'admin.version@example.com',
      passwordHash: 'hashed123',
      name: 'Admin Dev Anand',
      role: ROLES.ADMIN,
    });

    officerUser = await User.create({
      email: 'officer.version@example.com',
      passwordHash: 'hashed123',
      name: 'Inspector Vikram Singh',
      role: ROLES.OFFICER,
    });

    unauthorizedOfficer = await User.create({
      email: 'officer.unauth@example.com',
      passwordHash: 'hashed123',
      name: 'Inspector Out-of-Scope',
      role: ROLES.OFFICER,
    });

    auditorUser = await User.create({
      email: 'auditor.version@example.com',
      passwordHash: 'hashed123',
      name: 'Judicial Auditor Rao',
      role: ROLES.AUDITOR,
    });

    verifierUser = await User.create({
      email: 'verifier.version@example.com',
      passwordHash: 'hashed123',
      name: 'Forensic Verifier Neha',
      role: ROLES.VERIFIER,
    });

    testCase = await Case.create({
      caseNumber: 'CR/2026/0891-BLR',
      title: 'State vs. Cyber Syndicate Heist',
      description: 'Major cyber heist investigation dossier',
      leadOfficer: officerUser._id,
      assignedOfficers: [officerUser._id],
    });

    const initialBuffer = Buffer.from('%PDF-1.4\nInitial FIR Text content version 1');
    const initialHash = calculateSha256(initialBuffer);

    testDocument = await Document.create({
      caseId: testCase._id,
      title: 'Initial FIR Intake',
      documentType: 'FIR',
      s3Key: 'cases/CR-2026-0891-BLR/v1_fir_initial.pdf',
      s3Bucket: 'secure-vault',
      fileName: 'fir_initial.pdf',
      originalName: 'fir_initial.pdf',
      fileSize: initialBuffer.length,
      mimeType: 'application/pdf',
      uploadedBy: officerUser._id,
      sha256Hash: initialHash,
      version: 1,
      versions: [
        {
          versionNumber: 1,
          version: 1,
          s3Key: 'cases/CR-2026-0891-BLR/v1_fir_initial.pdf',
          sha256Hash: initialHash,
          fileSize: initialBuffer.length,
          mimeType: 'application/pdf',
          uploadedBy: officerUser._id,
          editedBy: officerUser._id,
          createdAt: new Date(),
          uploadedAt: new Date(),
          changeDescription: 'Initial secure ingestion',
          changeNotes: 'Initial secure ingestion',
          extractedFields: {
            firNumber: { value: 'FIR-891/2026', confidence: 0.95 },
          },
        },
      ],
      extractedFields: {
        firNumber: { value: 'FIR-891/2026', confidence: 0.95 },
      },
    });
  });

  test('1. Should create new version (v2) and preserve original version (v1) without destructive overwrite', async () => {
    const v2Buffer = Buffer.from('%PDF-1.4\nUpdated FIR with supplemental witness statements v2');
    const v2Hash = calculateSha256(v2Buffer);

    const updatedDoc = await documentService.createDocumentVersion({
      documentId: testDocument._id,
      file: {
        buffer: v2Buffer,
        originalname: 'fir_supplemental_v2.pdf',
        mimetype: 'application/pdf',
        size: v2Buffer.length,
      },
      changeDescription: 'Appended supplemental witness statements',
      title: 'FIR Supplemented (v2)',
      user: officerUser,
    });

    expect(updatedDoc.version).toBe(2);
    expect(updatedDoc.sha256Hash).toBe(v2Hash);
    expect(updatedDoc.versions.length).toBe(2);

    // Verify v1 preservation
    const v1Record = updatedDoc.versions.find((v) => (v.versionNumber || v.version) === 1);
    expect(v1Record).toBeDefined();
    expect(v1Record.sha256Hash).toBe(testDocument.versions[0].sha256Hash);
    expect(v1Record.s3Key).toBe(testDocument.versions[0].s3Key);

    // Verify v2 details
    const v2Record = updatedDoc.versions.find((v) => (v.versionNumber || v.version) === 2);
    expect(v2Record).toBeDefined();
    expect(v2Record.sha256Hash).toBe(v2Hash);
    expect(v2Record.changeDescription).toBe('Appended supplemental witness statements');
    expect(v2Record.editedBy.toString()).toBe(officerUser._id.toString());
  });

  test('2. Should support multiple sequential versions (v1 -> v2 -> v3) preserving full lineage', async () => {
    // v2
    const v2Buffer = Buffer.from('%PDF-1.4\nVersion 2 content');
    await documentService.createDocumentVersion({
      documentId: testDocument._id,
      file: {
        buffer: v2Buffer,
        originalname: 'doc_v2.pdf',
        mimetype: 'application/pdf',
        size: v2Buffer.length,
      },
      changeDescription: 'Second revision',
      user: officerUser,
    });

    // v3
    const v3Buffer = Buffer.from('%PDF-1.4\nVersion 3 finalized chargesheet additions');
    const v3Hash = calculateSha256(v3Buffer);

    const v3Doc = await documentService.createDocumentVersion({
      documentId: testDocument._id,
      file: {
        buffer: v3Buffer,
        originalname: 'doc_v3.pdf',
        mimetype: 'application/pdf',
        size: v3Buffer.length,
      },
      changeDescription: 'Finalized revision v3',
      user: adminUser,
    });

    expect(v3Doc.version).toBe(3);
    expect(v3Doc.sha256Hash).toBe(v3Hash);
    expect(v3Doc.versions.length).toBe(3);

    const versionsHistory = await documentService.getDocumentVersions(testDocument._id, officerUser);
    expect(versionsHistory.totalVersions).toBe(3);
    expect(versionsHistory.versions[0].versionNumber).toBe(1);
    expect(versionsHistory.versions[1].versionNumber).toBe(2);
    expect(versionsHistory.versions[2].versionNumber).toBe(3);
  });

  test('3. Should create chained audit log for every version created', async () => {
    const v2Buffer = Buffer.from('%PDF-1.4\nVersion 2 audit check payload');
    const v2Hash = calculateSha256(v2Buffer);

    await documentService.createDocumentVersion({
      documentId: testDocument._id,
      file: {
        buffer: v2Buffer,
        originalname: 'fir_v2_audit.pdf',
        mimetype: 'application/pdf',
        size: v2Buffer.length,
      },
      changeDescription: 'Audited version revision',
      user: officerUser,
    });

    const auditLogs = await AuditLog.find({
      documentId: testDocument._id,
      action: 'DOCUMENT_NEW_VERSION',
    });

    expect(auditLogs.length).toBe(1);
    expect(auditLogs[0].details.newVersion).toBe(2);
    expect(auditLogs[0].details.previousVersion).toBe(1);
    expect(auditLogs[0].details.newHash).toBe(v2Hash);
    expect(auditLogs[0].userId.toString()).toBe(officerUser._id.toString());
  });

  test('4. Should reject modification attempts by Auditors (Read-Only RBAC)', async () => {
    const audBuffer = Buffer.from('%PDF-1.4\nAuditor tamper attempt');
    await expect(
      documentService.createDocumentVersion({
        documentId: testDocument._id,
        file: {
          buffer: audBuffer,
          originalname: 'auditor.pdf',
          mimetype: 'application/pdf',
          size: audBuffer.length,
        },
        changeDescription: 'Unauthorized edit',
        user: auditorUser,
      })
    ).rejects.toThrow(/Access forbidden: Auditors are granted read-only oversight clearance/i);
  });

  test('5. Should reject modification attempts by Officers not assigned to the case', async () => {
    const unauthBuffer = Buffer.from('%PDF-1.4\nUnassigned officer edit');
    await expect(
      documentService.createDocumentVersion({
        documentId: testDocument._id,
        file: {
          buffer: unauthBuffer,
          originalname: 'unauth.pdf',
          mimetype: 'application/pdf',
          size: unauthBuffer.length,
        },
        changeDescription: 'Unassigned edit attempt',
        user: unauthorizedOfficer,
      })
    ).rejects.toThrow(/Access forbidden: You cannot modify documents belonging to an unassigned case dossier/i);
  });

  test('6. Should allow version retrieval and accurate comparison metadata diffs', async () => {
    const v2Buffer = Buffer.from('%PDF-1.4\nVersion 2 with longer text bytes comparison test');
    await documentService.createDocumentVersion({
      documentId: testDocument._id,
      file: {
        buffer: v2Buffer,
        originalname: 'fir_v2.pdf',
        mimetype: 'application/pdf',
        size: v2Buffer.length,
      },
      changeDescription: 'Comparison test revision',
      user: officerUser,
    });

    // Test specific version retrieval
    const v1Details = await documentService.getDocumentVersion(testDocument._id, 1, officerUser);
    expect(v1Details.versionNumber).toBe(1);
    expect(v1Details.isCurrent).toBe(false);

    const v2Details = await documentService.getDocumentVersion(testDocument._id, 2, officerUser);
    expect(v2Details.versionNumber).toBe(2);
    expect(v2Details.isCurrent).toBe(true);

    // Test version comparison
    const comparison = await documentService.compareDocumentVersions({
      documentId: testDocument._id,
      versionA: 1,
      versionB: 2,
      user: officerUser,
    });

    expect(comparison.diff.hashChanged).toBe(true);
    expect(comparison.versionA.versionNumber).toBe(1);
    expect(comparison.versionB.versionNumber).toBe(2);
    expect(typeof comparison.diff.sizeDifferenceBytes).toBe('number');
  });
});
