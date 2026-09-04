const { GoogleGenerativeAI } = require('@google/generative-ai');
const pdfParse = require('pdf-parse');
const config = require('../config/env');
const logger = require('../config/logger');
const { ALL_DOCUMENT_TYPES, DOCUMENT_TYPES } = require('../constants/documentTypes');

/**
 * AI OCR & Document Intelligence Service
 * Primary: Gemini Vision / Multimodal API (Server-side Only)
 * Fallback: Local PDF Text / Template Extractor Engine
 */
class AiOcrService {
  constructor() {
    this.apiKey = config.gemini.apiKey || '';
    this.genAI = this.apiKey ? new GoogleGenerativeAI(this.apiKey) : null;
    this.modelName = 'gemini-2.5-flash';
  }

  /**
   * Main entrypoint: Perform OCR & Intelligence on Document Buffer
   */
  async processDocument({ fileBuffer, mimeType, fileName, documentTypeHint }) {
    const startTime = Date.now();
    logger.info(`[AI OCR] Initiating document intelligence pipeline for ${fileName} (${mimeType}, ${fileBuffer?.length} bytes)`);

    // 1. Attempt Primary: Gemini Vision / Multimodal API
    if (this.genAI && this.apiKey && this.apiKey !== 'your_gemini_api_key' && this.apiKey.trim() !== '') {
      try {
        const geminiResult = await this._processWithGeminiRetry({
          fileBuffer,
          mimeType,
          fileName,
          documentTypeHint,
        });

        if (geminiResult && geminiResult.fields) {
          logger.info(`[AI OCR] Gemini extraction successful in ${Date.now() - startTime}ms`, {
            engine: 'gemini-vision',
            classification: geminiResult.classification?.predictedType,
            avgConfidence: geminiResult.ocrMetadata?.averageConfidence,
          });
          return geminiResult;
        }
      } catch (err) {
        // Safe logging without leaking sensitive document content
        logger.warn(`[AI OCR] Gemini processing failed (${err.message}), seamlessly engaging local fallback extractor`, {
          errorCode: err.code || 'GEMINI_ERR',
          latencyMs: Date.now() - startTime,
        });
      }
    } else {
      logger.info(`[AI OCR] No active Gemini API key configured. Utilizing high-precision local legal document extractor engine.`);
    }

    // 2. Fallback: Local Extraction Engine
    return await this._processWithLocalFallback({
      fileBuffer,
      mimeType,
      fileName,
      documentTypeHint,
    });
  }

  /**
   * Primary Engine: Gemini Vision / Multimodal API with Timeout and Retry
   */
  async _processWithGeminiRetry({ fileBuffer, mimeType, fileName, documentTypeHint }, maxRetries = 2) {
    let lastError = null;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const model = this.genAI.getGenerativeModel({
          model: this.modelName,
          generationConfig: {
            responseMimeType: 'application/json',
            temperature: 0.1,
          },
        });

        const prompt = `You are a Law Enforcement Document Intelligence AI for an official Police & Judicial Document Management System (SIH-26190).
Analyze the provided document and extract structured evidentiary fields.

Allowed Document Classifications: ["FIR", "statement", "chargesheet", "evidence", "forensic_report"]

Extraction Schema by Category:
- FIR: firNumber, policeStation, incidentDate, incidentLocation, complainant, accused, sections
- Statement: witnessName, statementDate, incidentReferences, locations
- Chargesheet: accused, sections, filingDate, investigatingOfficer, referencedEvidence
- Evidence: evidenceIdentifier, collectionDate, location, description, custodian
- Forensic Report: reportNumber, examinationDate, laboratory, findings, relatedEvidence

JSON Response Schema Requirement:
{
  "rawText": "Extracted OCR text from the document",
  "classification": {
    "predictedType": "FIR | statement | chargesheet | evidence | forensic_report",
    "confidence": 0.0 to 1.0,
    "reasoning": "Brief technical reasoning for this category"
  },
  "fields": [
    {
      "field": "fieldName",
      "value": "extracted value or list of values",
      "confidence": 0.0 to 1.0,
      "sourceReference": "Page or paragraph reference where found"
    }
  ],
  "averageConfidence": 0.0 to 1.0
}

Document Type Hint: ${documentTypeHint || 'Unspecified'}
Filename: ${fileName}
Strictly return valid JSON only.`;

        // Format parts based on MIME type
        const parts = [];
        if (mimeType.includes('pdf') || mimeType.includes('image')) {
          parts.push({
            inlineData: {
              data: fileBuffer.toString('base64'),
              mimeType: mimeType.includes('pdf') ? 'application/pdf' : mimeType,
            },
          });
        } else {
          // Text / ASCII
          parts.push({ text: fileBuffer.toString('utf8') });
        }
        parts.push({ text: prompt });

        // Execute with 15s timeout
        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Gemini API timeout exceeded (15s)')), 15000)
        );

        const resultPromise = model.generateContent(parts);
        const response = await Promise.race([resultPromise, timeoutPromise]);
        const responseText = response.response.text();
        const cleanedJson = responseText.replace(/```json/gi, '').replace(/```/g, '').trim();

        const parsed = JSON.parse(cleanedJson);
        return this._normalizeExtractionResult(parsed, 'gemini-2.5-flash');
      } catch (err) {
        lastError = err;
        if (attempt < maxRetries) {
          const backoffMs = attempt * 1000;
          await new Promise((r) => setTimeout(r, backoffMs));
        }
      }
    }

    throw lastError;
  }

  /**
   * Fallback Engine: High-Precision Local Text & Legal Template Parser
   */
  async _processWithLocalFallback({ fileBuffer, mimeType, fileName, documentTypeHint }) {
    let extractedText = '';

    // 1. Extract raw text from PDF/Text buffer
    try {
      if (mimeType === 'application/pdf' || (fileName && fileName.toLowerCase().endsWith('.pdf'))) {
        const pdfData = await pdfParse(fileBuffer);
        if (pdfData && pdfData.text && pdfData.text.trim().length > 0) {
          extractedText = pdfData.text;
        } else {
          extractedText = fileBuffer.toString('utf8');
        }
      } else {
        extractedText = fileBuffer.toString('utf8');
      }
    } catch (err) {
      extractedText = fileBuffer.toString('utf8');
    }

    // Clean up text
    const cleanText = (extractedText || fileBuffer.toString('utf8')).replace(/\r\n/g, '\n').trim();

    // 2. Classify Document based on vocabulary
    const classification = this._classifyText(cleanText, fileName, documentTypeHint);

    // 3. Extract schema fields based on classified type
    const fields = this._extractFieldsByRule(cleanText, classification.predictedType, fileName);

    // 4. Calculate aggregate confidence
    let totalConf = 0;
    fields.forEach((f) => {
      totalConf += f.confidence;
    });
    const avgConfidence = fields.length > 0 ? parseFloat((totalConf / fields.length).toFixed(2)) : 0.85;

    return {
      rawText: cleanText || `Extracted evidence binary payload for ${fileName}`,
      classification,
      fields,
      ocrMetadata: {
        engine: 'local-legal-ocr-engine',
        processedAt: new Date(),
        averageConfidence: avgConfidence,
        rawTextLength: cleanText.length,
      },
    };
  }

  /**
   * Heuristic Document Classifier using legal vocabulary and structural markers
   */
  _classifyText(text, fileName, hint) {
    const lower = `${text} ${fileName || ''} ${hint || ''}`.toLowerCase();

    const scores = {
      [DOCUMENT_TYPES.FIR]: 0,
      [DOCUMENT_TYPES.STATEMENT]: 0,
      [DOCUMENT_TYPES.CHARGESHEET]: 0,
      [DOCUMENT_TYPES.EVIDENCE]: 0,
      [DOCUMENT_TYPES.FORENSIC_REPORT]: 0,
    };

    // FIR vocabulary
    if (lower.includes('first information report') || lower.includes('fir') || lower.includes('police station')) scores[DOCUMENT_TYPES.FIR] += 5;
    if (lower.includes('complainant') || lower.includes('informant')) scores[DOCUMENT_TYPES.FIR] += 3;
    if (lower.includes('section') || lower.includes('ipc') || lower.includes('bns')) scores[DOCUMENT_TYPES.FIR] += 2;

    // Statement vocabulary
    if (lower.includes('statement') || lower.includes('deposition') || lower.includes('crpc 161') || lower.includes('witness')) scores[DOCUMENT_TYPES.STATEMENT] += 6;
    if (lower.includes('recorded before') || lower.includes('deponent')) scores[DOCUMENT_TYPES.STATEMENT] += 3;

    // Chargesheet vocabulary
    if (lower.includes('charge sheet') || lower.includes('chargesheet') || lower.includes('final report') || lower.includes('crpc 173')) scores[DOCUMENT_TYPES.CHARGESHEET] += 7;
    if (lower.includes('investigating officer') && lower.includes('accused')) scores[DOCUMENT_TYPES.CHARGESHEET] += 3;

    // Forensic Report vocabulary
    if (lower.includes('forensic') || lower.includes('cfsl') || lower.includes('laboratory') || lower.includes('chemical analysis') || lower.includes('ballistics')) scores[DOCUMENT_TYPES.FORENSIC_REPORT] += 7;
    if (lower.includes('examination report') || lower.includes('opinion of expert')) scores[DOCUMENT_TYPES.FORENSIC_REPORT] += 4;

    // Evidence vocabulary
    if (lower.includes('evidence') || lower.includes('seizure memo') || lower.includes('panchnama') || lower.includes('custodian') || lower.includes('recovery')) scores[DOCUMENT_TYPES.EVIDENCE] += 5;

    // If hint is valid, give boost
    if (hint && scores[hint] !== undefined) {
      scores[hint] += 4;
    }

    let topCategory = hint && ALL_DOCUMENT_TYPES.includes(hint) ? hint : DOCUMENT_TYPES.EVIDENCE;
    let maxScore = -1;

    for (const [cat, score] of Object.entries(scores)) {
      if (score > maxScore) {
        maxScore = score;
        topCategory = cat;
      }
    }

    const confidence = maxScore >= 5 ? 0.95 : maxScore >= 3 ? 0.85 : 0.72;

    return {
      predictedType: topCategory,
      confidence,
      reasoning: `Classified as ${topCategory.toUpperCase()} based on legal keywords and document structure markers.`,
      classifiedAt: new Date(),
    };
  }

  /**
   * Rule-based Field Extractor tailored to each specific legal document schema
   */
  _extractFieldsByRule(text, documentType, fileName) {
    const fields = [];

    // Helper regex extractors (returns match and exact matched position if found)
    const matchFirst = (regexes) => {
      for (const rx of regexes) {
        const m = text.match(rx);
        if (m && m[1] && m[1].trim().length > 0) {
          return m[1].trim();
        }
      }
      return null;
    };

    const addField = (field, val, confidenceIfFound, sourceRef) => {
      if (val !== null && val !== undefined && val.trim() !== '') {
        fields.push({
          field,
          value: val,
          confidence: confidenceIfFound,
          sourceReference: sourceRef,
        });
      } else {
        // Preserves field in schema as pending/unextracted without inventing false data
        fields.push({
          field,
          value: null,
          confidence: 0.0,
          sourceReference: 'Unidentified in source text (Requires Human Review)',
        });
      }
    };

    switch (documentType) {
      case DOCUMENT_TYPES.FIR: {
        const firNum = matchFirst([
          /(?:FIR|Case)\s+(?:No\.?|Number)?:?\s*([A-Z0-9/\-_]+)/i,
          /(?:CR|FIR)[/-]\d{4}[/-][A-Z0-9-]+/i,
          /(?:FIR\s*No\.?):?\s*([A-Z0-9/\-_]+)/i,
        ]);

        const ps = matchFirst([
          /(?:Police Station|PS|Station):?\s*([^\n,]+)/i,
          /(?:Jurisdiction):?\s*([^\n,]+)/i,
        ]);

        const incDate = matchFirst([
          /(?:Date of Incident|Incident Date|Date & Time|Timestamp):?\s*([^\n,]+)/i,
        ]);

        const loc = matchFirst([
          /(?:Place of Occurrence|Incident Location|Location):?\s*([^\n,]+)/i,
        ]);

        const comp = matchFirst([
          /(?:Complainant|Informant|Lodged by):?\s*([^\n,]+)/i,
        ]);

        const accused = matchFirst([
          /(?:Accused|Suspect|Name of Accused):?\s*([^\n,]+)/i,
        ]);

        const sectionsRaw = matchFirst([
          /(?:Acts?\s*&\s*Sections?|Offences?|Penal Sections?):?\s*([^\n]+)/i,
          /(?:Sections?|Acts?|U\/S):?\s*([^\n]+)/i,
          /(?:Under Section):?\s*([^\n]+)/i,
        ]);
        const sections = sectionsRaw ? sectionsRaw.replace(/^(?:Acts?\s*&\s*Sections?:?|Sections?:?|Offences?:?)/i, '').trim() : null;

        addField('firNumber', firNum, 0.95, 'FIR Header');
        addField('policeStation', ps, 0.92, 'Jurisdiction Block');
        addField('incidentDate', incDate, 0.88, 'Occurrence Section');
        addField('incidentLocation', loc, 0.86, 'Location Clause');
        addField('complainant', comp, 0.91, 'Complainant Block');
        addField('accused', accused, 0.89, 'Accused List');
        addField('sections', sections, 0.94, 'Statutory Sections');
        break;
      }

      case DOCUMENT_TYPES.STATEMENT: {
        const witness = matchFirst([
          /(?:Statement of|Witness Name|Deponent|Deposition of):?\s*([^\n,]+)/i,
          /(?:Name of Witness):?\s*([^\n,]+)/i,
        ]);

        const stmtDate = matchFirst([
          /(?:Recorded on|Statement Date|Date of Recording):?\s*([^\n,]+)/i,
        ]);

        const refs = matchFirst([
          /(?:In reference to|Concerning Case|Matter of):?\s*([^\n,]+)/i,
        ]);

        const loc = matchFirst([
          /(?:Recorded at|Station|Location):?\s*([^\n,]+)/i,
        ]);

        addField('witnessName', witness, 0.93, 'Title / Deponent');
        addField('statementDate', stmtDate, 0.90, 'Date of Statement');
        addField('incidentReferences', refs, 0.87, 'Reference Text');
        addField('locations', loc, 0.88, 'Recording Location');
        break;
      }

      case DOCUMENT_TYPES.CHARGESHEET: {
        const accused = matchFirst([
          /(?:Name of Accused|Accused Persons|Chargesheeted):?\s*([^\n,]+)/i,
        ]);

        const sections = matchFirst([
          /(?:Offences Charged|Sections|U\/S):?\s*([^\n,]+)/i,
        ]);

        const fDate = matchFirst([
          /(?:Date of Filing|Filing Date|Submission Date):?\s*([^\n,]+)/i,
        ]);

        const io = matchFirst([
          /(?:Investigating Officer|IO|Officer in Charge):?\s*([^\n,]+)/i,
        ]);

        const refEvidence = matchFirst([
          /(?:List of Documents|Referenced Evidence|Annexures):?\s*([^\n]+)/i,
        ]);

        addField('accused', accused, 0.94, 'Accused Column');
        addField('sections', sections, 0.96, 'Charge Formulation');
        addField('filingDate', fDate, 0.91, 'Court Presentation');
        addField('investigatingOfficer', io, 0.93, 'IO Signature Block');
        addField('referencedEvidence', refEvidence, 0.89, 'Document Schedule');
        break;
      }

      case DOCUMENT_TYPES.FORENSIC_REPORT: {
        const repNum = matchFirst([
          /(?:Report No\.?|CFSL No\.?|Reference No\.?):?\s*([^\n,]+)/i,
        ]);

        const examDate = matchFirst([
          /(?:Date of Examination|Examination Date|Analysis Date):?\s*([^\n,]+)/i,
        ]);

        const lab = matchFirst([
          /(?:Laboratory|Forensic Lab|Institution):?\s*([^\n,]+)/i,
        ]);

        const findings = matchFirst([
          /(?:Opinion|Findings|Conclusion|Result of Examination):?\s*([^\n]+)/i,
        ]);

        const relEvidence = matchFirst([
          /(?:Specimen Received|Related Evidence|Exhibit No\.?):?\s*([^\n,]+)/i,
        ]);

        addField('reportNumber', repNum, 0.97, 'Report Header');
        addField('examinationDate', examDate, 0.92, 'Exam Date Block');
        addField('laboratory', lab, 0.95, 'CFSL Seal');
        addField('findings', findings, 0.90, 'Expert Opinion Section');
        addField('relatedEvidence', relEvidence, 0.88, 'Exhibit Description');
        break;
      }

      case DOCUMENT_TYPES.EVIDENCE:
      default: {
        const evId = matchFirst([
          /(?:Evidence (?:ID|Identifier|No\.?)|Exhibit):?\s*([^\n,]+)/i,
        ]);

        const colDate = matchFirst([
          /(?:Date of Recovery|Collection Date|Seizure Date):?\s*([^\n,]+)/i,
        ]);

        const loc = matchFirst([
          /(?:Seized From|Location of Seizure|Recovery Spot):?\s*([^\n,]+)/i,
        ]);

        const desc = matchFirst([
          /(?:Description of Item|Seizure Description|Evidence Details):?\s*([^\n]+)/i,
        ]);

        const custodian = matchFirst([
          /(?:Custodian|Malkhana Incharge|Officer Seizing):?\s*([^\n,]+)/i,
        ]);

        addField('evidenceIdentifier', evId, 0.91, 'Evidence Tag');
        addField('collectionDate', colDate, 0.89, 'Seizure Clause');
        addField('location', loc, 0.87, 'Spot Memo');
        addField('description', desc, 0.92, 'Item Manifest');
        addField('custodian', custodian, 0.90, 'Malkhana Log');
        break;
      }
    }

    return fields;
  }

  /**
   * Helper: Normalize parsed output into consistent document schema
   */
  _normalizeExtractionResult(parsed, engineName) {
    const rawText = parsed.rawText || '';
    const classification = parsed.classification || {
      predictedType: 'evidence',
      confidence: 0.8,
      reasoning: 'Extracted via Gemini Vision',
      classifiedAt: new Date(),
    };

    const fields = Array.isArray(parsed.fields)
      ? parsed.fields.map((f) => ({
          field: f.field,
          value: f.value,
          confidence: typeof f.confidence === 'number' ? f.confidence : 0.85,
          sourceReference: f.sourceReference || 'Document Body',
        }))
      : [];

    let total = 0;
    fields.forEach((f) => (total += f.confidence));
    const avg = fields.length > 0 ? parseFloat((total / fields.length).toFixed(2)) : 0.85;

    return {
      rawText,
      classification: {
        predictedType: classification.predictedType || 'evidence',
        confidence: classification.confidence || 0.85,
        reasoning: classification.reasoning || '',
        classifiedAt: new Date(),
      },
      fields,
      ocrMetadata: {
        engine: engineName,
        processedAt: new Date(),
        averageConfidence: typeof parsed.averageConfidence === 'number' ? parsed.averageConfidence : avg,
        rawTextLength: rawText.length,
      },
    };
  }
}

module.exports = new AiOcrService();
