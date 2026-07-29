import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { profile: true },
      omit: { password: true, twoFactorSecret: true },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async updateProfile(userId: string, data: any) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        firstName: data.firstName,
        lastName: data.lastName,
        phone: data.phone,
        pan: data.pan,
        defaultRegime: data.defaultRegime,
        language: data.language,
        profile: {
          upsert: {
            create: data.profile || {},
            update: data.profile || {},
          },
        },
      },
    });
  }

  async getNotifications(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  async markNotificationRead(userId: string, notifId: string) {
    return this.prisma.notification.update({
      where: { id: notifId },
      data: { isRead: true, readAt: new Date() },
    });
  }

  async getDashboardSummary(userId: string) {
    const [calculations, itrFilings, gstReturns, docs, notifications] = await Promise.all([
      this.prisma.taxCalculation.count({ where: { userId } }),
      this.prisma.iTRFiling.count({ where: { userId } }),
      this.prisma.gSTReturn.count({ where: { userId } }),
      this.prisma.document.count({ where: { userId } }),
      this.prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    const latestCalc = await this.prisma.taxCalculation.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return {
      stats: { calculations, itrFilings, gstReturns, documents: docs, unreadNotifications: notifications },
      latestTaxCalc: latestCalc ? {
        taxLiability: latestCalc.totalTaxLiability,
        refund: latestCalc.refundAmount,
        regime: latestCalc.regime,
        aiRecommendation: latestCalc.aiRegimeRecommendation,
        aiSaving: latestCalc.aiSavingAmount,
      } : null,
    };
  }
}
