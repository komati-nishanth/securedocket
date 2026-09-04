jest.setTimeout(60000);
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const intelligenceService = require('../src/services/intelligence.service');
const { Case, Document, User } = require('../src/models');
const { ROLES } = require('../src/constants/roles');

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
});

describe('Phase 8: Case Intelligence - Timeline & Entity Linking Engine', () => {
  let adminUser, officerUser, unauthorizedOfficer;
  let caseA, caseB;

  beforeEach(async () => {
    adminUser = await User.create({
      email: 'admin.intel@example.com',
      passwordHash: 'hashed123',
      name: 'Director Sharma',
      role: ROLES.ADMIN,
      organization: 'CID Headquarters',
    });

    officerUser = await User.create({
      email: 'officer.assigned@example.com',
      passwordHash: 'hashed123',
      name: 'Inspector Rajan',
      role: ROLES.OFFICER,
      organization: 'Crime Branch',
    });

    unauthorizedOfficer = await User.create({
      email: 'officer.unauth@example.com',
      passwordHash: 'hashed123',
      name: 'Sub-Inspector Verma',
      role: ROLES.OFFICER,
      organization: 'Traffic Division',
    });

    caseA = await Case.create({
      caseNumber: 'CR/2026/0891-BLR',
      title: 'Cyber Heist & Vault Tampering',
      status: 'under_investigation',
      leadOfficer: officerUser._id,
      assignedOfficers: [officerUser._id],
    });

    caseB = await Case.create({
      caseNumber: 'CR/2026/0999-MUM',
      title: 'Unrelated Corporate Fraud Case',
      status: 'open',
      leadOfficer: adminUser._id,
      assignedOfficers: [],
    });
  });

  describe('1. Case Chronological Timeline Generation', () => {
    it('should extract events from multiple documents and sort them chronologically', async () => {
      // Doc 1: FIR (Incident on 10 Jan 2026, Registered on 12 Jan 2026)
      await Document.create({
        caseId: caseA._id,
        title: 'Certified FIR No. 891/26',
        documentType: 'FIR',
        s3Key: 'fir_key_01',
        s3Bucket: 'test-bucket',
        fileName: 'fir_891.pdf',
        originalName: 'fir_891.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        uploadedBy: officerUser._id,
        sha256Hash: 'a'.repeat(64),
        extractedFields: {
          incidentDate: { value: '2026-01-10T14:30:00.000Z', confidence: 0.95, sourceReference: 'Para 1' },
          filingDate: { value: '2026-01-12T10:00:00.000Z', confidence: 0.98 },
          firNumber: { value: 'FIR 891/26' },
          policeStation: { value: 'Cyber Crime PS' },
          incidentLocation: { value: 'MG Road Branch' },
        },
      });

      // Doc 2: Witness Statement (Recorded on 15 Jan 2026)
      await Document.create({
        caseId: caseA._id,
        title: 'Witness Statement - Bank Teller',
        documentType: 'statement',
        s3Key: 'stmt_key_01',
        s3Bucket: 'test-bucket',
        fileName: 'statement_teller.pdf',
        originalName: 'statement_teller.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        uploadedBy: officerUser._id,
        sha256Hash: 'b'.repeat(64),
        extractedFields: {
          statementDate: { value: '15/01/2026', confidence: 0.92, sourceReference: 'Header' },
          witnessName: { value: 'Ravi Kumar' },
        },
      });

      // Doc 3: Forensic Lab Report (Concluded on 20 Jan 2026)
      await Document.create({
        caseId: caseA._id,
        title: 'CFSL Digital Forensics Report',
        documentType: 'forensic_report',
        s3Key: 'forensic_key_01',
        s3Bucket: 'test-bucket',
        fileName: 'cfsl_report.pdf',
        originalName: 'cfsl_report.pdf',
        fileSize: 4096,
        mimeType: 'application/pdf',
        uploadedBy: officerUser._id,
        sha256Hash: 'c'.repeat(64),
        extractedFields: {
          examinationDate: { value: '2026-01-20T18:00:00.000Z', confidence: 0.96 },
          reportNumber: { value: 'CFSL/2026/D-401' },
          laboratory: { value: 'Central Forensic Science Laboratory' },
          findings: { value: 'Malicious firmware injected via USB' },
        },
      });

      const timelineResult = await intelligenceService.generateCaseTimeline(caseA._id, officerUser);

      expect(timelineResult.timeline).toBeDefined();
      expect(timelineResult.totalEvents).toBe(4); // Incident, FIR, Statement, Forensics

      // Verify Chronological Order: 10 Jan -> 12 Jan -> 15 Jan -> 20 Jan
      const dates = timelineResult.certainEvents.map((e) => new Date(e.date).getTime());
      for (let i = 1; i < dates.length; i++) {
        expect(dates[i]).toBeGreaterThanOrEqual(dates[i - 1]);
      }

      // Verify event types
      const types = timelineResult.timeline.map((e) => e.eventType);
      expect(types).toContain('incident_occurred');
      expect(types).toContain('fir_registered');
      expect(types).toContain('statement_recorded');
      expect(types).toContain('forensic_examination');

      // Verify source document IDs link back correctly
      expect(timelineResult.timeline[0].sourceDocumentId).toBeDefined();
      expect(timelineResult.timeline[0].sourceDocumentTitle).toBeDefined();
    });

    it('should flag unparseable or low-confidence dates as isUncertain rather than inventing dates', async () => {
      await Document.create({
        caseId: caseA._id,
        title: 'Corrupted Note',
        documentType: 'statement',
        s3Key: 'corrupt_key_01',
        s3Bucket: 'test-bucket',
        fileName: 'corrupt.pdf',
        originalName: 'corrupt.pdf',
        fileSize: 512,
        mimeType: 'application/pdf',
        uploadedBy: officerUser._id,
        sha256Hash: 'd'.repeat(64),
        extractedFields: {
          statementDate: { value: 'some vague winter day in 2026', confidence: 0.45 },
          witnessName: { value: 'Anonymous Informant' },
        },
      });

      const res = await intelligenceService.generateCaseTimeline(caseA._id, officerUser);
      expect(res.uncertainEvents.length).toBeGreaterThan(0);
      expect(res.uncertainEvents[0].isUncertain).toBe(true);
      expect(res.uncertainEvents[0].date).toBeNull();
    });
  });

  describe('2. Cross-Document Entity Linking & Normalization', () => {
    it('should identify and link the same entity across multiple documents within a case', async () => {
      // Document 1 (FIR): Mentions Accused "Shri Ravi Kumar" and Location "Indiranagar Police Station"
      await Document.create({
        caseId: caseA._id,
        title: 'Initial FIR Report',
        documentType: 'FIR',
        s3Key: 'doc_fir_01',
        s3Bucket: 'test-bucket',
        fileName: 'fir.pdf',
        originalName: 'fir.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        uploadedBy: officerUser._id,
        sha256Hash: 'e'.repeat(64),
        extractedFields: {
          accused: { value: 'Shri Ravi Kumar', confidence: 0.94 },
          policeStation: { value: 'Indiranagar Police Station', confidence: 0.90 },
          incidentLocation: { value: 'MG Road Axis Bank', confidence: 0.88 },
        },
        extractedText: 'Accused Shri Ravi Kumar was apprehended near MG Road Axis Bank...',
      });

      // Document 2 (Statement): Mentions Witness "Ravi Kumar"
      await Document.create({
        caseId: caseA._id,
        title: 'Interrogation Transcript',
        documentType: 'statement',
        s3Key: 'doc_stmt_02',
        s3Bucket: 'test-bucket',
        fileName: 'interrogation.pdf',
        originalName: 'interrogation.pdf',
        fileSize: 2048,
        mimeType: 'application/pdf',
        uploadedBy: officerUser._id,
        sha256Hash: 'f'.repeat(64),
        extractedFields: {
          witnessName: { value: 'Ravi Kumar', confidence: 0.92 },
          location: { value: 'MG Road Axis Bank', confidence: 0.85 },
        },
        extractedText: 'Statement of Ravi Kumar regarding the midnight transfer at MG Road Axis Bank...',
      });

      // Document 3 (Evidence): Mentions physical evidence seized from "Ravi Kumar"
      await Document.create({
        caseId: caseA._id,
        title: 'Seizure Memo for Hard Drive',
        documentType: 'evidence',
        s3Key: 'doc_seizure_03',
        s3Bucket: 'test-bucket',
        fileName: 'seizure.pdf',
        originalName: 'seizure.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        uploadedBy: officerUser._id,
        sha256Hash: '1'.repeat(64),
        extractedFields: {
          evidenceIdentifier: { value: 'EVD-2026-USB-01', confidence: 0.99 },
          person_name: { value: 'RAVI KUMAR', confidence: 0.95 },
        },
        extractedText: 'Seized 1x SanDisk USB Drive (EVD-2026-USB-01) from RAVI KUMAR...',
      });

      const entitiesResult = await intelligenceService.extractCaseEntities(caseA._id, officerUser);

      expect(entitiesResult.entities).toBeDefined();

      // "Ravi Kumar" should be linked across all 3 documents
      const raviEntity = entitiesResult.entities.find(
        (e) => e.canonicalName.toLowerCase() === 'ravi kumar' && e.category === 'person'
      );

      expect(raviEntity).toBeDefined();
      expect(raviEntity.distinctDocumentCount).toBe(3);
      expect(raviEntity.isMultiDocument).toBe(true);
      expect(raviEntity.mentionCount).toBe(3);
      expect(raviEntity.aliases).toContain('Shri Ravi Kumar');
      expect(raviEntity.aliases).toContain('Ravi Kumar');
      expect(raviEntity.aliases).toContain('RAVI KUMAR');
      expect(raviEntity.linkedDocuments.length).toBe(3);
      expect(raviEntity.confidence).toBeGreaterThan(0.90);

      // "MG Road Axis Bank" location should be linked across 2 documents
      const bankEntity = entitiesResult.entities.find(
        (e) => e.canonicalName.toLowerCase().includes('axis bank')
      );
      expect(bankEntity).toBeDefined();
      expect(bankEntity.distinctDocumentCount).toBe(2);
    });
  });

  describe('3. Case Isolation Guarantee', () => {
    it('should strictly isolate entities within the target case and NEVER link across cases', async () => {
      // Case A document with person "Vikram Malhotra"
      await Document.create({
        caseId: caseA._id,
        title: 'Case A Statement',
        documentType: 'statement',
        s3Key: 'doc_case_a',
        s3Bucket: 'test-bucket',
        fileName: 'case_a.pdf',
        originalName: 'case_a.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        uploadedBy: officerUser._id,
        sha256Hash: '2'.repeat(64),
        extractedFields: {
          person_name: { value: 'Vikram Malhotra', confidence: 0.95 },
        },
      });

      // Case B document with the SAME person name "Vikram Malhotra"
      await Document.create({
        caseId: caseB._id,
        title: 'Case B Statement',
        documentType: 'statement',
        s3Key: 'doc_case_b',
        s3Bucket: 'test-bucket',
        fileName: 'case_b.pdf',
        originalName: 'case_b.pdf',
        fileSize: 1024,
        mimeType: 'application/pdf',
        uploadedBy: adminUser._id,
        sha256Hash: '3'.repeat(64),
        extractedFields: {
          person_name: { value: 'Vikram Malhotra', confidence: 0.95 },
        },
      });

      // Query intelligence for Case A
      const caseAEntities = await intelligenceService.extractCaseEntities(caseA._id, officerUser);
      const caseAPerson = caseAEntities.entities.find((e) => e.canonicalName === 'Vikram Malhotra');

      expect(caseAPerson).toBeDefined();
      // Case A must ONLY have 1 document linked (not 2 from both cases!)
      expect(caseAPerson.distinctDocumentCount).toBe(1);
      expect(caseAPerson.linkedDocuments.every((d) => d.documentTitle === 'Case A Statement')).toBe(true);

      // Query intelligence for Case B
      const caseBEntities = await intelligenceService.extractCaseEntities(caseB._id, adminUser);
      const caseBPerson = caseBEntities.entities.find((e) => e.canonicalName === 'Vikram Malhotra');

      expect(caseBPerson).toBeDefined();
      expect(caseBPerson.distinctDocumentCount).toBe(1);
      expect(caseBPerson.linkedDocuments.every((d) => d.documentTitle === 'Case B Statement')).toBe(true);
    });
  });

  describe('4. Authorization & Security Boundaries', () => {
    it('should reject unauthorized officer attempting to view case intelligence', async () => {
      await expect(
        intelligenceService.getCaseIntelligence(caseA._id, unauthorizedOfficer)
      ).rejects.toThrow(/Access forbidden/);
    });

    it('should permit assigned officer and administrator to access case intelligence', async () => {
      const officerRes = await intelligenceService.getCaseIntelligence(caseA._id, officerUser);
      expect(officerRes.summary).toBeDefined();

      const adminRes = await intelligenceService.getCaseIntelligence(caseA._id, adminUser);
      expect(adminRes.summary).toBeDefined();
    });
  });
});
