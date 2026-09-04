jest.setTimeout(60000);
const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const { AuditLog } = require('../src/models');
const { recordAuditEntry, verifyAuditChainIntegrity } = require('../src/services/audit.service');
const { AUDIT_ACTIONS } = require('../src/constants/actions');
const { calculateAuditHash, GENESIS_HASH } = require('../src/utils/crypto');

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());
}, 60000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

beforeEach(async () => {
  await AuditLog.deleteMany({});
});

describe('Tamper-Evident Audit Trail - Hash Chain Verification', () => {
  const dummyUserId = new mongoose.Types.ObjectId();
  const dummyDocId = new mongoose.Types.ObjectId();
  const dummyCaseId = new mongoose.Types.ObjectId();

  const createNormalChain = async (count = 3) => {
    for (let i = 0; i < count; i++) {
      await recordAuditEntry({
        userId: dummyUserId,
        action: AUDIT_ACTIONS.DOCUMENT_VIEW,
        documentId: dummyDocId,
        caseId: dummyCaseId,
        details: { index: i },
      });
    }
  };

  test('1. Normal chain passes verification', async () => {
    await createNormalChain(3);

    const result = await verifyAuditChainIntegrity();
    expect(result.valid).toBe(true);
    expect(result.checkedEntries).toBe(3);
  });

  test('2. Modified event payload fails verification', async () => {
    await createNormalChain(3);

    // Tamper with the 2nd record's details
    const records = await AuditLog.find().sort({ timestamp: 1 });
    const tamperedRecord = records[1];
    
    await AuditLog.collection.updateOne(
      { _id: tamperedRecord._id },
      { $set: { action: AUDIT_ACTIONS.DOCUMENT_DOWNLOAD } }
    );

    const result = await verifyAuditChainIntegrity();
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('PAYLOAD_HASH_TAMPERED');
    expect(result.firstBrokenEntry.toString()).toBe(tamperedRecord._id.toString());
  });

  test('3. Modified currentHash fails verification', async () => {
    await createNormalChain(3);

    const records = await AuditLog.find().sort({ timestamp: 1 });
    const tamperedRecord = records[1];
    
    // Change the hash slightly
    const fakeHash = 'f'.repeat(64);
    await AuditLog.collection.updateOne(
      { _id: tamperedRecord._id },
      { $set: { currentHash: fakeHash } }
    );

    const result = await verifyAuditChainIntegrity();
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('PAYLOAD_HASH_TAMPERED'); 
  });

  test('4. Modified previousHash fails verification', async () => {
    await createNormalChain(3);

    const records = await AuditLog.find().sort({ timestamp: 1 });
    const tamperedRecord = records[1];
    
    // Tamper with previousHash
    const fakeHash = 'a'.repeat(64);
    await AuditLog.collection.updateOne(
      { _id: tamperedRecord._id },
      { $set: { previousHash: fakeHash } }
    );

    const result = await verifyAuditChainIntegrity();
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('PREVIOUS_HASH_MISMATCH');
    expect(result.firstBrokenEntry.toString()).toBe(tamperedRecord._id.toString());
  });

  test('5. Deleted/interrupted entry is detected', async () => {
    await createNormalChain(4);

    const records = await AuditLog.find().sort({ timestamp: 1 });
    // Delete the 2nd record
    await AuditLog.collection.deleteOne({ _id: records[1]._id });

    const result = await verifyAuditChainIntegrity();
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('PREVIOUS_HASH_MISMATCH');
    // It should detect the break at what is now index 1 (originally index 2)
    expect(result.firstBrokenEntry.toString()).toBe(records[2]._id.toString());
  });

  test('6. Reordered events are detected', async () => {
    await createNormalChain(3);

    const records = await AuditLog.find().sort({ timestamp: 1 });
    
    // Swap the timestamps of record 1 and 2 to change the sort order
    await AuditLog.collection.updateOne(
      { _id: records[1]._id },
      { $set: { timestamp: records[2].timestamp } }
    );
    await AuditLog.collection.updateOne(
      { _id: records[2]._id },
      { $set: { timestamp: records[1].timestamp } }
    );

    const result = await verifyAuditChainIntegrity();
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('PREVIOUS_HASH_MISMATCH');
  });
});
