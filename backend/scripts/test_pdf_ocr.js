const fs = require('fs');
const path = require('path');
const aiOcrService = require('../src/services/aiOcr.service');

async function testPdfOcr() {
  const pdfPath = path.resolve(__dirname, '../../sample_test_documents/Sample_FIR_Bank_Fraud.pdf');
  const buffer = fs.readFileSync(pdfPath);

  console.log(`Processing PDF (${buffer.length} bytes) with Gemini AI OCR...`);
  const result = await aiOcrService.processDocument({
    fileBuffer: buffer,
    mimeType: 'application/pdf',
    fileName: 'Sample_FIR_Bank_Fraud.pdf',
    documentTypeHint: 'FIR',
  });

  console.log('\n--- PDF OCR Result ---');
  console.log('Engine:', result.ocrMetadata?.engine);
  console.log('Classified Type:', result.classification?.predictedType);
  console.log('Classification Confidence:', result.classification?.confidence);
  console.log('Classification Reasoning:', result.classification?.reasoning);
  console.log('Average Field Confidence:', result.ocrMetadata?.averageConfidence);
  console.log('\nExtracted Structured Fields:');
  result.fields.forEach(f => {
    console.log(`  - [${f.field}]: ${JSON.stringify(f.value)} (Confidence: ${f.confidence})`);
  });
}

testPdfOcr().catch(err => {
  console.error('PDF OCR Error:', err);
  process.exit(1);
});
