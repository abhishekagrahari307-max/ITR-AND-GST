/**
 * TaxMitra Enterprise — OCR Service (Phase 2)
 * Developer: Abhishek Agrahari
 *
 * Handles: PAN / Aadhaar / Form 16 / 26AS / Bank Statement / GST Invoice
 * Technology: Tesseract.js (free, server-side) + Gemini Vision (cloud)
 * Phase 4: AWS Textract / Google Document AI for production scale
 */

export interface OCRResult {
  text: string;
  fields: Record<string, any>;
  confidence: number;
  docType: string;
  processingMs: number;
  source: 'tesseract' | 'gemini-vision' | 'mock';
}

// Field extraction patterns
const FIELD_PATTERNS: Record<string, Record<string, RegExp>> = {
  pan: {
    pan: /[A-Z]{5}[0-9]{4}[A-Z]/,
    name: /(?:Name|नाम)[:\s]+([A-Z\s]+)/i,
    dob: /(?:DOB|Date of Birth)[:\s]+(\d{2}\/\d{2}\/\d{4})/i,
    fatherName: /(?:Father|पिता)[:\s]+([A-Z\s]+)/i,
  },
  aadhaar: {
    aadhaarNumber: /\d{4}\s\d{4}\s\d{4}/,
    name: /([A-Z][a-z]+ [A-Z][a-z]+)/,
    dob: /(?:DOB|Year of Birth)[:\s]+(\d{4}|\d{2}\/\d{2}\/\d{4})/i,
    gender: /(?:Male|Female|MALE|FEMALE)/i,
  },
  form16: {
    employerName: /(?:Name of Employer|Employer)[:\s]+([^\n]+)/i,
    employeePAN: /[A-Z]{5}[0-9]{4}[A-Z]/,
    grossSalary: /(?:Gross Salary|Total Salary)[:\s]+[\d,]+/i,
    tdsDeducted: /(?:TDS|Tax Deducted)[:\s]+[\d,]+/i,
    fy: /(?:Financial Year|F\.Y\.)[:\s]+(\d{4}-\d{2})/i,
  },
  bank: {
    accountNumber: /(?:A\/C No|Account Number)[:\s]+(\d+)/i,
    ifsc: /[A-Z]{4}0[A-Z0-9]{6}/,
    bankName: /(?:Bank Name|Bank)[:\s]+([^\n]+)/i,
    balance: /(?:Balance|Closing Balance)[:\s]+[\d,]+\.?\d*/i,
  },
  invoice: {
    gstin: /[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z][Z][0-9A-Z]/,
    invoiceNo: /(?:Invoice No|Bill No)[:\s]+([A-Z0-9/-]+)/i,
    amount: /(?:Total|Grand Total|Amount)[:\s]+[\d,]+\.?\d*/i,
    gst: /(?:GST|Tax)[:\s]+[\d,]+\.?\d*/i,
    date: /\d{2}[/-]\d{2}[/-]\d{4}/,
  },
};

export class AIOcrService {
  async extractFromImage(
    filePath: string,
    docType: keyof typeof FIELD_PATTERNS = 'form16',
    base64Data?: string,
  ): Promise<OCRResult> {
    const start = Date.now();

    // Phase 1: Use Tesseract.js if file path provided, else mock
    if (process.env.SKIP_OCR === 'true' || (!filePath && !base64Data)) {
      return this.getMockResult(docType, start);
    }

    try {
      // Dynamic import of Tesseract (Phase 2)
      const { createWorker } = await import('tesseract.js');
      const worker = await createWorker('eng+hin');
      const { data } = await worker.recognize(base64Data ? `data:image/png;base64,${base64Data}` : filePath);
      await worker.terminate();

      const fields = this.parseFields(data.text, docType);

      return {
        text: data.text,
        fields,
        confidence: data.confidence / 100,
        docType,
        processingMs: Date.now() - start,
        source: 'tesseract',
      };
    } catch (e) {
      console.warn('Tesseract OCR failed, using mock:', e);
      return this.getMockResult(docType, start);
    }
  }

  parseFields(text: string, docType: string): Record<string, string> {
    const patterns = FIELD_PATTERNS[docType] || {};
    const extracted: Record<string, string> = {};

    for (const [field, pattern] of Object.entries(patterns)) {
      const match = text.match(pattern);
      if (match) {
        extracted[field] = match[1] || match[0];
      }
    }

    return extracted;
  }

  getMockResult(docType: string, start: number): OCRResult {
    const mockData: Record<string, any> = {
      pan: { pan: 'ABCDE1234F', name: 'RAVI KUMAR', dob: '15/01/1990', fatherName: 'SHYAM KUMAR' },
      aadhaar: { aadhaarNumber: '1234 5678 9012', name: 'Ravi Kumar', dob: '1990', gender: 'Male' },
      form16: { employerPAN: 'AABCE1234X', employeePAN: 'ABCDE1234F', grossSalary: '12,00,000', tdsDeducted: '30,000', fy: '2025-26' },
      bank: { accountNumber: '123456789012', ifsc: 'SBIN0001234', bankName: 'State Bank of India', balance: '5,80,000' },
      invoice: { gstin: '09ABCDE1234F1Z5', invoiceNo: 'INV-2025-001', amount: '59,000', gst: '9,000', date: '15/07/2025' },
    };

    return {
      text: `Mock OCR output for ${docType} document`,
      fields: mockData[docType] || {},
      confidence: 0.85,
      docType,
      processingMs: Date.now() - start,
      source: 'mock',
    };
  }
}
