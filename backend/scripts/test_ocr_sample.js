const fs = require('fs');
const path = require('path');
const aiOcrService = require('../src/services/aiOcr.service');
const config = require('../src/config/env');

async function testOcr() {
  console.log('--- Testing AI OCR Pipeline ---');
  console.log('Gemini API configured:', !!config.gemini.apiKey, 'Length:', config.gemini.apiKey?.length);

  const sampleFirText = `
CENTRAL CRIME BRANCH - POLICE DEPARTMENT
FIRST INFORMATION REPORT (Under Section 154 Cr.P.C.)
--------------------------------------------------
1. District: Bengaluru City | Police Station: Cyber Crime Police Station (CCPS)
2. FIR Number: FIR/2026/0492 | Date of FIR: 12-August-2026
3. Acts & Sections: Section 420, 468, 471 IPC & Section 66D IT Act 2008
4. Occurrence of Offence:
   Date: 10-August-2026, Time: 14:30 hrs
   Place of Occurrence: Sector 4, HSR Layout, Bengaluru
5. Complainant / Informant:
   Name: Rajesh Kumar Sharma
   Father's Name: Late Om Prakash Sharma
   Address: Flat 402, Green Glen Heights, Bellandur, Bengaluru - 560103
   Phone: +91-9845012345
6. Details of Known / Suspected Accused:
   Accused 1: Vikrant Vikramaditya Malhotra (Alias: Vicky)
   Accused 2: Unknown associate operating server IP 198.51.100.45
7. Brief Description of Incident:
   Complainant reported unauthorized access and fraudulent electronic transfer of funds amounting to INR 25,00,000 using forged identity documents and manipulated digital signatures.
--------------------------------------------------
Investigating Officer: Inspector Sandeep Patil, Badge: CCB-8910
`;

  const buffer = Buffer.from(sampleFirText, 'utf-8');

  console.log('Sending sample FIR text buffer to OCR service...');
  const result = await aiOcrService.processDocument({
    fileBuffer: buffer,
    mimeType: 'text/plain',
    fileName: 'FIR_2026_0492_Cyber_Fraud.txt',
    documentTypeHint: 'FIR',
  });

  console.log('\n--- OCR Processing Result ---');
  console.log('Engine used:', result.ocrMetadata?.engine);
  console.log('Classification:', JSON.stringify(result.classification, null, 2));
  console.log('Average Confidence:', result.ocrMetadata?.averageConfidence);
  console.log('Needs Human Review:', result.ocrMetadata?.needsHumanReview);
  console.log('Review Priority:', result.ocrMetadata?.reviewPriority);
  console.log('\nExtracted Fields (' + result.fields?.length + '):');
  result.fields.forEach(f => {
    console.log(`  - [${f.field}]: ${JSON.stringify(f.value)} (Confidence: ${f.confidence}, Ref: ${f.sourceReference})`);
  });

  return result;
}

testOcr()
  .then(() => {
    console.log('\nOCR Test PASSED successfully!');
    process.exit(0);
  })
  .catch(err => {
    console.error('\nOCR Test FAILED:', err);
    process.exit(1);
  });
