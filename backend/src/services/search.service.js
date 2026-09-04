const Document = require('../models/Document');
const { Case } = require('../models/Case');
const vectorService = require('./vector.service');
const ApiError = require('../utils/apiError');
const { HTTP_STATUS, ERROR_CODES } = require('../constants/statusCodes');
const { ROLES } = require('../constants/roles');
const logger = require('../config/logger');

class SearchService {
  /**
   * Perform a semantic search across documents using cosine similarity.
   * Enforces role-based access control.
   */
  async semanticSearch(options = {}, userParam = null) {
    const query = typeof options === 'string' ? options : (options.query || '');
    const caseIdFilter = options.caseIdFilter || options.caseId || null;
    const threshold = typeof options.threshold === 'number' ? options.threshold : 0.15;
    const user = userParam || options.user || {};

    if (!query || query.trim() === '') {
      throw new ApiError(HTTP_STATUS.BAD_REQUEST, 'Search query is required', ERROR_CODES.VALIDATION_ERROR);
    }

    const userId = user._id ? user._id.toString() : (user.id ? user.id.toString() : 'anonymous');
    logger.info(`[Search Service] User ${userId} searching for: "${query}"`);

    // 1. Generate Query Embedding
    const queryEmbedding = await vectorService.generateEmbedding(query);
    if (!queryEmbedding) {
      throw new ApiError(HTTP_STATUS.INTERNAL_SERVER_ERROR, 'Failed to generate embedding for search query', ERROR_CODES.INTERNAL_SERVER_ERROR);
    }

    // 2. Authorization Boundaries
    const filter = {};
    if (caseIdFilter) {
      filter.caseId = caseIdFilter;
    }

    if (user.role === ROLES.OFFICER) {
      // Officers can only search within cases assigned to them (as lead or assigned officer)
      const assignedCases = await Case.find({
        $or: [{ leadOfficer: userId }, { assignedOfficers: userId }],
      }).select('_id');
      const assignedCaseIds = assignedCases.map((c) => c._id);

      if (filter.caseId) {
        // Ensure the filtered case is actually one they are assigned to
        const isAssigned = assignedCaseIds.some(
          (id) => id.toString() === filter.caseId.toString()
        );
        if (!isAssigned) {
          logger.warn(`[Search Security] Unauthorized search attempt by Officer ${userId} on unassigned Case ${filter.caseId}`);
          return []; // Strictly return empty results for unassigned case to maintain confidentiality
        }
      } else {
        filter.caseId = { $in: assignedCaseIds };
      }
    }

    // 3. Fetch Authorized Documents
    const documents = await Document.find(filter)
      .select('title documentType caseId s3Key fileName fileSize mimeType classification ocrConfidence status embeddingVector extractedText extractedFields')
      .populate('caseId', 'title caseNumber');

    // 4. Calculate Cosine Similarity & Rank
    const results = [];

    for (const doc of documents) {
      let docVec = doc.embeddingVector;
      if (!Array.isArray(docVec) || docVec.length === 0) {
        const textForEmbedding = doc.extractedText || `${doc.title} ${doc.documentType}`;
        docVec = await vectorService.generateEmbedding(textForEmbedding);
        if (docVec && docVec.length > 0) {
          // Asynchronously save vector for future queries
          Document.findByIdAndUpdate(doc._id, { embeddingVector: docVec }).catch(() => {});
        }
      }

      if (!docVec || docVec.length === 0) continue;

      const similarity = vectorService.calculateCosineSimilarity(queryEmbedding, docVec);
      
      // Threshold check (return relevant results)
      if (similarity >= threshold) {
        // Find a relevant snippet from extractedText
        let snippet = '';
        if (doc.extractedText) {
          snippet = doc.extractedText.substring(0, 300) + '...';
        } else {
          snippet = `Document title: ${doc.title} (${doc.documentType})`;
        }

        results.push({
          documentId: doc._id,
          title: doc.title,
          documentType: doc.documentType,
          caseTitle: doc.caseId?.title,
          caseNumber: doc.caseId?.caseNumber,
          caseId: doc.caseId?._id,
          similarityScore: similarity,
          snippet: snippet,
          status: doc.status,
          classification: doc.classification?.predictedType,
          ocrConfidence: doc.ocrConfidence
        });
      }
    }

    // Sort descending by similarity score
    results.sort((a, b) => b.similarityScore - a.similarityScore);

    // Limit to top 20
    return results.slice(0, 20);
  }
}

module.exports = new SearchService();
