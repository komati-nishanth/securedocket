jest.setTimeout(60000);
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const searchService = require('../src/services/search.service');
const vectorService = require('../src/services/vector.service');
const Document = require('../src/models/Document');
const { Case } = require('../src/models/Case');
const User = require('../src/models/User');
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

describe('Vector Service - Cosine Similarity', () => {
  it('should calculate identical vectors as 1.0', () => {
    const vecA = [0.1, 0.2, 0.3];
    const vecB = [0.1, 0.2, 0.3];
    const similarity = vectorService.calculateCosineSimilarity(vecA, vecB);
    expect(similarity).toBeCloseTo(1.0);
  });

  it('should calculate orthogonal vectors as 0.0', () => {
    const vecA = [1, 0];
    const vecB = [0, 1];
    const similarity = vectorService.calculateCosineSimilarity(vecA, vecB);
    expect(similarity).toBeCloseTo(0.0);
  });

  it('should handle missing or empty vectors gracefully', () => {
    expect(vectorService.calculateCosineSimilarity(null, [1, 2])).toBe(0);
    expect(vectorService.calculateCosineSimilarity([1, 2], [])).toBe(0);
    expect(vectorService.calculateCosineSimilarity([1, 2], [1, 2, 3])).toBe(0); // Mismatched length
  });
});

describe('Search Service - Authorization Boundaries', () => {
  let officerUser, adminUser;
  let case1, case2;
  let doc1, doc2;

  beforeEach(async () => {
    officerUser = await User.create({
      email: 'officer@example.com',
      passwordHash: 'hashedpassword123',
      name: 'Officer John',
      role: ROLES.OFFICER,
      organization: 'NYPD',
    });

    adminUser = await User.create({
      email: 'admin@example.com',
      passwordHash: 'hashedpassword123',
      name: 'Admin Jane',
      role: ROLES.ADMIN,
      organization: 'NYPD',
    });

    case1 = await Case.create({
      caseNumber: 'CASE-001',
      title: 'Robbery',
      status: 'open',
      leadOfficer: officerUser._id,
      assignedOfficers: [officerUser._id],
    });

    case2 = await Case.create({
      caseNumber: 'CASE-002',
      title: 'Fraud',
      status: 'open',
      leadOfficer: adminUser._id,
      assignedOfficers: [], // Officer John is NOT assigned to this case
    });

    // Mock embedding generation for testing
    jest.spyOn(vectorService, 'generateEmbedding').mockImplementation(async (text) => {
      // Dummy vector for testing
      return [0.5, 0.5]; 
    });

    doc1 = await Document.create({
      caseId: case1._id,
      title: 'Robbery Suspect Statement',
      documentType: 'statement',
      s3Key: 'doc1',
      s3Bucket: 'test',
      fileName: 'doc1.pdf',
      originalName: 'doc1.pdf',
      fileSize: 100,
      mimeType: 'application/pdf',
      uploadedBy: officerUser._id,
      sha256Hash: 'a'.repeat(64),
      embeddingVector: [0.5, 0.5], // Perfect match to dummy query vector
      extractedText: 'Suspect admitted to the robbery.',
    });

    doc2 = await Document.create({
      caseId: case2._id,
      title: 'Fraud Financial Records',
      documentType: 'FIR',
      s3Key: 'doc2',
      s3Bucket: 'test',
      fileName: 'doc2.pdf',
      originalName: 'doc2.pdf',
      fileSize: 100,
      mimeType: 'application/pdf',
      uploadedBy: adminUser._id,
      sha256Hash: 'b'.repeat(64),
      embeddingVector: [0.5, 0.5], // Perfect match to dummy query vector
      extractedText: 'Financial records indicate massive fraud.',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return all relevant documents for Admin', async () => {
    const results = await searchService.semanticSearch({ query: 'test', user: adminUser });
    expect(results.length).toBe(2);
  });

  it('should ONLY return documents in assigned cases for Officer', async () => {
    const results = await searchService.semanticSearch({ query: 'test', user: officerUser });
    expect(results.length).toBe(1);
    expect(results[0].documentId.toString()).toBe(doc1._id.toString());
  });

  it('should not return documents if Officer filters by unassigned case', async () => {
    const results = await searchService.semanticSearch({ query: 'test', caseIdFilter: case2._id, user: officerUser });
    expect(results.length).toBe(0);
  });
});
