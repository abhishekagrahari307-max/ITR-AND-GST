import {
  Injectable, UnauthorizedException, ConflictException,
  BadRequestException, Logger, Inject,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { PrismaService } from '../../database/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { FirebaseLoginDto } from './dto/firebase-login.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
    @Inject('FIREBASE_ADMIN') private readonly firebaseAdmin: any,
  ) {}

  // ─── Email/Password Register ─────────────────────────────────────────────
  async register(dto: RegisterDto) {
    // Check existing user
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { phone: dto.phone }] },
    });
    if (existing) throw new ConflictException('Email or phone already registered');

    const hashedPassword = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        phone: dto.phone,
        password: hashedPassword,
        firstName: dto.firstName,
        lastName: dto.lastName,
        pan: dto.pan,
        role: 'USER',
        profile: { create: {} },
      },
      select: {
        id: true, email: true, firstName: true, lastName: true,
        role: true, createdAt: true,
      },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    this.logger.log(`New user registered: ${user.email}`);

    return { user, ...tokens, message: 'Registration successful!' };
  }

  // ─── Email/Password Login ────────────────────────────────────────────────
  async login(dto: LoginDto, ip?: string) {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [
          { email: dto.identifier },
          { phone: dto.identifier },
          { pan: dto.identifier.toUpperCase() },
        ],
      },
    });
    if (!user || !user.password) throw new UnauthorizedException('Invalid credentials');

    const isPasswordValid = await bcrypt.compare(dto.password, user.password);
    if (!isPasswordValid) throw new UnauthorizedException('Invalid credentials');

    // Update last login
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), lastLoginIp: ip },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        userId: user.id,
        action: 'LOGIN',
        resource: 'users',
        resourceId: user.id,
        ipAddress: ip,
      },
    });

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    const { password: _, ...safeUser } = user;
    return { user: safeUser, ...tokens };
  }

  // ─── Firebase Auth (Google/Aadhaar OTP) ─────────────────────────────────
  async firebaseLogin(dto: FirebaseLoginDto, ip?: string) {
    if (!this.firebaseAdmin) throw new BadRequestException('Firebase not configured');

    // Verify Firebase ID token
    let decodedToken: any;
    try {
      decodedToken = await this.firebaseAdmin.auth().verifyIdToken(dto.idToken);
    } catch {
      throw new UnauthorizedException('Invalid Firebase token');
    }

    const { uid, email, name, picture, phone_number } = decodedToken;

    // Find or create user
    let user = await this.prisma.user.findFirst({
      where: { OR: [{ firebaseUid: uid }, { email }] },
    });

    if (!user) {
      const nameParts = (name || 'User').split(' ');
      user = await this.prisma.user.create({
        data: {
          email: email || `${uid}@firebase.user`,
          phone: phone_number,
          firebaseUid: uid,
          firstName: nameParts[0] || 'User',
          lastName: nameParts.slice(1).join(' ') || '',
          isEmailVerified: true,
          profile: { create: {} },
        },
      });
      this.logger.log(`Firebase user created: ${email}`);
    } else if (!user.firebaseUid) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { firebaseUid: uid, lastLoginAt: new Date(), lastLoginIp: ip },
      });
    }

    const tokens = await this.generateTokens(user.id, user.email, user.role);
    const { password: _, ...safeUser } = user;
    return { user: safeUser, ...tokens, isNewUser: !user.createdAt };
  }

  // ─── Token Utilities ─────────────────────────────────────────────────────
  async generateTokens(userId: string, email: string, role: string) {
    const payload = { sub: userId, email, role };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('jwt.secret'),
        expiresIn: this.configService.get('jwt.expiresIn', '7d'),
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('jwt.refreshSecret'),
        expiresIn: this.configService.get('jwt.refreshExpiresIn', '30d'),
      }),
    ]);

    // Store session
    await this.prisma.session.create({
      data: {
        userId,
        token: accessToken,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      },
    });

    return { accessToken, refreshToken, tokenType: 'Bearer', expiresIn: '7d' };
  }

  async refreshToken(refreshToken: string) {
    try {
      const payload = await this.jwtService.verifyAsync(refreshToken, {
        secret: this.configService.get('jwt.refreshSecret'),
      });
      return this.generateTokens(payload.sub, payload.email, payload.role);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async logout(userId: string, token: string) {
    await this.prisma.session.deleteMany({
      where: { userId, token },
    });
    return { message: 'Logged out successfully' };
  }

  async getMe(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: { profile: true },
      omit: { password: true, twoFactorSecret: true },
    });
  }
}
