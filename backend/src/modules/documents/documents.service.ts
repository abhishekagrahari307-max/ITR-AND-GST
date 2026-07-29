import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../database/prisma.service';
import { AiService } from '../ai/ai.service';
import * as Tesseract from 'tesseract.js';
import * as pdfParse from 'pdf-parse';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class DocumentsService {
  private readonly logger = new Logger(DocumentsService.name);
  private readonly uploadPath: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly aiService: AiService,
  ) {
    this.uploadPath = config.get('storage.localPath', './uploads');
    if (!fs.existsSync(this.uploadPath)) fs.mkdirSync(this.uploadPath, { recursive: true });
  }

  // ─── Upload & Process ────────────────────────────────────────────────────
  async uploadDocument(userId: string, file: Express.Multer.File, documentType: string) {
    // Save file record in DB
    const doc = await this.prisma.document.create({
      data: {
        userId,
        fileName: file.filename,
        originalName: file.originalname,
        documentType: documentType as any,
        mimeType: file.mimetype,
        fileSize: file.size,
        filePath: file.path,
        isEncrypted: false, // Enable in production
      },
    });

    // Async OCR processing
    this.processOCR(doc.id, file).catch(err =>
      this.logger.error(`OCR failed for doc ${doc.id}:`, err.message),
    );

    return { document: doc, message: 'Document uploaded. AI processing started.' };
  }

  // ─── OCR Processing ──────────────────────────────────────────────────────
  private async processOCR(docId: string, file: Express.Multer.File) {
    const doc = await this.prisma.document.findUnique({ where: { id: docId } });
    if (!doc) return;

    let extractedText = '';

    try {
      if (file.mimetype === 'application/pdf') {
        const buffer = fs.readFileSync(file.path);
        const pdfData = await pdfParse(buffer);
        extractedText = pdfData.text;
      } else if (file.mimetype.startsWith('image/')) {
        const { data } = await Tesseract.recognize(file.path, 'eng+hin', {
          logger: m => this.logger.verbose(`OCR: ${m.status}`),
        });
        extractedText = data.text;
      }

      // AI Analysis of extracted text
      const aiAnalysis = await this.aiService.analyzeDocument(
        doc.userId, doc.documentType, extractedText,
      );

      // Extract structured data based on document type
      const ocrData = this.parseDocumentData(doc.documentType, extractedText);
      const missingData = this.detectMissingData(doc.documentType, ocrData);

      await this.prisma.document.update({
        where: { id: docId },
        data: {
          ocrProcessed: true,
          ocrData,
          aiSummary: aiAnalysis.analysis,
          missingData,
          confidenceScore: 0.85,
          processedAt: new Date(),
        },
      });

      this.logger.log(`OCR completed for document ${docId}`);
    } catch (err) {
      this.logger.error(`OCR processing error: ${err.message}`);
      await this.prisma.document.update({
        where: { id: docId },
        data: { ocrProcessed: false },
      });
    }
  }

  // ─── Parse Document Data ─────────────────────────────────────────────────
  private parseDocumentData(type: string, text: string): Record<string, any> {
    const data: Record<string, any> = { rawText: text.substring(0, 500) };

    // Form 16 parsing
    if (type === 'FORM_16') {
      const salaryMatch  = text.match(/gross\s+salary[:\s₹]+([\d,]+)/i);
      const tdsMatch     = text.match(/tax\s+deducted[:\s₹]+([\d,]+)/i);
      const panMatch     = text.match(/[A-Z]{5}[0-9]{4}[A-Z]/);
      if (salaryMatch)  data.grossSalary  = parseInt(salaryMatch[1].replace(/,/g, ''));
      if (tdsMatch)     data.tdsDeducted  = parseInt(tdsMatch[1].replace(/,/g, ''));
      if (panMatch)     data.pan          = panMatch[0];
    }

    // Form 26AS / AIS parsing
    if (['FORM_26AS', 'AIS'].includes(type)) {
      const tdsMatch = text.match(/total\s+tax\s+deducted[:\s₹]+([\d,]+)/i);
      if (tdsMatch) data.totalTDS = parseInt(tdsMatch[1].replace(/,/g, ''));
    }

    // Bank statement
    if (type === 'BANK_STATEMENT') {
      const closingMatch = text.match(/closing\s+balance[:\s₹]+([\d,]+)/i);
      if (closingMatch) data.closingBalance = parseInt(closingMatch[1].replace(/,/g, ''));
    }

    return data;
  }

  // ─── Missing Data Detection ──────────────────────────────────────────────
  private detectMissingData(type: string, data: Record<string, any>): string[] {
    const missing: string[] = [];
    if (type === 'FORM_16') {
      if (!data.grossSalary) missing.push('Gross Salary not found');
      if (!data.tdsDeducted) missing.push('TDS deducted amount not found');
      if (!data.pan) missing.push('PAN not detected');
    }
    return missing;
  }

  // ─── Get User Documents ──────────────────────────────────────────────────
  async getUserDocuments(userId: string) {
    return this.prisma.document.findMany({
      where: { userId },
      orderBy: { uploadedAt: 'desc' },
      select: {
        id: true, originalName: true, documentType: true,
        fileSize: true, ocrProcessed: true, aiSummary: true,
        missingData: true, uploadedAt: true, processedAt: true,
      },
    });
  }

  async getDocumentById(userId: string, id: string) {
    return this.prisma.document.findFirst({ where: { id, userId } });
  }

  async deleteDocument(userId: string, id: string) {
    const doc = await this.prisma.document.findFirst({ where: { id, userId } });
    if (doc && fs.existsSync(doc.filePath)) fs.unlinkSync(doc.filePath);
    await this.prisma.document.deleteMany({ where: { id, userId } });
    return { message: 'Document deleted' };
  }
}
