import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBody, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { PracticeService } from './practice.service';

/**
 * TaxMitra Enterprise — CA Practice Management Controller (Phase 3)
 * Developer: Abhishek Agrahari
 *
 * Covers:
 *   - Client CRM (Add/List/Update/Tag clients by PAN/Branch/WhiteLabel)
 *   - Staff Management (CA Associates, roles, branch assignment)
 *   - Task Management (Filing tasks, deadlines, priority, status)
 *   - Billing / Invoices / Payments
 *   - Document Vault (search, expiry tracking)
 *   - Branch / Franchise Management (White Label = true/false)
 *   - Calendar + Appointments + Notification logs
 */

@ApiTags('Practice — Client CRM + Staff + Tasks')
@Controller('practice')
export class PracticeController {
  constructor(private readonly svc: PracticeService) {}

  // ── CLIENT CRM ────────────────────────────────────────────

  @Post('clients')
  @ApiOperation({ summary: 'Add CA Client to CRM' })
  @ApiBody({
    schema: {
      example: {
        name: 'Ravi Kumar', pan: 'ABCDE1234F', email: 'ravi@example.com',
        mobile: '9876543210', address: 'Kanpur, UP', branchId: 'b-001',
        category: 'Individual', tags: ['Salaried', 'AY2026-27'],
      },
    },
  })
  createClient(@Body() dto: any) { return this.svc.createClient(dto); }

  @Get('clients')
  @ApiOperation({ summary: 'List all CRM clients (filter by branch/tag/category)' })
  @ApiQuery({ name: 'branchId', required: false })
  @ApiQuery({ name: 'category', required: false, enum: ['Individual', 'HUF', 'Company', 'LLP', 'Trust'] })
  @ApiQuery({ name: 'tag', required: false })
  listClients(@Query() q: any) { return this.svc.listClients(q); }

  @Get('clients/:id')
  @ApiOperation({ summary: 'Get client detail with filing history' })
  getClient(@Param('id') id: string) { return this.svc.getClient(id); }

  @Patch('clients/:id')
  @ApiOperation({ summary: 'Update client details / tags' })
  updateClient(@Param('id') id: string, @Body() dto: any) { return this.svc.updateClient(id, dto); }

  @Delete('clients/:id')
  @ApiOperation({ summary: 'Archive/delete client' })
  deleteClient(@Param('id') id: string) { return this.svc.deleteClient(id); }

  // ── STAFF MANAGEMENT ─────────────────────────────────────

  @Post('staff')
  @ApiOperation({ summary: 'Add staff member / CA associate' })
  @ApiBody({
    schema: {
      example: {
        name: 'Priya Sharma', role: 'CA_ASSOCIATE', email: 'priya@taxmitra.in',
        branchId: 'b-001', specialization: ['ITR', 'GST'], maxClients: 50,
      },
    },
  })
  addStaff(@Body() dto: any) { return this.svc.addStaff(dto); }

  @Get('staff')
  @ApiOperation({ summary: 'List all staff members' })
  listStaff(@Query('branchId') branchId?: string) { return this.svc.listStaff(branchId); }

  @Patch('staff/:id')
  @ApiOperation({ summary: 'Update staff details / role / branch assignment' })
  updateStaff(@Param('id') id: string, @Body() dto: any) { return this.svc.updateStaff(id, dto); }

  // ── TASKS ────────────────────────────────────────────────

  @Post('tasks')
  @ApiOperation({ summary: 'Create filing task with deadline' })
  @ApiBody({
    schema: {
      example: {
        clientId: 'c-001', type: 'ITR_FILING', title: 'File ITR-1 AY 2026-27',
        dueDate: '2026-07-31', priority: 'HIGH', assignedTo: 's-001',
        description: 'Collect Form 16 and file ITR-1 before due date',
      },
    },
  })
  createTask(@Body() dto: any) { return this.svc.createTask(dto); }

  @Get('tasks')
  @ApiOperation({ summary: 'List tasks (filter by status/priority/assignee)' })
  @ApiQuery({ name: 'status', required: false, enum: ['PENDING', 'IN_PROGRESS', 'DONE', 'OVERDUE'] })
  @ApiQuery({ name: 'priority', required: false, enum: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] })
  @ApiQuery({ name: 'assignedTo', required: false })
  listTasks(@Query() q: any) { return this.svc.listTasks(q); }

  @Patch('tasks/:id')
  @ApiOperation({ summary: 'Update task status / notes' })
  updateTask(@Param('id') id: string, @Body() dto: any) { return this.svc.updateTask(id, dto); }

  // ── BILLING ──────────────────────────────────────────────

  @Post('billing')
  @ApiOperation({ summary: 'Generate invoice for client' })
  @ApiBody({
    schema: {
      example: {
        clientId: 'c-001', services: [{ description: 'ITR-1 Filing', amount: 1500 }, { description: 'GSTR-3B x 3 months', amount: 2000 }],
        discount: 0, gstRate: 18, notes: 'FY 2025-26 compliance fee',
      },
    },
  })
  createInvoice(@Body() dto: any) { return this.svc.createInvoice(dto); }

  @Get('billing')
  @ApiOperation({ summary: 'List invoices (filter by client/status/month)' })
  listInvoices(@Query() q: any) { return this.svc.listInvoices(q); }

  @Patch('billing/:id/payment')
  @ApiOperation({ summary: 'Record payment against invoice' })
  recordPayment(@Param('id') id: string, @Body() dto: any) { return this.svc.recordPayment(id, dto); }

  // ── FRANCHISE / BRANCH ───────────────────────────────────

  @Get('franchise/branches')
  @ApiOperation({ summary: 'List all branches / franchise units' })
  listBranches() { return this.svc.listBranches(); }

  @Post('franchise/branches')
  @ApiOperation({ summary: 'Create new branch / white-label unit' })
  @ApiBody({
    schema: {
      example: {
        name: 'TaxMitra Lucknow', code: 'TM-LKO', adminEmail: 'admin-lko@taxmitra.in',
        whiteLabel: true, city: 'Lucknow', state: 'UP', licenseType: 'FRANCHISE',
      },
    },
  })
  createBranch(@Body() dto: any) { return this.svc.createBranch(dto); }

  @Get('franchise/dashboard')
  @ApiOperation({ summary: 'Franchise owner dashboard — revenue, clients, tasks across all branches' })
  franchiseDashboard() { return this.svc.franchiseDashboard(); }

  // ── NOTIFICATIONS ────────────────────────────────────────

  @Post('notifications/send')
  @ApiOperation({ summary: 'Send notification via Email/SMS/WhatsApp' })
  @ApiBody({
    schema: {
      example: {
        clientId: 'c-001', channel: 'WHATSAPP', message: 'ITR filing deadline is July 31. Please share Form 16.',
        templateId: 'ITR_REMINDER', scheduledAt: '2026-07-25T09:00:00Z',
      },
    },
  })
  sendNotification(@Body() dto: any) { return this.svc.sendNotification(dto); }

  @Get('notifications/log')
  @ApiOperation({ summary: 'Notification delivery log' })
  notificationLog(@Query('clientId') clientId?: string) { return this.svc.getNotificationLog(clientId); }
}
