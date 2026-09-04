jest.setTimeout(60000);
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { User, Case, Document, AuditLog, RefreshToken } = require('../src/models');
const { ROLES } = require('../src/constants/roles');
const { DOCUMENT_TYPES, DOCUMENT_STATUS } = require('../src/constants/documentTypes');
const { AUDIT_ACTIONS } = require('../src/constants/actions');
const authService = require('../src/services/auth.service');
const totpService = require('../src/services/totp.service');
const documentService = require('../src/services/document.service');
const extractionService = require('../src/services/extraction.service');
const auditService = require('../src/services/audit.service');
const searchService = require('../src/services/search.service');
const intelligenceService = require('../src/services/intelligence.service');
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

describe('Phase 12: Complete End-to-End Workflow Lifecycle', () => {
  let adminUser, officerUser, verifierUser, testCase, uploadedDoc;
  let totpSecret, accessToken, refreshToken, officerDoc;

  it('Step 1: USER CREATION - Admin creates an Investigating Officer', async () => {
    adminUser = await User.create({
      email: 'admin.director@police.gov.in',
      passwordHash: await User.hashPassword('AdminPassphraseSecure123!'),
      name: 'Director General Verma',
      role: ROLES.ADMIN,
      badgeNumber: 'IPS-0001',
      department: 'Central CID',
      isActive: true,
      totpEnabled: true,
    });

    const officerPasswordHash = await User.hashPassword('OfficerStrongPassphrase123!');
    const setup = await totpService.generateSecret('officer.devendra@police.gov.in');
    totpSecret = setup.secret;

    officerDoc = await User.create({
      email: 'officer.devendra@police.gov.in',
      passwordHash: officerPasswordHash,
      name: 'Inspector Devendra Rao',
      role: ROLES.OFFICER,
      badgeNumber: 'CCB-5542',
      department: 'Cyber Crime Branch',
      isActive: true,
      totpSecret: setup.secret,
      totpEnabled: false,
    });

    expect(officerDoc).toBeDefined();
    expect(officerDoc.email).toBe('officer.devendra@police.gov.in');
    expect(officerDoc.role).toBe(ROLES.OFFICER);
  });

  it('Step 2: TOTP SETUP - Officer initializes and validates two-factor authentication', async () => {
    const validTotpCode = totpService.generateCode(totpSecret);
    const isCodeValid = totpService.verifyCode(validTotpCode, totpSecret);
    expect(isCodeValid).toBe(true);

    officerDoc.totpEnabled = true;
    officerDoc.totpVerifiedAt = new Date();
    await officerDoc.save();

    const officerInDb = await User.findById(officerDoc._id).select('+totpSecret +totpEnabled');
    expect(officerInDb.totpEnabled).toBe(true);
    expect(officerInDb.totpSecret).toBe(totpSecret);
  });

  it('Step 3: LOGIN (Password + TOTP) -> Short-Lived Access Token & Refresh Session', async () => {
    const candidateUser = await User.findOne({ email: 'officer.devendra@police.gov.in' }).select('+passwordHash +totpSecret +totpEnabled');
    expect(candidateUser).toBeDefined();

    const passwordMatch = await candidateUser.comparePassword('OfficerStrongPassphrase123!');
    expect(passwordMatch).toBe(true);

    // Pre-2FA token
    const pre2faToken = authService.generatePre2faToken(candidateUser);
    expect(pre2faToken).toBeDefined();

    const decodedPre2fa = authService.verifyPre2faToken(pre2faToken);
    expect(decodedPre2fa.id).toBe(candidateUser._id.toString());

    // 2FA Verification
    const currentTotp = totpService.generateCode(candidateUser.totpSecret);
    const totpValid = totpService.verifyCode(currentTotp, candidateUser.totpSecret);
    expect(totpValid).toBe(true);

    accessToken = authService.generateAccessToken(candidateUser);
    const refreshSession = await authService.createRefreshTokenSession(candidateUser._id, null, {
      ip: '127.0.0.1',
      userAgent: 'InvestigationTerminal/1.0',
    });
    refreshToken = refreshSession.token;

    officerUser = {
      ...candidateUser.toSafeObject(),
      _id: candidateUser._id,
      id: candidateUser._id.toString(),
    };
    expect(accessToken).toBeDefined();
    expect(refreshToken).toBeDefined();
    expect(officerUser.role).toBe(ROLES.OFFICER);
  });

  it('Step 4: CASE ACCESS - Officer is assigned to Case CR/2026/0891', async () => {
    testCase = await Case.create({
      caseNumber: 'CR/2026/0891',
      title: 'State vs Syndicate: Electronic Bank Embezzlement',
      description: 'Major unauthorized fund exfiltration on core banking switch',
      category: 'cyber_crime',
      leadOfficer: officerDoc._id,
      assignedOfficers: [officerDoc._id],
      status: 'under_investigation',
    });

    expect(testCase._id).toBeDefined();
    expect(testCase.leadOfficer.toString()).toBe(officerDoc._id.toString());
  });

  it('Step 5: DOCUMENT UPLOAD & SHA-256 & SSE-S3 VAULTING - FIR Document Ingestion', async () => {
    const rawFirContent = `
CENTRAL CRIME BRANCH - POLICE DEPARTMENT
FIRST INFORMATION REPORT (Under Section 154 Cr.P.C.)
--------------------------------------------------------------------------------
1. District: Bengaluru City | Police Station: Cyber Crime Police Station (CCPS)
2. FIR Number: CCPS/FIR/2026/0891 | Date: 14-Aug-2026
3. Acts & Sections: Section 420, 468, 471 IPC & Section 66D IT Act
4. Occurrence of Offence: 12-Aug-2026 at Koramangala Financial Hub
5. Complainant: Ananya Rameshwaram, Chief Compliance Officer
6. Accused: Sameer Rohan Verma (Systems Administrator)
7. Brief Facts: Unauthorized privilege escalation and fraudulent credit diversion of INR 4,20,00,000.
--------------------------------------------------------------------------------
Recording Officer: Inspector Devendra Rao
`;
    const fileBuffer = Buffer.from(rawFirContent, 'utf-8');
    const computedHash = calculateSha256(fileBuffer);

    uploadedDoc = await documentService.uploadDocument(
      {
        caseId: testCase._id.toString(),
        title: 'Primary First Information Report',
        documentType: DOCUMENT_TYPES.FIR,
        description: 'Original filed FIR for cyber embezzlement case',
        tags: ['FIR', 'cyber', 'bank_fraud'],
      },
      {
        buffer: fileBuffer,
        originalname: 'FIR_2026_0891_Original.txt',
        mimetype: 'text/plain',
        size: fileBuffer.length,
      },
      officerUser
    );

    expect(uploadedDoc).toBeDefined();
    expect(uploadedDoc.sha256Hash).toBe(computedHash);
    expect(uploadedDoc.version).toBe(1);
    expect(uploadedDoc.status).toBe(DOCUMENT_STATUS.PENDING_REVIEW);
  });

  it('Step 6: AI OCR, CLASSIFICATION, FIELD EXTRACTION & CONFIDENCE EVALUATION', async () => {
    const processedDoc = await extractionService.extractAndProcessDocument(uploadedDoc._id);

    expect(processedDoc).toBeDefined();
    expect(processedDoc.classification.predictedType).toBe('FIR');
    expect(processedDoc.classification.confidence).toBeGreaterThanOrEqual(0.60);
    expect(processedDoc.ocrMetadata.averageConfidence).toBeGreaterThanOrEqual(0.60);
    expect(processedDoc.extractedFields).toBeDefined();
    expect(processedDoc.extractedFields.firNumber).toBeDefined();
  });

  it('Step 7: REVIEW QUEUE - Verifier reviews low-confidence/pending items', async () => {
    const verifierDoc = await User.create({
      email: 'verifier.sharma@forensics.gov.in',
      passwordHash: await User.hashPassword('VerifierPassphrase123!'),
      name: 'Forensic Verifier Sharma',
      role: ROLES.VERIFIER,
      badgeNumber: 'CFSL-9912',
      department: 'Central Forensic Science Laboratory',
      isActive: true,
    });
    verifierUser = {
      ...verifierDoc.toSafeObject(),
      _id: verifierDoc._id,
      id: verifierDoc._id.toString(),
      role: ROLES.VERIFIER,
    };

    const queue = await extractionService.getVerificationQueue({ status: 'all' });
    expect(queue.documents).toBeDefined();
    const targetInQueue = queue.documents.find((d) => d._id.toString() === uploadedDoc._id.toString());
    expect(targetInQueue).toBeDefined();
  });

  it('Step 8: NON-DESTRUCTIVE HUMAN CORRECTION -> ADVANCES IMMUTABLE VERSION TO V2', async () => {
    const updated = await extractionService.correctField({
      documentId: uploadedDoc._id,
      fieldName: 'policeStation',
      correctedValue: 'Cyber Crime Police Station (CCPS) - Unit 1',
      user: verifierUser,
    });

    expect(updated.version).toBe(2);
    expect(updated.versions.length).toBe(2);
    expect(updated.extractedFields.policeStation.isCorrected).toBe(true);
    expect(updated.extractedFields.policeStation.value).toBe('Cyber Crime Police Station (CCPS) - Unit 1');
  });

  it('Step 9: FORENSIC CERTIFICATION & VERIFICATION SIGN-OFF', async () => {
    const verifiedDoc = await extractionService.verifyDocument({
      documentId: uploadedDoc._id,
      user: verifierUser,
      notes: 'Forensically verified against physical FIR book. Cryptographic match confirmed.',
    });

    expect(verifiedDoc.status).toBe(DOCUMENT_STATUS.VERIFIED);
    expect(verifiedDoc.verifiedBy.toString()).toBe(verifierUser.id.toString());
    expect(verifiedDoc.ocrMetadata.needsHumanReview).toBe(false);
  });

  it('Step 10: AUDIT LOG LEDGER & HASH CHAIN INTEGRITY VALIDATION', async () => {
    const auditLogs = await AuditLog.find({ documentId: uploadedDoc._id }).sort({ timestamp: 1 });
    expect(auditLogs.length).toBeGreaterThan(0);

    const validation = await auditService.validateAuditChain();
    expect(validation.isValid).toBe(true);
    expect(validation.totalRecords).toBeGreaterThan(0);
    expect(validation.compromisedIndices.length).toBe(0);
  });

  it('Step 11: SEMANTIC SEARCH - Querying related evidentiary topics', async () => {
    const searchResults = await searchService.semanticSearch(
      {
        query: 'unauthorized fund transfer and bank switch access',
        threshold: 0.1,
      },
      officerUser
    );

    expect(searchResults).toBeDefined();
    expect(Array.isArray(searchResults)).toBe(true);
  });

  it('Step 12: CASE TIMELINE & ENTITY LINKS', async () => {
    const timeline = await intelligenceService.generateCaseTimeline(testCase._id, officerUser);
    expect(timeline.caseId.toString()).toBe(testCase._id.toString());
    expect(Array.isArray(timeline.timeline)).toBe(true);
    expect(timeline.totalEvents).toBeGreaterThan(0);

    const entities = await intelligenceService.extractCaseEntities(testCase._id, officerUser);
    expect(entities.caseId.toString()).toBe(testCase._id.toString());
    expect(Array.isArray(entities.entities)).toBe(true);
    expect(typeof entities.totalEntities).toBe('number');
  });
});
