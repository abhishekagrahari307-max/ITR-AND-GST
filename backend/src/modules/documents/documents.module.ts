import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { ConfigService } from '@nestjs/config';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { AiModule } from '../ai/ai.module';
import { v4 as uuidv4 } from 'uuid';

@Module({
  imports: [
    AiModule,
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        storage: diskStorage({
          destination: config.get('storage.localPath', './uploads'),
          filename: (req, file, cb) => {
            const uniqueName = `${uuidv4()}${extname(file.originalname)}`;
            cb(null, uniqueName);
          },
        }),
        limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
        fileFilter: (req, file, cb) => {
          const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg'];
          cb(null, allowed.includes(file.mimetype));
        },
      }),
    }),
  ],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
