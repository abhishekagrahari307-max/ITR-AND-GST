import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../database/prisma.service';
import { Logger } from '@nestjs/common';
import * as dayjs from 'dayjs';

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  // ─── Master Compliance Calendar (FY 2025-26) ───────────────────────────
  private readonly MASTER_DATES = [
    { title: 'GSTR-3B Filing (June)', category: 'GST',  dueDate: '2025-07-20', recurring: true },
    { title: 'GSTR-1 Filing (June)',  category: 'GST',  dueDate: '2025-07-11', recurring: true },
    { title: 'ITR Filing (Non-Audit)', category: 'IT',  dueDate: '2025-07-31' },
    { title: 'Form 24Q/26Q (Q1)',     category: 'TDS',  dueDate: '2025-07-31' },
    { title: 'TDS Payment (July)',    category: 'TDS',  dueDate: '2025-08-07' },
    { title: 'GSTR-3B (July)',        category: 'GST',  dueDate: '2025-08-20' },
    { title: 'GSTR-1 (July)',         category: 'GST',  dueDate: '2025-08-11' },
    { title: 'Advance Tax Q2 (45%)', category: 'IT',   dueDate: '2025-09-15' },
    { title: 'Form 24Q/26Q (Q2)',    category: 'TDS',  dueDate: '2025-10-31' },
    { title: 'ITR Audit Cases',      category: 'IT',   dueDate: '2025-10-31' },
    { title: 'Advance Tax Q3 (75%)',  category: 'IT',   dueDate: '2025-12-15' },
    { title: 'GSTR-9 Annual Return', category: 'GST',  dueDate: '2025-12-31' },
    { title: 'Advance Tax Q4 (100%)',category: 'IT',   dueDate: '2026-03-15' },
    { title: 'Form 24Q/26Q (Q4)',    category: 'TDS',  dueDate: '2026-05-31' },
  ];

  constructor(private readonly prisma: PrismaService) {}

  getMasterDates(category?: string) {
    const today = dayjs();
    return this.MASTER_DATES
      .filter(d => !category || d.category === category)
      .map(d => ({
        ...d,
        daysLeft: dayjs(d.dueDate).diff(today, 'day'),
        urgency:  dayjs(d.dueDate).diff(today, 'day') <= 3  ? 'URGENT'
                : dayjs(d.dueDate).diff(today, 'day') <= 15 ? 'WARNING'
                : 'SAFE',
        isPast: dayjs(d.dueDate).isBefore(today),
      }))
      .sort((a, b) => a.daysLeft - b.daysLeft);
  }

  async getUserTasks(userId: string) {
    return this.prisma.complianceTask.findMany({
      where: { userId },
      orderBy: { dueDate: 'asc' },
    });
  }

  async createTask(userId: string, data: any) {
    return this.prisma.complianceTask.create({
      data: { userId, ...data },
    });
  }

  async markComplete(userId: string, taskId: string) {
    return this.prisma.complianceTask.update({
      where: { id: taskId },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }

  async setReminders(userId: string, email: string, phone: string, daysBefore: number) {
    // Update user notification preferences
    await this.prisma.user.update({
      where: { id: userId },
      data: { emailAlerts: true, smsAlerts: true },
    });
    return { message: `Reminders set! You'll be notified ${daysBefore} days before each deadline.` };
  }

  // ─── Calculate Penalty ───────────────────────────────────────────────────
  calculatePenalty(type: string, taxAmount: number, daysDelayed: number) {
    let penalty = 0; let interest = 0; let description = '';
    switch (type) {
      case 'ITR_LATE':
        penalty = taxAmount > 0 ? Math.min(daysDelayed * 200 + taxAmount * 0.01, 10000) : Math.min(daysDelayed <= 31 ? 1000 : 5000, 10000);
        description = 'Late filing fee u/s 234F + 1% interest u/s 234A per month';
        break;
      case 'GSTR3B_LATE':
        penalty = Math.min(50 * daysDelayed, 5000);
        interest = Math.round(taxAmount * 0.18 * daysDelayed / 365);
        description = '₹50/day late fee + 18% p.a. interest';
        break;
      case 'TDS_PAYMENT_LATE':
        interest = Math.round(taxAmount * 0.015 * Math.ceil(daysDelayed / 30));
        description = '1.5% per month u/s 201(1A)';
        break;
      case 'TDS_RETURN_LATE':
        penalty = Math.min(200 * daysDelayed, 100000);
        description = '₹200/day max ₹1L u/s 234E';
        break;
    }
    return { penalty, interest, total: penalty + interest, description };
  }

  // ─── Daily Reminder Cron ─────────────────────────────────────────────────
  @Cron(CronExpression.EVERY_DAY_AT_9AM)
  async sendDailyReminders() {
    this.logger.log('Running daily compliance reminder check...');
    const today = dayjs();
    const upcomingTasks = await this.prisma.complianceTask.findMany({
      where: {
        status: 'PENDING',
        dueDate: {
          gte: today.toDate(),
          lte: today.add(7, 'day').toDate(),
        },
      },
      include: { user: { select: { id: true, email: true, firstName: true, emailAlerts: true } } },
    });

    for (const task of upcomingTasks) {
      if (task.user.emailAlerts) {
        this.logger.log(`Reminder: ${task.user.email} – ${task.title} due ${task.dueDate}`);
        // Email sending would go here
        await this.prisma.notification.create({
          data: {
            userId: task.userId,
            type: 'DEADLINE_REMINDER',
            title: `Due Date Reminder: ${task.title}`,
            message: `${task.title} ki due date ${dayjs(task.dueDate).format('DD MMM YYYY')} hai. Time left: ${dayjs(task.dueDate).diff(today, 'day')} days`,
          },
        });
      }
    }
  }
}
