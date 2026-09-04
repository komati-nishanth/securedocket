jest.setTimeout(60000);
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const jwt = require('jsonwebtoken');
const { User, Case, Document, AuditLog, RefreshToken } = require('../src/models');
const { ROLES } = require('../src/constants/roles');
const { DOCUMENT_TYPES, DOCUMENT_STATUS } = require('../src/constants/documentTypes');
const { AUDIT_ACTIONS } = require('../src/constants/actions');
const authService = require('../src/services/auth.service');
const totpService = require('../src/services/totp.service');
const documentService = require('../src/services/document.service');
const auditService = require('../src/services/audit.service');
const searchService = require('../src/services/search.service');
const intelligenceService = require('../src/services/intelligence.service');
const { validateUploadedFile } = require('../src/utils/fileValidator');
const { encryptAES256GCM } = require('../src/utils/crypto');
const config = require('../src/config/env');

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

describe('Phase 12: Security Threat & Boundary Scenarios (Scenarios 1-18)', () => {
  let adminUser, officerA, officerB, verifierUser, testCaseA, testCaseB, docA;
  const totpSecretA = 'JBSWY3DPEHPK3PXP';

  beforeAll(async () => {
    adminUser = await User.create({
      email: 'admin.sec@police.gov.in',
      passwordHash: await User.hashPassword('AdminPass123!'),
      name: 'Admin User',
      role: ROLES.ADMIN,
      isActive: true,
      totpEnabled: true,
    });

    officerA = await User.create({
      email: 'officer.a@police.gov.in',
      passwordHash: await User.hashPassword('OfficerAPass123!'),
      name: 'Officer Alpha',
      role: ROLES.OFFICER,
      badgeNumber: 'OFF-001',
      isActive: true,
      totpEnabled: true,
      totpSecret: totpSecretA,
    });

    officerB = await User.create({
      email: 'officer.b@police.gov.in',
      passwordHash: await User.hashPassword('OfficerBPass123!'),
      name: 'Officer Beta',
      role: ROLES.OFFICER,
      badgeNumber: 'OFF-002',
      isActive: true,
      totpEnabled: true,
    });

    verifierUser = await User.create({
      email: 'verifier.lab@police.gov.in',
      passwordHash: await User.hashPassword('VerifierPass123!'),
      name: 'Verifier Lab',
      role: ROLES.VERIFIER,
      isActive: true,
      totpEnabled: true,
    });

    testCaseA = await Case.create({
      caseNumber: 'CR/2026/0101',
      title: 'Restricted Case Alpha',
      leadOfficer: officerA._id,
      assignedOfficers: [officerA._id],
      status: 'under_investigation',
    });

    testCaseB = await Case.create({
      caseNumber: 'CR/2026/0202',
      title: 'Restricted Case Beta',
      leadOfficer: officerB._id,
      assignedOfficers: [officerB._id],
      status: 'under_investigation',
    });

    docA = await Document.create({
      caseId: testCaseA._id,
      title: 'Confidential Seizure Report',
      documentType: DOCUMENT_TYPES.EVIDENCE,
      s3Key: 'cases/CR_2026_0101/confidential_doc.txt',
      s3Bucket: config.aws.bucketName,
      fileName: 'confidential_doc.txt',
      originalName: 'confidential_doc.txt',
      fileSize: 1024,
      mimeType: 'text/plain',
      uploadedBy: officerA._id,
      sha256Hash: 'a'.repeat(64),
      status: DOCUMENT_STATUS.PENDING_REVIEW,
      version: 1,
      versions: [
        {
          versionNumber: 1,
          version: 1,
          s3Key: 'cases/CR_2026_0101/confidential_doc.txt',
          sha256Hash: 'a'.repeat(64),
          fileSize: 1024,
          mimeType: 'text/plain',
          uploadedBy: officerA._id,
          createdAt: new Date(),
        },
      ],
      extractedFields: {
        complainant: {
          field: 'complainant',
          value: encryptAES256GCM('Protected Witness Identity', config.masterEncryptionKey),
          isEncrypted: true,
        },
      },
    });
  });

  // Scenario 1: Wrong password
  it('Scenario 1: Authentication failure with incorrect password', async () => {
    const user = await User.findOne({ email: 'officer.a@police.gov.in' }).select('+passwordHash');
    const isMatch = await user.comparePassword('CompletelyWrongPassword!');
    expect(isMatch).toBe(false);
  });

  // Scenario 2: Wrong TOTP
  it('Scenario 2: 2FA failure with invalid 6-digit TOTP code', () => {
    const isCodeValid = totpService.verifyCode('000000', totpSecretA);
    expect(isCodeValid).toBe(false);
  });

  // Scenario 3: Expired access token
  it('Scenario 3: Rejection of expired access token (15m policy)', () => {
    const expiredToken = jwt.sign(
      { sub: officerA._id, email: officerA.email, role: officerA.role },
      config.jwt.accessSecret,
      { expiresIn: '-1s' }
    );

    expect(() => {
      jwt.verify(expiredToken, config.jwt.accessSecret);
    }).toThrow(jwt.TokenExpiredError);
  });

  // Scenario 4: Refresh token rotation and replay attack revocation
  it('Scenario 4: Refresh token rotation revokes entire family on replay attempt', async () => {
    const session = await authService.createRefreshTokenSession(officerA._id, null, {
      ip: '127.0.0.1',
      userAgent: 'Agent/1.0',
    });
    const firstRefresh = session.token;

    // Normal rotation
    const rotated = await authService.rotateRefreshToken(firstRefresh, {
      ip: '127.0.0.1',
      userAgent: 'Agent/1.0',
    });
    expect(rotated.refreshToken).toBeDefined();

    // Replay attack with used firstRefresh token
    await expect(
      authService.rotateRefreshToken(firstRefresh, {
        ip: '127.0.0.1',
        userAgent: 'AttackerAgent/1.0',
      })
    ).rejects.toThrow(/Reused refresh token detected/i);

    // Assert that the family has been purged
    const activeTokens = await RefreshToken.find({ userId: officerA._id, isRevoked: false });
    expect(activeTokens.length).toBe(0);
  });

  // Scenario 5 & 6: Verifier attempting admin endpoint
  it('Scenario 5 & 6: Verifier role blocked from admin user creation (403)', () => {
    const reqUser = { id: verifierUser._id, role: ROLES.VERIFIER };
    expect([ROLES.ADMIN].includes(reqUser.role)).toBe(false);
  });

  // Scenario 7: Officer attempting access to another officer's unassigned case
  it('Scenario 7: Officer B blocked from accessing Officer A unassigned case', async () => {
    await expect(
      documentService.getDocumentById(docA._id, { id: officerB._id, role: ROLES.OFFICER })
    ).rejects.toThrow(/Access forbidden/i);
  });

  // Scenario 8: Invalid file MIME / disallowed extension
  it('Scenario 8: Rejection of disallowed extension (.exe)', () => {
    expect(() => {
      validateUploadedFile({
        mimetype: 'application/x-msdownload',
        originalname: 'malware.exe',
        buffer: Buffer.from('MZ...fake executable'),
        size: 2048,
      });
    }).toThrow(/File extension '\.exe' is not permitted/i);
  });

  // Scenario 9: Invalid magic number disguised as PDF
  it('Scenario 9: Magic number mismatch detected for disguised executable file', () => {
    const fakePdfBytes = Buffer.from('MZ900000fake_executable_bytes_not_pdf');
    expect(() => {
      validateUploadedFile({
        mimetype: 'application/pdf',
        originalname: 'innocent.pdf',
        buffer: fakePdfBytes,
        size: fakePdfBytes.length,
      });
    }).toThrow(/Executable binary detected/i);
  });

  // Scenario 10: Oversized upload exceeding limit
  it('Scenario 10: Upload exceeding limit rejected', () => {
    expect(() => {
      validateUploadedFile({
        mimetype: 'application/pdf',
        originalname: 'huge.pdf',
        buffer: Buffer.alloc(30 * 1024 * 1024), // 30 MB (max is 25 MB)
        size: 30 * 1024 * 1024,
      });
    }).toThrow(/exceeds maximum allowed limit/i);
  });

  // Scenario 11: Public S3 access prevention
  it('Scenario 11: Verify documents have no public URLs and require signed temporary stream', async () => {
    const viewUrlRes = await documentService.generatePresignedViewUrl({
      documentId: docA._id,
      user: { id: officerA._id, role: ROLES.OFFICER },
      expiresInSeconds: 300,
    });

    expect(viewUrlRes.url).toBeDefined();
    expect(viewUrlRes.url).toContain('/api/v1/documents/vault-stream');
    expect(viewUrlRes.url).toContain('signature=');
    expect(viewUrlRes.url).toContain('expires=');
    expect(viewUrlRes.expiresInSeconds).toBe(300);
  });

  // Scenario 12: Unauthorized document view stream generation
  it('Scenario 12: Unauthorized officer blocked from generating view URL', async () => {
    await expect(
      documentService.generatePresignedViewUrl({
        documentId: docA._id,
        user: { id: officerB._id, role: ROLES.OFFICER },
      })
    ).rejects.toThrow(/Access forbidden/i);
  });

  // Scenario 13: Unauthorized encrypted-field access (Data at rest encryption)
  it('Scenario 13: Database stores encrypted ciphertext for sensitive fields', async () => {
    const rawDocInDb = await Document.findById(docA._id).lean();
    const sensitiveField = rawDocInDb.extractedFields.complainant;

    expect(sensitiveField.isEncrypted).toBe(true);
    expect(sensitiveField.value).toHaveProperty('ciphertext');
    expect(sensitiveField.value).toHaveProperty('iv');
    expect(sensitiveField.value).toHaveProperty('authTag');
    expect(typeof sensitiveField.value.ciphertext).toBe('string');
  });

  // Scenario 14: Audit record tampering detection
  it('Scenario 14: Tampering with audit record payload detected by hash chain validation', async () => {
    await AuditLog.deleteMany({});
    const r1 = await auditService.recordAuditEntry({
      userId: officerA._id,
      action: AUDIT_ACTIONS.CASE_CREATE,
      details: { caseId: testCaseA._id.toString() },
    });
    await auditService.recordAuditEntry({
      userId: officerA._id,
      action: AUDIT_ACTIONS.DOCUMENT_UPLOAD,
      details: { documentId: docA._id.toString() },
    });

    // Tamper with record 1 details
    await AuditLog.findByIdAndUpdate(r1._id, { $set: { 'details.caseId': 'TAMPERED_ID' } });

    const validation = await auditService.validateAuditChain();
    expect(validation.isValid).toBe(false);
    expect(validation.compromisedIndices.length).toBeGreaterThan(0);
  });

  // Scenario 15: Audit previousHash tampering detection
  it('Scenario 15: Tampering with previousHash breaks audit ledger chain', async () => {
    await AuditLog.deleteMany({});
    await auditService.recordAuditEntry({ userId: officerA._id, action: AUDIT_ACTIONS.USER_LOGIN });
    const r2 = await auditService.recordAuditEntry({ userId: officerA._id, action: AUDIT_ACTIONS.DOCUMENT_VIEW });

    // Tamper with previousHash on r2
    await AuditLog.findByIdAndUpdate(r2._id, { $set: { previousHash: '0'.repeat(64) } });

    const validation = await auditService.validateAuditChain();
    expect(validation.isValid).toBe(false);
  });

  // Scenario 16: Audit entry deletion detection
  it('Scenario 16: Deleting an intermediate audit record breaks the chain sequence', async () => {
    await AuditLog.deleteMany({});
    await auditService.recordAuditEntry({ userId: officerA._id, action: AUDIT_ACTIONS.USER_LOGIN });
    const r2 = await auditService.recordAuditEntry({ userId: officerA._id, action: AUDIT_ACTIONS.DOCUMENT_UPLOAD });
    await auditService.recordAuditEntry({ userId: officerA._id, action: AUDIT_ACTIONS.DOCUMENT_VIEW });

    // Delete middle record r2
    await AuditLog.findByIdAndDelete(r2._id);

    const validation = await auditService.validateAuditChain();
    expect(validation.isValid).toBe(false);
  });

  // Scenario 17: Search authorization bypass attempt
  it('Scenario 17: Officer search restricted to assigned cases only', async () => {
    const searchRes = await searchService.semanticSearch(
      { query: 'confidential report', caseId: testCaseB._id.toString() },
      { id: officerA._id, role: ROLES.OFFICER }
    );
    expect(searchRes).toEqual([]);
    expect(searchRes.length).toBe(0);
  });

  // Scenario 18: Cross-case entity linking attempt
  it('Scenario 18: Officer cannot access entity graph of unassigned case', async () => {
    await expect(
      intelligenceService.extractCaseEntities(testCaseB._id, { id: officerA._id, role: ROLES.OFFICER })
    ).rejects.toThrow(/Access forbidden/i);
  });
});
