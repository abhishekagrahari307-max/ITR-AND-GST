import {
  Injectable, CanActivate, ExecutionContext,
  UnauthorizedException, Inject, Logger,
} from '@nestjs/common';
import { PrismaService } from '../../../database/prisma.service';

@Injectable()
export class FirebaseAuthGuard implements CanActivate {
  private readonly logger = new Logger(FirebaseAuthGuard.name);

  constructor(
    @Inject('FIREBASE_ADMIN') private readonly firebase: any,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith('Bearer ')) {
      throw new UnauthorizedException('No token provided');
    }

    const token = authHeader.split('Bearer ')[1];

    try {
      const decoded = await this.firebase.auth().verifyIdToken(token);
      const user = await this.prisma.user.findFirst({
        where: { firebaseUid: decoded.uid },
      });
      if (!user) throw new UnauthorizedException('User not found');
      request.user = user;
      return true;
    } catch (err) {
      this.logger.error('Firebase token verification failed', err.message);
      throw new UnauthorizedException('Invalid Firebase token');
    }
  }
}
