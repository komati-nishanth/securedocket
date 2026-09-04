const logger = require('../config/logger');
const config = require('../config/env');
const { GoogleGenerativeAI } = require('@google/generative-ai');

/**
 * Semantic Embedding & Vector Search Service Contract
 */
class VectorService {
  constructor() {
    this.apiKey = config.gemini.apiKey || '';
    this.genAI = this.apiKey ? new GoogleGenerativeAI(this.apiKey) : null;
    this.modelName = 'gemini-embedding-001';
  }

  cosineSimilarity(vecA, vecB) {
    return this.calculateCosineSimilarity(vecA, vecB);
  }

  /**
   * Calculate Cosine Similarity between two numerical vectors
   * @param {number[]} vecA
   * @param {number[]} vecB
   * @returns {number} Value between -1.0 and 1.0 (typically 0.0 to 1.0 for embeddings)
   */
  calculateCosineSimilarity(vecA, vecB) {
    if (!vecA || !vecB || vecA.length !== vecB.length || vecA.length === 0) {
      return 0;
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }

    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Deterministic 768-dimensional feature projection fallback
   */
  generateDeterministicFallbackEmbedding(text) {
    const vector = new Array(768).fill(0);
    const tokens = text.toLowerCase().split(/\W+/).filter(Boolean);
    if (tokens.length === 0) return vector;

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      let hash = 0;
      for (let j = 0; j < token.length; j++) {
        hash = ((hash << 5) - hash) + token.charCodeAt(j);
        hash |= 0;
      }
      const idx = Math.abs(hash) % 768;
      vector[idx] += 1;
    }

    // Normalize vector to unit length
    let norm = 0;
    for (let i = 0; i < 768; i++) {
      norm += vector[i] * vector[i];
    }
    norm = Math.sqrt(norm);
    if (norm > 0) {
      for (let i = 0; i < 768; i++) {
        vector[i] /= norm;
      }
    }
    return vector;
  }

  /**
   * Generate 768-dimensional text embedding vector
   */
  async generateEmbedding(text) {
    if (!text || text.trim() === '') {
      return null;
    }

    if (!this.genAI) {
      logger.warn('[Vector Service] Gemini API key not configured. Using deterministic fallback projection.');
      return this.generateDeterministicFallbackEmbedding(text);
    }

    try {
      logger.info(`[Vector Service] Generating semantic embedding for text (${text.length} chars)`);
      const model = this.genAI.getGenerativeModel({ model: this.modelName });
      
      const result = await model.embedContent(text);
      const embedding = result.embedding;
      return embedding.values; // Should be a 768-dimensional array
    } catch (error) {
      logger.warn(`[Vector Service] Gemini API embedContent unavailable (${error.message}). Falling back to local projection.`);
      return this.generateDeterministicFallbackEmbedding(text);
    }
  }
}

module.exports = new VectorService();
