/**
 * TaxMitra Enterprise — Database Seed
 * Developer: Abhishek Agrahari | Kanpur, UP
 * Creates demo data: Admin, Branch, Clients, TaxFiles, GST, Validation, Audit
 */

import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  console.log('🌱 TaxMitra Phase 1 — Seeding demo data...\n');

  // ── 1. Super Admin (CA Lead) ───────────────────────────────
  const admin = await prisma.user.upsert({
    where: { email: 'ca@taxmitra.in' },
    update: {},
    create: {
      email: 'ca@taxmitra.in',
      mobile: '9876543210',
      name: 'Abhishek Agrahari',
      pan: 'ABCDE1234F',
      role: 'SUPER_ADMIN',
      emailVerified: true,
      mobileVerified: true,
      twoFactorEnabled: true,
      isActive: true,
      city: 'Kanpur',
      state: 'Uttar Pradesh',
    },
  });
  console.log('✅ Admin created:', admin.email);

  // ── 2. Branch (Kanpur HQ) ─────────────────────────────────
  const branch = await prisma.branch.upsert({
    where: { code: 'TM-KNP' },
    update: {},
    create: {
      name: 'TaxMitra Kanpur HQ',
      code: 'TM-KNP',
      whiteLabel: false,
      licenseType: 'MAIN',
      adminEmail: 'ca@taxmitra.in',
      adminPhone: '9876543210',
      city: 'Kanpur',
      state: 'UP',
      address: 'Civil Lines, Kanpur - 208001',
      revenueShare: 0,
    },
  });
  console.log('✅ Branch created:', branch.name);

  // Update admin with branch
  await prisma.user.update({ where: { id: admin.id }, data: { branchId: branch.id } });

  // ── 3. Franchise Branch (Lucknow) ────────────────────────
  const franchiseBranch = await prisma.branch.upsert({
    where: { code: 'TM-LKO' },
    update: {},
    create: {
      name: 'TaxMitra Lucknow (Franchise)',
      code: 'TM-LKO',
      whiteLabel: true,
      licenseType: 'FRANCHISE',
      adminEmail: 'lko@taxmitra.in',
      city: 'Lucknow',
      state: 'UP',
      revenueShare: 0.30,
    },
  });
  console.log('✅ Franchise branch created:', franchiseBranch.name);

  // ── 4. Taxpayer Client 1 (Salaried) ───────────────────────
  const client1 = await prisma.client.upsert({
    where: { pan: 'XYZPQ1234K' },
    update: {},
    create: {
      branchId: branch.id,
      caUserId: admin.id,
      name: 'Ravi Kumar (Demo Taxpayer)',
      pan: 'XYZPQ1234K',
      email: 'ravi.kumar@demo.in',
      mobile: '9876543211',
      category: 'Individual',
      address: 'Civil Lines',
      city: 'Kanpur',
      state: 'UP',
      pincode: '208001',
      tags: ['Salaried', 'AY2026-27', 'ITR-1'],
    },
  });
  console.log('✅ Client 1 created:', client1.name, '| PAN:', client1.pan);

  // ── 5. Business Client (GST Registered) ───────────────────
  const client2 = await prisma.client.upsert({
    where: { pan: 'MNOPQ5678R' },
    update: {},
    create: {
      branchId: branch.id,
      caUserId: admin.id,
      name: 'Meera Enterprises (Demo Business)',
      pan: 'MNOPQ5678R',
      gstin: '09MNOPQ5678R1ZY',
      email: 'meera@business.demo',
      mobile: '9876543212',
      category: 'Company',
      city: 'Kanpur',
      state: 'UP',
      tags: ['GST', 'TDS', 'ITR-6', 'AY2026-27'],
    },
  });
  console.log('✅ Client 2 created:', client2.name, '| GSTIN:', client2.gstin);

  // ── 6. TaxFile (ITR-1 Draft — New Regime — Zero Tax!) ────
  const taxFile = await prisma.taxFile.create({
    data: {
      userId: admin.id,
      clientId: client1.id,
      assessmentYear: 'AY-2026-27',
      financialYear: 'FY-2025-26',
      formType: 'ITR_1',
      regime: 'NEW',
      status: 'DRAFT',
      jsonData: {
        personalInfo: {
          name: 'Ravi Kumar',
          pan: 'XYZPQ1234K',
          dob: '1990-01-15',
          mobile: '9876543211',
          email: 'ravi.kumar@demo.in',
          address: 'Civil Lines, Kanpur, UP - 208001',
          aadhaarLinked: true,
        },
        incomeDetails: {
          salaryGross: 1200000,
          standardDeduction: 75000,
          hra: 120000,
          hraExemption: 96000,
          otherIncome: 5000,
        },
        deductions: {
          // New Regime: No 80C/80D (except 80CCD(2))
          u80CCD_2: 24000, // Employer NPS contribution
        },
        bankDetails: {
          accountNumber: '123456789012',
          ifsc: 'SBIN0001234',
          bankName: 'State Bank of India',
          accountType: 'SB',
          preValidated: true,
        },
        tdsDetails: {
          form16: { tdsDeducted: 30000, quarter: 'Annual' },
        },
      },
      grossIncome: 1200000,
      deductions: 75000,
      taxableIncome: 1125000, // After std deduction
      computedTax: 30000, // After 87A rebate partially
      tdsDeducted: 30000,
      advanceTaxPaid: 0,
      refundDue: 0,
      balanceTaxDue: 0,
    },
  });
  console.log('✅ TaxFile created:', taxFile.id, '| ITR-1 | AY 2026-27');

  // ── 7. GST Return (GSTR-3B Draft) ────────────────────────
  const gstReturn = await prisma.gSTReturn.create({
    data: {
      userId: admin.id,
      gstin: '09MNOPQ5678R1ZY',
      returnType: 'GSTR_3B',
      period: '2025-07',
      financialYear: 'FY-2025-26',
      status: 'DRAFT',
      jsonData: {
        outwardSupplies: {
          taxable: { igst: 300000, cgst: 100000, sgst: 100000 },
          nil: 50000,
          exempt: 10000,
        },
        itcAvailable: {
          igst: 25000,
          cgst: 12000,
          sgst: 12000,
          total: 49000,
        },
        itcUtilized: {
          igst: 25000,
          cgst: 12000,
          sgst: 12000,
        },
        taxPayable: { igst: 0, cgst: 0, sgst: 0 }, // Covered by ITC
      },
      totalSales: 500000,
      taxPayable: 0,
      itcAvailable: 49000,
      itcUtilized: 49000,
      netTaxPaid: 0,
    },
  });
  console.log('✅ GST Return created:', gstReturn.id, '| GSTR-3B | July 2025');

  // ── 8. Validation Run ─────────────────────────────────────
  const validation = await prisma.validationRun.create({
    data: {
      taxFileId: taxFile.id,
      category: 'filing',
      totalRules: 12,
      passed: 10,
      failed: 2,
      warnings: 1,
      errors: [
        { ruleId: 'F008', field: 'advance_tax', message: 'Advance tax shortfall may attract 234B interest', severity: 'warning' },
        { ruleId: 'F011', field: 'ais_mismatch', message: 'AIS shows ₹500 more interest income — verify', severity: 'warning' },
      ],
      warnings_list: [{ ruleId: 'P009', message: 'Aadhaar-PAN link status not confirmed' }],
      executionMs: 42,
    },
  });
  console.log('✅ Validation run created:', validation.id, `| ${validation.passed}/${validation.totalRules} passed`);

  // ── 9. Audit Log ──────────────────────────────────────────
  await prisma.auditLog.create({
    data: {
      userId: admin.id,
      taxFileId: taxFile.id,
      action: 'SEED',
      entity: 'DB',
      entityId: 'seed-phase1',
      ip: '127.0.0.1',
      userAgent: 'TaxMitra-Phase1-Seed/1.0',
      changesAfter: { seeded: true, timestamp: new Date().toISOString() },
    },
  });
  console.log('✅ Audit log created');

  // ── 10. Task (Filing Deadline) ────────────────────────────
  await prisma.task.create({
    data: {
      clientId: client1.id,
      assignedToId: admin.id,
      type: 'ITR_FILING',
      title: 'File ITR-1 AY 2026-27 for Ravi Kumar',
      description: 'Collect Form 16, verify AIS, compute tax, file by July 31, 2026',
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      dueDate: new Date('2026-07-31'),
    },
  });
  console.log('✅ Task created: ITR Filing deadline');

  // ── Summary ───────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  ✅ TaxMitra Phase 1 — Database Seeded!          ║');
  console.log('║  Developer: Abhishek Agrahari | Kanpur, UP       ║');
  console.log('╠══════════════════════════════════════════════════╣');
  console.log('║  Admin:      ca@taxmitra.in                      ║');
  console.log('║  Branch:     TaxMitra Kanpur HQ (TM-KNP)        ║');
  console.log('║  Clients:    2 (Ravi Kumar + Meera Enterprises)  ║');
  console.log('║  TaxFiles:   1 (ITR-1 AY 2026-27 Draft)         ║');
  console.log('║  GSTReturns: 1 (GSTR-3B July 2025 Draft)        ║');
  console.log('║  Tasks:      1 (ITR filing deadline)             ║');
  console.log('╚══════════════════════════════════════════════════╝\n');
}

main()
  .catch((e) => { console.error('❌ Seed failed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
