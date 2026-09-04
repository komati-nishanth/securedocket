/**
 * ============================================================================
 * SIH-26190 SECURE DIGITAL EVIDENCE & DOCUMENT MANAGEMENT SYSTEM
 * DEMO SEED SCRIPT (PHASE 12)
 *
 * DISCLAIMER:
 * THIS FILE CONTAINS PURELY FICTITIOUS, SYNTHETIC DEMONSTRATION DATA
 * CREATED FOR EVALUATION AND JURY REVIEW PURPOSES.
 * NO REAL PERSONS, ACTIVE INVESTIGATIONS, OR ACTUAL PERSONAL DATA ARE USED.
 * ============================================================================
 */

const mongoose = require('mongoose');
const { User, Case, Document, AuditLog, RefreshToken } = require('../models');
const { ROLES } = require('../constants/roles');
const { DOCUMENT_TYPES, DOCUMENT_STATUS } = require('../constants/documentTypes');
const { encryptAES256GCM, calculateSha256 } = require('../utils/crypto');
const { recordAuditEntry, validateAuditChain } = require('../services/audit.service');
const config = require('../config/env');
const logger = require('../config/logger');

// Fixed demonstration TOTP secret (Compatible with Google Authenticator, Microsoft Authenticator)
const DEMO_TOTP_SECRET = 'JBSWY3DPEHPK3PXP';

const DEMO_USERS = [
  {
    email: 'demo.admin@police.gov.in',
    password: 'DemoAdminPass123!',
    name: 'Director Sandeep Verma (IPS)',
    role: ROLES.ADMIN,
    badgeNumber: 'IPS-DEMO-001',
    department: 'Central Investigation Directorate',
  },
  {
    email: 'demo.officer@police.gov.in',
    password: 'DemoOfficerPass123!',
    name: 'Inspector Devendra Rao',
    role: ROLES.OFFICER,
    badgeNumber: 'CCB-DEMO-5542',
    department: 'Cyber Crime & Special Task Force',
  },
  {
    email: 'demo.verifier@police.gov.in',
    password: 'DemoVerifierPass123!',
    name: 'Dr. Aruna Sundaram (Senior Forensic Scientist)',
    role: ROLES.VERIFIER,
    badgeNumber: 'CFSL-DEMO-9912',
    department: 'Central Forensic Science Laboratory (Digital Div)',
  },
  {
    email: 'demo.auditor@police.gov.in',
    password: 'DemoAuditorPass123!',
    name: 'Justice H. R. Natarajan (Retd. Oversight Auditor)',
    role: ROLES.AUDITOR,
    badgeNumber: 'JUD-DEMO-8801',
    department: 'Independent Judicial Oversight Commission',
  },
];

async function seedDemoData() {
  console.log('\n======================================================');
  console.log('  SIH-26190 SECURE DMS - SEEDING DEMO ENVIRONMENT');
  console.log('  [DEMO DATA - 100% SYNTHETIC / ZERO REAL PII]');
  console.log('======================================================\n');

  await mongoose.connect(config.mongodb.uri);
  logger.info('Connected to MongoDB.');

  // Clean existing demo records
  await User.deleteMany({ email: { $in: DEMO_USERS.map((u) => u.email) } });
  const existingDemoCases = await Case.find({ caseNumber: { $regex: /^DEMO/ } });
  const demoCaseIds = existingDemoCases.map((c) => c._id);
  await Document.deleteMany({
    $or: [
      { caseId: { $in: demoCaseIds } },
      { s3Key: { $regex: /^cases\/DEMO/ } },
    ],
  });
  await Case.deleteMany({ caseNumber: { $regex: /^DEMO/ } });
  await AuditLog.deleteMany({});
  await RefreshToken.deleteMany({});

  // 1. Create Demo Users
  const userMap = {};
  for (const u of DEMO_USERS) {
    const passwordHash = await User.hashPassword(u.password);
    const created = await User.create({
      email: u.email,
      passwordHash,
      name: u.name,
      role: u.role,
      badgeNumber: u.badgeNumber,
      department: u.department,
      twoFactorEnabled: true,
      totpSecret: DEMO_TOTP_SECRET,
      isActive: true,
    });
    userMap[u.role] = created;
    console.log(`[+] Created Demo User: ${u.role.toUpperCase()} -> ${u.email} (Password: ${u.password})`);
  }

  const officer = userMap[ROLES.OFFICER];
  const verifier = userMap[ROLES.VERIFIER];
  const admin = userMap[ROLES.ADMIN];

  // 2. Create Demo Cases
  const case1 = await Case.create({
    caseNumber: 'DEMO/2026/0891',
    title: 'Operation Phantom Vault: Synthetic Loan Diversion Syndicate',
    description: 'Investigation into unauthorized privilege escalation and diversion of INR 4.2 Cr using forged managerial 2FA tokens.',
    category: 'cyber_crime',
    leadOfficer: officer._id,
    assignedOfficers: [officer._id],
    status: 'under_investigation',
  });

  const case2 = await Case.create({
    caseNumber: 'DEMO/2026/0412',
    title: 'Operation Red Horizon: Digital Extortion & Cloud Ransomware',
    description: 'Targeted malware staging and exfiltration of encrypted cloud database backups.',
    category: 'cyber_crime',
    leadOfficer: officer._id,
    assignedOfficers: [officer._id],
    status: 'under_investigation',
  });

  console.log(`[+] Created Demo Cases: ${case1.caseNumber}, ${case2.caseNumber}`);

  // 3. Create Demo Documents with Full Extractions & Versioning
  const doc1Content = 'DEMO EVIDENCE FIR PAYLOAD CCPS/FIR/2026/0891';
  const doc1Hash = calculateSha256(Buffer.from(doc1Content));

  const doc1 = await Document.create({
    caseId: case1._id,
    title: 'First Information Report (Section 154 CrPC)',
    documentType: DOCUMENT_TYPES.FIR,
    s3Key: `cases/${case1.caseNumber}/demo_fir.pdf`,
    s3Bucket: config.aws.bucketName,
    fileName: 'DEMO_FIR_Bank_Fraud.pdf',
    originalName: 'DEMO_FIR_Bank_Fraud.pdf',
    fileSize: 3501,
    mimeType: 'application/pdf',
    uploadedBy: officer._id,
    sha256Hash: doc1Hash,
    status: DOCUMENT_STATUS.VERIFIED,
    verifiedBy: verifier._id,
    verifiedAt: new Date(),
    ocrConfidence: 98,
    version: 2,
    classification: {
      predictedType: 'FIR',
      confidence: 0.99,
      reasoning: 'Standard statutory FIR header with Section 154 CrPC invocation.',
      classifiedAt: new Date(),
    },
    ocrMetadata: {
      engine: 'gemini-2.5-flash',
      processedAt: new Date(),
      averageConfidence: 0.98,
      needsHumanReview: false,
      reviewPriority: 'low',
      rawTextLength: 1200,
    },
    extractedFields: {
      firNumber: {
        field: 'firNumber',
        value: 'CCPS/FIR/2026/0891',
        confidence: 0.99,
        sourceReference: 'Header Block',
        status: 'approved',
      },
      policeStation: {
        field: 'policeStation',
        value: 'Cyber Crime Police Station (CCPS) - Bengaluru',
        confidence: 0.98,
        sourceReference: 'Jurisdiction Block',
        status: 'approved',
      },
      incidentDate: {
        field: 'incidentDate',
        value: '12-Aug-2026 14:30 IST',
        confidence: 0.97,
        sourceReference: 'Section 4 Clause',
        status: 'approved',
      },
      incidentLocation: {
        field: 'incidentLocation',
        value: 'Apex Financial Hub, Koramangala, Bengaluru',
        confidence: 0.97,
        sourceReference: 'Section 4 Location',
        status: 'approved',
      },
      complainant: {
        field: 'complainant',
        value: encryptAES256GCM('Ananya Rameshwaram (Chief Compliance Officer)', config.masterEncryptionKey),
        confidence: 0.99,
        sourceReference: 'Section 5 Informant',
        status: 'approved',
        isEncrypted: true,
      },
      accused: {
        field: 'accused',
        value: encryptAES256GCM('Sameer Rohan Verma (Former Systems Admin)', config.masterEncryptionKey),
        confidence: 0.98,
        sourceReference: 'Section 6 Suspects',
        status: 'approved',
        isEncrypted: true,
      },
      sections: {
        field: 'sections',
        value: 'IPC 420, 468, 471 & IT Act 66C, 66D',
        confidence: 0.98,
        sourceReference: 'Section 3 Acts',
        status: 'approved',
      },
    },
    versions: [
      {
        versionNumber: 1,
        version: 1,
        s3Key: `cases/${case1.caseNumber}/demo_fir.pdf`,
        sha256Hash: doc1Hash,
        fileSize: 3501,
        mimeType: 'application/pdf',
        uploadedBy: officer._id,
        createdAt: new Date(Date.now() - 3600000),
        changeDescription: 'Initial secure ingestion',
      },
      {
        versionNumber: 2,
        version: 2,
        s3Key: `cases/${case1.caseNumber}/demo_fir.pdf`,
        sha256Hash: doc1Hash,
        fileSize: 3501,
        mimeType: 'application/pdf',
        uploadedBy: verifier._id,
        editedBy: verifier._id,
        createdAt: new Date(),
        changeDescription: "Field correction: 'policeStation' normalized by Forensic Verifier",
      },
    ],
  });

  console.log(`[+] Created Demo Vault Document: ${doc1.title} (v${doc1.version}, Status: ${doc1.status})`);

  // 4. Record Chained Cryptographic Audit Logs
  await recordAuditEntry({
    userId: admin._id,
    action: 'CASE_CREATE',
    caseId: case1._id,
    details: { caseNumber: case1.caseNumber, category: case1.category },
  });

  await recordAuditEntry({
    userId: officer._id,
    action: 'DOCUMENT_UPLOAD',
    documentId: doc1._id,
    caseId: case1._id,
    details: { fileName: doc1.fileName, sha256Hash: doc1.sha256Hash },
  });

  await recordAuditEntry({
    userId: verifier._id,
    action: 'DOCUMENT_FIELD_CORRECT',
    documentId: doc1._id,
    caseId: case1._id,
    details: { fieldName: 'policeStation', versionNumber: 2 },
  });

  await recordAuditEntry({
    userId: verifier._id,
    action: 'DOCUMENT_VERIFY',
    documentId: doc1._id,
    caseId: case1._id,
    details: { verifiedBy: verifier.name, status: 'verified' },
  });

  // 5. Verify Cryptographic Ledger Integrity
  const chainAudit = await validateAuditChain();
  console.log(`\n[+] Cryptographic Hash Chain Validation: ${chainAudit.isValid ? 'VERIFIED (100% VALID)' : 'COMPROMISED'}`);
  console.log(`[+] Total Chained Records: ${chainAudit.totalRecords}`);

  console.log('\n======================================================');
  console.log('  DEMO SEED COMPLETED SUCCESSFULLY');
  console.log('  Demo TOTP Secret for All Accounts: ' + DEMO_TOTP_SECRET);
  console.log('======================================================\n');

  await mongoose.disconnect();
}

if (require.main === module) {
  seedDemoData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Demo seed error:', err);
      process.exit(1);
    });
}

module.exports = seedDemoData;
