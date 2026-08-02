import { Injectable, NotFoundException, Logger } from '@nestjs/common';

/**
 * TaxMitra Enterprise — Practice Management Service (Phase 3)
 * Developer: Abhishek Agrahari
 *
 * In-memory store (Phase 1). Phase 4: Prisma + PostgreSQL + WhatsApp Business API
 */

@Injectable()
export class PracticeService {
  private readonly logger = new Logger(PracticeService.name);

  private clients: any[] = [
    { id: 'c-demo-001', name: 'Ravi Kumar', pan: 'ABCDE1234F', email: 'ravi@example.com', mobile: '9876543210', address: 'Kanpur, UP', branchId: 'b-001', category: 'Individual', tags: ['Salaried', 'AY2026-27'], active: true, createdAt: new Date().toISOString() },
    { id: 'c-demo-002', name: 'Meera Enterprises', pan: 'PQRST5678Y', email: 'meera@biz.com', mobile: '9876543211', address: 'Lucknow, UP', branchId: 'b-001', category: 'Company', tags: ['GST', 'TDS'], active: true, createdAt: new Date().toISOString() },
  ];
  private staff: any[] = [
    { id: 's-001', name: 'Priya Sharma', role: 'CA_ASSOCIATE', email: 'priya@taxmitra.in', branchId: 'b-001', specialization: ['ITR', 'GST'], maxClients: 50, activeClients: 12, isActive: true },
    { id: 's-002', name: 'Amit Singh', role: 'TAX_ASSISTANT', email: 'amit@taxmitra.in', branchId: 'b-001', specialization: ['TDS', 'Payroll'], maxClients: 30, activeClients: 8, isActive: true },
  ];
  private tasks: any[] = [
    { id: 't-001', clientId: 'c-demo-001', type: 'ITR_FILING', title: 'File ITR-1 AY 2026-27', status: 'PENDING', priority: 'HIGH', dueDate: '2026-07-31', assignedTo: 's-001', createdAt: new Date().toISOString() },
    { id: 't-002', clientId: 'c-demo-002', type: 'GST_FILING', title: 'GSTR-3B July 2025', status: 'IN_PROGRESS', priority: 'CRITICAL', dueDate: '2025-07-20', assignedTo: 's-002', createdAt: new Date().toISOString() },
  ];
  private invoices: any[] = [
    { id: 'inv-001', clientId: 'c-demo-001', services: [{ description: 'ITR-1 Filing AY 2026-27', amount: 1500 }], subtotal: 1500, gst: 270, total: 1770, status: 'UNPAID', createdAt: new Date().toISOString() },
  ];
  private branches: any[] = [
    { id: 'b-001', name: 'TaxMitra Kanpur HQ', code: 'TM-KNP', whiteLabel: false, city: 'Kanpur', state: 'UP', admin: 'Abhishek Agrahari', clients: 45, staff: 5, revenue: 850000, licenseType: 'MAIN' },
    { id: 'b-002', name: 'TaxMitra Lucknow', code: 'TM-LKO', whiteLabel: true, city: 'Lucknow', state: 'UP', admin: 'Priya CA', clients: 30, staff: 3, revenue: 420000, licenseType: 'FRANCHISE' },
  ];
  private notificationLog: any[] = [];

  // ── Client CRM ───────────────────────────────────────────

  createClient(dto: any): any {
    const client = {
      id: `c-${Date.now()}`,
      ...dto,
      active: true,
      filingHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.clients.push(client);
    this.logger.log(`Client created: ${client.id} | ${client.name} | ${client.pan}`);
    return client;
  }

  listClients(query: any): any {
    let result = this.clients.filter(c => c.active);
    if (query.branchId) result = result.filter(c => c.branchId === query.branchId);
    if (query.category) result = result.filter(c => c.category === query.category);
    if (query.tag) result = result.filter(c => (c.tags || []).includes(query.tag));
    if (query.search) result = result.filter(c => c.name.toLowerCase().includes(query.search.toLowerCase()) || c.pan?.includes(query.search));
    return { total: result.length, clients: result };
  }

  getClient(id: string): any {
    const client = this.clients.find(c => c.id === id);
    if (!client) throw new NotFoundException(`Client ${id} not found`);
    return { ...client, tasks: this.tasks.filter(t => t.clientId === id), invoices: this.invoices.filter(i => i.clientId === id) };
  }

  updateClient(id: string, dto: any): any {
    const idx = this.clients.findIndex(c => c.id === id);
    if (idx === -1) throw new NotFoundException(`Client ${id} not found`);
    this.clients[idx] = { ...this.clients[idx], ...dto, id, updatedAt: new Date().toISOString() };
    return this.clients[idx];
  }

  deleteClient(id: string): any {
    const idx = this.clients.findIndex(c => c.id === id);
    if (idx === -1) throw new NotFoundException(`Client ${id} not found`);
    this.clients[idx].active = false;
    return { archived: true, id };
  }

  // ── Staff ────────────────────────────────────────────────

  addStaff(dto: any): any {
    const staff = { id: `s-${Date.now()}`, ...dto, activeClients: 0, isActive: true, joinedAt: new Date().toISOString() };
    this.staff.push(staff);
    return staff;
  }

  listStaff(branchId?: string): any {
    const result = branchId ? this.staff.filter(s => s.branchId === branchId) : this.staff;
    return { total: result.length, staff: result };
  }

  updateStaff(id: string, dto: any): any {
    const idx = this.staff.findIndex(s => s.id === id);
    if (idx === -1) throw new NotFoundException(`Staff ${id} not found`);
    this.staff[idx] = { ...this.staff[idx], ...dto, id };
    return this.staff[idx];
  }

  // ── Tasks ────────────────────────────────────────────────

  createTask(dto: any): any {
    const task = {
      id: `t-${Date.now()}`,
      ...dto,
      status: 'PENDING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.tasks.push(task);
    return task;
  }

  listTasks(query: any): any {
    let result = this.tasks;
    if (query.status) result = result.filter(t => t.status === query.status);
    if (query.priority) result = result.filter(t => t.priority === query.priority);
    if (query.assignedTo) result = result.filter(t => t.assignedTo === query.assignedTo);

    // Auto-mark overdue
    const now = new Date();
    result = result.map(t => ({
      ...t,
      status: t.status !== 'DONE' && new Date(t.dueDate) < now ? 'OVERDUE' : t.status,
      daysRemaining: Math.ceil((new Date(t.dueDate).getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
    }));

    return { total: result.length, overdue: result.filter(t => t.status === 'OVERDUE').length, tasks: result };
  }

  updateTask(id: string, dto: any): any {
    const idx = this.tasks.findIndex(t => t.id === id);
    if (idx === -1) throw new NotFoundException(`Task ${id} not found`);
    this.tasks[idx] = { ...this.tasks[idx], ...dto, id, updatedAt: new Date().toISOString() };
    return this.tasks[idx];
  }

  // ── Billing ──────────────────────────────────────────────

  createInvoice(dto: any): any {
    const subtotal = (dto.services || []).reduce((sum: number, s: any) => sum + (s.amount || 0), 0);
    const discount = dto.discount || 0;
    const gstRate = dto.gstRate || 18;
    const taxableAmount = subtotal - discount;
    const gstAmount = Math.round(taxableAmount * gstRate / 100);
    const total = taxableAmount + gstAmount;

    const invoice = {
      id: `INV-${Date.now()}`,
      invoiceNo: `TM-${new Date().getFullYear()}-${String(this.invoices.length + 1).padStart(4, '0')}`,
      ...dto,
      subtotal,
      discount,
      gstRate,
      gstAmount,
      total,
      status: 'UNPAID',
      createdAt: new Date().toISOString(),
      dueDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
    };
    this.invoices.push(invoice);
    return invoice;
  }

  listInvoices(query: any): any {
    let result = this.invoices;
    if (query.clientId) result = result.filter(i => i.clientId === query.clientId);
    if (query.status) result = result.filter(i => i.status === query.status);
    const totalRevenue = result.filter(i => i.status === 'PAID').reduce((s, i) => s + i.total, 0);
    const totalPending = result.filter(i => i.status === 'UNPAID').reduce((s, i) => s + i.total, 0);
    return { total: result.length, totalRevenue, totalPending, invoices: result };
  }

  recordPayment(id: string, dto: any): any {
    const idx = this.invoices.findIndex(i => i.id === id);
    if (idx === -1) throw new NotFoundException(`Invoice ${id} not found`);
    this.invoices[idx] = { ...this.invoices[idx], status: 'PAID', paidAt: new Date().toISOString(), paymentMethod: dto.method, transactionId: dto.transactionId };
    return this.invoices[idx];
  }

  // ── Franchise / Branch ───────────────────────────────────

  listBranches(): any {
    return { total: this.branches.length, branches: this.branches };
  }

  createBranch(dto: any): any {
    const branch = {
      id: `b-${Date.now()}`,
      ...dto,
      clients: 0,
      staff: 0,
      revenue: 0,
      createdAt: new Date().toISOString(),
    };
    this.branches.push(branch);
    return branch;
  }

  franchiseDashboard(): any {
    const totalClients = this.branches.reduce((s, b) => s + b.clients, 0);
    const totalRevenue = this.branches.reduce((s, b) => s + b.revenue, 0);
    const totalStaff = this.branches.reduce((s, b) => s + b.staff, 0);

    return {
      summary: {
        totalBranches: this.branches.length,
        franchiseBranches: this.branches.filter(b => b.licenseType === 'FRANCHISE').length,
        totalClients,
        totalStaff,
        totalRevenue,
        mrr: Math.round(totalRevenue / 12),
      },
      branches: this.branches.map(b => ({
        ...b,
        revenueShare: b.licenseType === 'FRANCHISE' ? Math.round(b.revenue * 0.3) : 0, // 30% franchise fee
        clientsPerStaff: b.staff > 0 ? Math.round(b.clients / b.staff) : 0,
      })),
      topPerformers: [...this.staff].sort((a, b) => b.activeClients - a.activeClients).slice(0, 5),
    };
  }

  // ── Notifications ────────────────────────────────────────

  sendNotification(dto: any): any {
    const log = {
      id: `notif-${Date.now()}`,
      ...dto,
      status: 'QUEUED',
      sentAt: dto.scheduledAt || new Date().toISOString(),
      deliveryStatus: 'PENDING',
      createdAt: new Date().toISOString(),
    };
    this.notificationLog.push(log);
    this.logger.log(`Notification queued: ${log.id} | Channel: ${dto.channel} | Client: ${dto.clientId}`);
    return { ...log, message: `Notification queued for ${dto.channel}. Phase 4: WhatsApp Business API / Twilio / SendGrid integration.` };
  }

  getNotificationLog(clientId?: string): any {
    const logs = clientId ? this.notificationLog.filter(n => n.clientId === clientId) : this.notificationLog;
    return { total: logs.length, logs };
  }
}
