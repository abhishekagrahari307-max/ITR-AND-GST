import {
  Controller, Post, Get, Delete, Body, Req, Param,
  UseGuards, UseInterceptors, UploadedFile, Query,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiConsumes } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { DocumentsService } from './documents.service';

@ApiTags('Documents')
@Controller('documents')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class DocumentsController {
  constructor(private readonly svc: DocumentsService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload document with AI OCR processing (Form 16, 26AS, AIS, PAN, etc.)' })
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file'))
  async upload(
    @Req() req: any,
    @UploadedFile() file: Express.Multer.File,
    @Body('documentType') documentType: string,
  ) {
    return this.svc.uploadDocument(req.user.id, file, documentType || 'OTHER');
  }

  @Get()
  @ApiOperation({ summary: 'Get all documents for user' })
  getAll(@Req() req: any) { return this.svc.getUserDocuments(req.user.id); }

  @Get(':id')
  getById(@Req() req: any, @Param('id') id: string) { return this.svc.getDocumentById(req.user.id, id); }

  @Delete(':id')
  delete(@Req() req: any, @Param('id') id: string) { return this.svc.deleteDocument(req.user.id, id); }
}
