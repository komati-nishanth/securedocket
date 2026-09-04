const fs = require('fs');
const path = require('path');
const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');

async function createPdfFromText(txtFileName, pdfFileName, title) {
  const txtPath = path.resolve(__dirname, '../../sample_test_documents', txtFileName);
  const pdfPath = path.resolve(__dirname, '../../sample_test_documents', pdfFileName);

  const textContent = fs.readFileSync(txtPath, 'utf8');

  const pdfDoc = await PDFDocument.create();
  let page = pdfDoc.addPage([595.28, 841.89]); // A4 size
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const { width, height } = page.getSize();
  let y = height - 50;

  // Header banner
  page.drawRectangle({
    x: 40,
    y: y - 10,
    width: width - 80,
    height: 35,
    color: rgb(0.08, 0.15, 0.25),
  });

  page.drawText(title.toUpperCase(), {
    x: 50,
    y: y + 5,
    size: 13,
    font: fontBold,
    color: rgb(0.95, 0.95, 1.0),
  });

  y -= 45;

  const lines = textContent.split('\n');
  for (const line of lines) {
    if (y < 50) {
      page = pdfDoc.addPage([595.28, 841.89]);
      y = height - 50;
    }

    const isHeader = line.startsWith('---') || line.includes('POLICE DEPARTMENT') || line.startsWith('1.') || line.startsWith('2.') || line.startsWith('3.') || line.startsWith('4.') || line.startsWith('5.') || line.startsWith('6.') || line.startsWith('7.') || line.startsWith('8.') || line.startsWith('Forensic') || line.startsWith('Case');
    
    // Draw text with word wrapping if line is long
    const words = line.split(' ');
    let currentLine = '';
    const maxChars = 75;

    for (let i = 0; i < words.length; i++) {
      const testLine = currentLine ? `${currentLine} ${words[i]}` : words[i];
      if (testLine.length > maxChars) {
        page.drawText(currentLine, {
          x: 45,
          y,
          size: 9.5,
          font: isHeader ? fontBold : fontRegular,
          color: rgb(0.15, 0.15, 0.15),
        });
        y -= 14;
        if (y < 50) {
          page = pdfDoc.addPage([595.28, 841.89]);
          y = height - 50;
        }
        currentLine = words[i];
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      page.drawText(currentLine, {
        x: 45,
        y,
        size: 9.5,
        font: isHeader ? fontBold : fontRegular,
        color: isHeader ? rgb(0.05, 0.2, 0.4) : rgb(0.2, 0.2, 0.2),
      });
      y -= 14;
    }
  }

  const pdfBytes = await pdfDoc.save();
  fs.writeFileSync(pdfPath, pdfBytes);
  console.log(`Generated PDF: ${pdfPath} (${pdfBytes.length} bytes)`);
}

async function generateAll() {
  await createPdfFromText('Sample_FIR_Bank_Fraud.txt', 'Sample_FIR_Bank_Fraud.pdf', 'First Information Report (Sec 154 CrPC)');
  await createPdfFromText('Sample_Witness_Statement.txt', 'Sample_Witness_Statement.pdf', 'Witness Statement (Sec 161 CrPC)');
  await createPdfFromText('Sample_Forensic_Lab_Report.txt', 'Sample_Forensic_Lab_Report.pdf', 'CFSL Digital Forensic Examination Report');
  console.log('All sample PDFs successfully generated!');
}

generateAll().catch(err => {
  console.error('Failed to generate PDFs:', err);
  process.exit(1);
});
