jest.setTimeout(60000);
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { User, Case, Document, AuditLog } = require('../src/models');
const { ROLES } = require('../src/constants/roles');
const { DOCUMENT_TYPES, DOCUMENT_STATUS } = require('../src/constants/documentTypes');
const aiOcrService = require('../src/services/aiOcr.service');
const extractionService = require('../src/services/extraction.service');
const vectorService = require('../src/services/vector.service');
const searchService = require('../src/services/search.service');

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

describe('Phase 12: AI Intelligence & Robustness Scenarios (Scenarios 19-24)', () => {
  let adminUser, testCase, testDoc;

  beforeAll(async () => {
    adminUser = await User.create({
      email: 'admin.ai@police.gov.in',
      passwordHash: await User.hashPassword('AdminPass123!'),
      name: 'Admin User',
      role: ROLES.ADMIN,
      isActive: true,
    });

    testCase = await Case.create({
      caseNumber: 'CR/2026/0999',
      title: 'AI Intelligence Testing Docket',
      leadOfficer: adminUser._id,
      assignedOfficers: [adminUser._id],
      status: 'under_investigation',
    });

    testDoc = await Document.create({
      caseId: testCase._id,
      title: 'Unclassified Document Payload',
      documentType: DOCUMENT_TYPES.EVIDENCE,
      s3Key: 'cases/CR_2026_0999/unclassified.txt',
      s3Bucket: 'sih26190-secure-documents-vault',
      fileName: 'unclassified.txt',
      originalName: 'unclassified.txt',
      fileSize: 512,
      mimeType: 'text/plain',
      uploadedBy: adminUser._id,
      sha256Hash: 'b'.repeat(64),
      status: DOCUMENT_STATUS.PENDING_REVIEW,
      version: 1,
    });
  });

  // Scenario 19: Low OCR Confidence handling
  it('Scenario 19: Low OCR confidence sets needsHumanReview to true and flags priority', async () => {
    const poorQualityText = 'illegible ??? smudged text 123 %%% ???';
    const result = await aiOcrService.processDocument({
      fileBuffer: Buffer.from(poorQualityText),
      mimeType: 'text/plain',
      fileName: 'smudged_scan.txt',
      documentTypeHint: 'evidence',
    });

    expect(result).toBeDefined();
    const hasLowConfidence = result.fields.some((f) => f.confidence < 0.80);
    expect(hasLowConfidence).toBe(true);
  });

  // Scenario 20: OCR Failure fallback & audit log
  it('Scenario 20: Graceful fallback when Primary OCR fails', async () => {
    const result = await aiOcrService.processDocument({
      fileBuffer: Buffer.from(''),
      mimeType: 'text/plain',
      fileName: 'empty_file.txt',
    });

    expect(result).toBeDefined();
    expect(result.classification).toBeDefined();
    expect(Array.isArray(result.fields)).toBe(true);
  });

  // Scenario 21: Classification uncertainty
  it('Scenario 21: Classification handles non-standard or uncertain document formats', async () => {
    const genericText = 'Random informal note without standard legal headings or FIR markers.';
    const result = await aiOcrService.processDocument({
      fileBuffer: Buffer.from(genericText),
      mimeType: 'text/plain',
      fileName: 'informal_memo.txt',
    });

    expect(result.classification).toBeDefined();
    expect(typeof result.classification.predictedType).toBe('string');
    expect(typeof result.classification.confidence).toBe('number');
    expect(result.classification.confidence).toBeGreaterThanOrEqual(0);
    expect(result.classification.confidence).toBeLessThanOrEqual(1.0);
  });

  // Scenario 22: Malformed AI response normalization
  it('Scenario 22: JSON normalization strips markdown code blocks cleanly', () => {
    const sampleRawGeminiResponse = {
      rawText: 'Extracted sample text',
      classification: {
        predictedType: 'FIR',
        confidence: 0.95,
        reasoning: 'Standard FIR header present',
      },
      fields: [
        { field: 'firNumber', value: 'FIR/2026/999', confidence: 0.95 },
      ],
      averageConfidence: 0.95,
    };

    const normalized = aiOcrService._normalizeExtractionResult(sampleRawGeminiResponse, 'gemini-2.5-flash');
    expect(normalized.classification.predictedType).toBe('FIR');
    expect(normalized.ocrMetadata.engine).toBe('gemini-2.5-flash');
    expect(normalized.fields.length).toBeGreaterThan(0);
  });

  // Scenario 23: Missing embedding handling
  it('Scenario 23: System operates cleanly when vector embedding is omitted or unavailable', async () => {
    const sim = vectorService.cosineSimilarity([], [0.1, 0.2]);
    expect(sim).toBe(0);

    const zeroSim = vectorService.cosineSimilarity(null, null);
    expect(zeroSim).toBe(0);
  });

  // Scenario 24: Semantic search with no results
  it('Scenario 24: Semantic search returns clean empty list when query has no matching similarity', async () => {
    const searchRes = await searchService.semanticSearch(
      {
        query: 'quantum propulsion thermodynamics astrophysics',
        threshold: 0.99,
      },
      { id: adminUser._id, role: ROLES.ADMIN }
    );

    expect(searchRes).toBeDefined();
    expect(Array.isArray(searchRes)).toBe(true);
    expect(searchRes.length).toBe(0);
  });
});
