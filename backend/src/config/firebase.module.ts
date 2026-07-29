import { Module, Global, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as admin from 'firebase-admin';

@Global()
@Module({
  providers: [
    {
      provide: 'FIREBASE_ADMIN',
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const logger = new Logger('FirebaseModule');
        const projectId   = config.get<string>('firebase.projectId');
        const privateKey  = config.get<string>('firebase.privateKey');
        const clientEmail = config.get<string>('firebase.clientEmail');

        if (!projectId || !privateKey || !clientEmail) {
          logger.warn('Firebase credentials missing – running without Firebase Admin');
          return null;
        }

        if (!admin.apps.length) {
          admin.initializeApp({
            credential: admin.credential.cert({ projectId, privateKey, clientEmail }),
            storageBucket: config.get<string>('firebase.storageBucket'),
          });
          logger.log('✅ Firebase Admin initialised');
        }
        return admin;
      },
    },
  ],
  exports: ['FIREBASE_ADMIN'],
})
export class FirebaseModule {}
