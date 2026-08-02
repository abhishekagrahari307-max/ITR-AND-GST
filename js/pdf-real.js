/* TaxMitra AI Enterprise — Real PDF Generation (jsPDF + AutoTable)
   Developer: Abhishek Agrahari
   All PDFs: real multi-page, professional, downloadable
*/

async function ensureJsPDF() {
  if (window.jspdf?.jsPDF) return window.jspdf.jsPDF;
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
  await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js');
  return window.jspdf.jsPDF;
}
function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = rej;
    document.head.appendChild(s);
  });
}

const fmt  = n => Math.round(Math.abs(n) || 0).toLocaleString('en-IN');
const fmtR = n => (n < 0 ? `(₹ ${fmt(n)})` : `₹ ${fmt(n)}`);
const today = () => new Date().toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' });

function addHeader(doc, title, subtitle = '') {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(30, 64, 175); doc.rect(0, 0, W, 26, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(13); doc.setFont('helvetica', 'bold');
  doc.text('⚡ TaxMitra AI Enterprise', 14, 9);
  doc.setFontSize(7); doc.setFont('helvetica', 'normal');
  doc.text('Developer: Abhishek Agrahari', 14, 14);
  doc.setFontSize(8.5); doc.text(title, 14, 20);
  doc.setFontSize(7); doc.text(subtitle || today(), W - 14, 20, { align: 'right' });
  return 30;
}
function addFooter(doc) {
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const pages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFontSize(6); doc.setTextColor(150); doc.setFont('helvetica', 'normal');
    doc.text('TaxMitra AI Enterprise | Developed by Abhishek Agrahari', 14, H - 6);
    doc.text('⚠️ This is a computation. Consult a CA before filing.', W / 2, H - 6, { align: 'center' });
    doc.text(`Page ${i}/${pages}`, W - 14, H - 6, { align: 'right' });
  }
}
function numberToWords(n) {
  const ones = ['','One','Two','Three','Four','Five','Six','Seven','Eight','Nine',
    'Ten','Eleven','Twelve','Thirteen','Fourteen','Fifteen','Sixteen','Seventeen','Eighteen','Nineteen'];
  const tens = ['','','Twenty','Thirty','Forty','Fifty','Sixty','Seventy','Eighty','Ninety'];
  if (n === 0) return 'Zero';
  function h(num) {
    if (num < 20) return ones[num];
    if (num < 100) return tens[Math.floor(num/10)] + (num%10 ? ' '+ones[num%10] : '');
    return ones[Math.floor(num/100)] + ' Hundred' + (num%100 ? ' '+h(num%100) : '');
  }
  let r = '';
  if (n >= 10000000) { r += h(Math.floor(n/10000000)) + ' Crore '; n %= 10000000; }
  if (n >= 100000)   { r += h(Math.floor(n/100000))   + ' Lakh ';  n %= 100000;  }
  if (n >= 1000)     { r += h(Math.floor(n/1000))     + ' Thousand '; n %= 1000; }
  if (n > 0)           r += h(n);
  return r.trim();
}

// ── 1. GST INVOICE PDF ────────────────────────────────────────
async function generateGSTInvoicePDF(data) {
  const JsPDF = await ensureJsPDF();
  const doc = new JsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(30,64,175); doc.rect(0,0,W,32,'F');
  doc.setTextColor(255,255,255);
  doc.setFontSize(18); doc.setFont('helvetica','bold');
  doc.text('TAX INVOICE', W/2, 13, {align:'center'});
  doc.setFontSize(7); doc.setFont('helvetica','normal');
  doc.text('TaxMitra AI Enterprise | Developed by Abhishek Agrahari', W/2, 19, {align:'center'});
  doc.text(`Invoice No: ${data.invoiceNo || 'N/A'}   |   Date: ${data.invoiceDate || today()}`, W/2, 25, {align:'center'});
  let y = 37;
  const bw = (W-28)/2;
  doc.setFillColor(240,244,255); doc.rect(14,y,bw,28,'F');
  doc.setFillColor(240,255,244); doc.rect(14+bw+2,y,bw,28,'F');
  doc.setTextColor(30,64,175); doc.setFontSize(7); doc.setFont('helvetica','bold');
  doc.text('SELLER / FROM', 17, y+5);
  doc.setTextColor(20,20,20); doc.setFont('helvetica','normal'); doc.setFontSize(8);
  doc.text(data.sellerName || '', 17, y+11);
  doc.setFontSize(7);
  doc.text(`GSTIN: ${data.sellerGSTIN || 'N/A'}`, 17, y+17);
  doc.setTextColor(22,163,74); doc.setFontSize(7); doc.setFont('helvetica','bold');
  doc.text('BUYER / TO', 17+bw+4, y+5);
  doc.setTextColor(20,20,20); doc.setFont('helvetica','normal'); doc.setFontSize(8);
  doc.text(data.buyerName || '', 17+bw+4, y+11);
  doc.setFontSize(7); doc.text(`GSTIN: ${data.buyerGSTIN || 'Consumer'}`, 17+bw+4, y+17);
  y += 34;
  const rows = (data.items || []).map((item, i) => [i+1, item.description, item.hsnCode||'', item.qty, `₹${fmt(item.rate)}`, `₹${fmt(item.qty*item.rate)}`]);
  doc.autoTable({ startY:y, head:[['#','Description','HSN/SAC','Qty','Rate (₹)','Amount (₹)']],
    body: rows, theme:'grid',
    headStyles:{fillColor:[30,64,175],textColor:255,fontSize:7.5,fontStyle:'bold'},
    bodyStyles:{fontSize:7.5}, margin:{left:14,right:14} });
  y = doc.lastAutoTable.finalY + 6;
  const isIntra = !data.isInterState;
  const taxRows = [
    ['Sub Total','',`₹ ${fmt(data.subTotal)}`],
    isIntra ? ['CGST',`${(data.gstRate||18)/2}%`,`₹ ${fmt(data.cgst||0)}`] : ['IGST',`${data.gstRate||18}%`,`₹ ${fmt(data.igst||0)}`],
    isIntra ? ['SGST',`${(data.gstRate||18)/2}%`,`₹ ${fmt(data.sgst||0)}`] : null,
    ['Grand Total','',`₹ ${fmt(data.grandTotal)}`],
  ].filter(Boolean);
  doc.autoTable({ startY:y, body:taxRows, theme:'plain',
    bodyStyles:{fontSize:8}, columnStyles:{0:{fontStyle:'bold',cellWidth:80},1:{cellWidth:30},2:{halign:'right',fontStyle:'bold'}},
    margin:{left:W-14-120,right:14} });
  y = doc.lastAutoTable.finalY + 8;
  doc.setFillColor(30,64,175); doc.rect(W-80,y-6,66,10,'F');
  doc.setTextColor(255,255,255); doc.setFontSize(9); doc.setFont('helvetica','bold');
  doc.text(`GRAND TOTAL: ₹ ${fmt(data.grandTotal)}`, W-47, y, {align:'center'});
  addFooter(doc);
  doc.save(`GST_Invoice_${data.invoiceNo||'INV'}.pdf`);
  return true;
}

// ── 2. PAYSLIP PDF ────────────────────────────────────────────
async function generatePayslipPDF(data) {
  const JsPDF = await ensureJsPDF();
  const doc = new JsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  let y = addHeader(doc, 'SALARY PAYSLIP', `Month: ${data.month||''} | Employee: ${data.employeeName||''}`);
  doc.setFillColor(240,244,255); doc.rect(14,y,doc.internal.pageSize.getWidth()-28,20,'F');
  doc.setTextColor(30,64,175); doc.setFontSize(11); doc.setFont('helvetica','bold');
  doc.text(data.companyName||'Company', 17, y+8);
  doc.setTextColor(40,40,40); doc.setFontSize(7.5); doc.setFont('helvetica','normal');
  doc.text(`Employee: ${data.employeeName||''}  |  ID: ${data.employeeId||''}  |  Working Days: ${data.workingDays||26}/26`, 17, y+14);
  doc.text(`Bank A/c: ${data.bankAccount||''}  |  PAN: ${data.pan||''}`, 17, y+19);
  y += 26;
  const earningRows = [
    ['Basic Salary', `₹ ${fmt(data.basicSalary)}`],
    ['HRA',          `₹ ${fmt(data.hra)}`],
    ['Transport Allowance', `₹ ${fmt(data.ta)}`],
    ['Medical Allowance',   `₹ ${fmt(data.medicalAllowance)}`],
    ['Special Allowance',   `₹ ${fmt(data.specialAllowance)}`],
  ];
  const dedRows = [
    ['EPF (Employee)', `₹ ${fmt(data.epf)}`],
    ['Professional Tax', `₹ ${fmt(data.professionalTax)}`],
    ['TDS (Income Tax)', `₹ ${fmt(data.tds)}`],
  ];
  const maxLen = Math.max(earningRows.length, dedRows.length);
  const rows = Array.from({length:maxLen}, (_,i) => [
    earningRows[i]?.[0]||'', earningRows[i]?.[1]||'',
    dedRows[i]?.[0]||'',    dedRows[i]?.[1]||'',
  ]);
  rows.push(['GROSS EARNINGS',`₹ ${fmt(data.grossSalary)}`,'TOTAL DEDUCTIONS',`₹ ${fmt(data.totalDeductions)}`]);
  doc.autoTable({ startY:y, head:[['Earnings','Amount','Deductions','Amount']],
    body:rows, theme:'grid',
    headStyles:{fillColor:[30,64,175],textColor:255,fontSize:8,fontStyle:'bold'},
    bodyStyles:{fontSize:7.5},
    didParseCell: d => { if (d.row.index===rows.length-1) { d.cell.styles.fontStyle='bold'; d.cell.styles.fillColor=[239,246,255]; d.cell.styles.textColor=[30,64,175]; } },
    margin:{left:14,right:14} });
  y = doc.lastAutoTable.finalY + 6;
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(30,64,175); doc.roundedRect(14,y,W-28,14,3,3,'F');
  doc.setTextColor(255,255,255); doc.setFontSize(13); doc.setFont('helvetica','bold');
  doc.text('NET PAY (Take Home):', 20, y+9);
  doc.text(`₹ ${fmt(data.netSalary)}`, W-20, y+9, {align:'right'});
  y += 20;
  doc.setFontSize(7.5); doc.setTextColor(60,60,60); doc.setFont('helvetica','italic');
  doc.text(`Amount in words: ${numberToWords(Math.round(data.netSalary||0))} Rupees Only`, 14, y);
  addFooter(doc);
  doc.save(`Payslip_${(data.employeeName||'').replace(/\s/g,'_')}_${data.month||''}.pdf`);
  return true;
}

// ── 3. FORM 16 PDF ────────────────────────────────────────────
async function generateForm16PDF(data) {
  const JsPDF = await ensureJsPDF();
  const doc = new JsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  const W = doc.internal.pageSize.getWidth();
  let y = addHeader(doc, 'FORM 16 — TDS CERTIFICATE', `u/s 203 | AY: ${data.assessmentYear||'2025-26'}`);
  doc.setFillColor(30,64,175); doc.rect(14,y,W-28,6,'F');
  doc.setTextColor(255); doc.setFontSize(7.5); doc.setFont('helvetica','bold');
  doc.text('PART A — DETAILS OF TAX DEDUCTED AND DEPOSITED', 17, y+4.5);
  y += 9;
  doc.autoTable({ startY:y,
    body:[
      ['Name of Employer', data.employerName||'','TAN', data.tan||''],
      ['Name of Employee', data.employeeName||'','PAN of Employee', data.pan||''],
      ['Assessment Year',  data.assessmentYear||'','Financial Year', data.financialYear||''],
    ], theme:'grid', bodyStyles:{fontSize:7.5},
    columnStyles:{0:{fontStyle:'bold',fillColor:[240,244,255],cellWidth:50},2:{fontStyle:'bold',fillColor:[240,244,255],cellWidth:45}},
    margin:{left:14,right:14} });
  y = doc.lastAutoTable.finalY + 6;
  doc.setFillColor(30,64,175); doc.rect(14,y,W-28,6,'F');
  doc.setTextColor(255); doc.setFont('helvetica','bold');
  doc.text('PART B — DETAILS OF SALARY AND TAX COMPUTATION', 17, y+4.5); y += 9;
  doc.autoTable({ startY:y,
    body:[
      ['Gross Salary', `₹ ${fmt(data.grossSalary)}`],
      ['Standard Deduction u/s 16(ia)', `₹ ${fmt(data.standardDeduction||50000)}`],
      ['Professional Tax u/s 16(iii)', `₹ ${fmt(data.professionalTax||0)}`],
      ['Net Taxable Salary', `₹ ${fmt(data.netSalary)}`],
      ['Tax on Total Income', `₹ ${fmt(data.taxOnIncome)}`],
      ['Health & Education Cess @4%', `₹ ${fmt(data.cess)}`],
      ['Total Tax Payable', `₹ ${fmt(data.taxPayable)}`],
      ['Less: Rebate u/s 87A', `₹ ${fmt(data.rebate87A||0)}`],
      ['Total TDS Deducted', `₹ ${fmt(data.totalTDS)}`],
    ], theme:'grid', bodyStyles:{fontSize:7.5},
    columnStyles:{0:{fontStyle:'bold',fillColor:[248,250,252],cellWidth:120},1:{halign:'right'}},
    didParseCell: d => { if ([3,6,8].includes(d.row.index)) { d.cell.styles.fontStyle='bold'; d.cell.styles.fillColor=[239,246,255]; d.cell.styles.textColor=[30,64,175]; } },
    margin:{left:14,right:14} });
  addFooter(doc);
  doc.save(`Form16_${(data.employeeName||'').replace(/\s/g,'_')}_AY${data.assessmentYear||'2025-26'}.pdf`);
  return true;
}

// ── 4. P&L PDF ────────────────────────────────────────────────
async function generatePnLPDF(data) {
  const JsPDF = await ensureJsPDF();
  const doc = new JsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  let y = addHeader(doc, 'PROFIT & LOSS STATEMENT', `${data.businessName||'Business'} | ${data.period||''}`);
  doc.autoTable({ startY:y,
    head:[['Particulars','Amount (₹)','Particulars','Amount (₹)']],
    body:[
      ['INCOME','','EXPENSES',''],
      ['Sales Revenue',   fmt(data.salesRevenue||0), 'Salaries',       fmt(data.salaries||0)],
      ['Service Income',  fmt(data.serviceIncome||0),'Rent & Utilities',fmt(data.rent||0)],
      ['Other Income',    fmt(data.otherIncome||0),  'Marketing',       fmt(data.marketing||0)],
      ['','','Other Expenses',   fmt(data.otherExpenses||0)],
      ['TOTAL INCOME',fmt(data.totalIncome),'TOTAL EXPENSES',fmt(data.totalExpenses)],
      ['NET PROFIT / (LOSS)',data.netProfit>=0?fmt(data.netProfit):`(${fmt(Math.abs(data.netProfit))})`, 'Profit Margin',`${data.profitMargin||0}%`],
    ], theme:'grid',
    headStyles:{fillColor:[30,64,175],textColor:255,fontSize:8},
    bodyStyles:{fontSize:7.5},
    didParseCell:d=>{
      if(d.row.index===0){d.cell.styles.fontStyle='bold';d.cell.styles.fillColor=[240,244,255]}
      if(d.row.index===5){d.cell.styles.fontStyle='bold';d.cell.styles.fillColor=[240,244,255]}
      if(d.row.index===6){d.cell.styles.fontStyle='bold';d.cell.styles.fontSize=9;
        d.cell.styles.fillColor=(data.netProfit||0)>=0?[240,253,244]:[254,242,242];
        d.cell.styles.textColor=(data.netProfit||0)>=0?[22,163,74]:[220,38,38]}
    }, margin:{left:14,right:14} });
  addFooter(doc);
  doc.save(`PnL_${(data.businessName||'Business').replace(/\s/g,'_')}.pdf`);
  return true;
}

// ── 5. LEDGER PDF ─────────────────────────────────────────────
async function generateLedgerPDF(data) {
  const JsPDF = await ensureJsPDF();
  const doc = new JsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
  let y = addHeader(doc, 'GENERAL LEDGER', `${data.accountName||'Account'} | ${data.period||''}`);
  doc.autoTable({ startY:y,
    head:[['Date','Particulars','Voucher No.','Debit (₹)','Credit (₹)','Balance']],
    body:(data.entries||[]).map(e=>[e.date,e.particulars,e.voucherNo||'',
      e.debit?`₹ ${fmt(e.debit)}`:'', e.credit?`₹ ${fmt(e.credit)}`:'',
      e.balance>=0?`₹ ${fmt(e.balance)} Dr`:`₹ ${fmt(Math.abs(e.balance))} Cr`]),
    theme:'grid', headStyles:{fillColor:[30,64,175],textColor:255,fontSize:8},
    bodyStyles:{fontSize:7.5}, margin:{left:14,right:14} });
  addFooter(doc);
  doc.save(`Ledger_${(data.accountName||'').replace(/\s/g,'_')}.pdf`);
  return true;
}

// ── 6. COMPLIANCE CALENDAR PDF ────────────────────────────────
async function generateCompliancePDF(dates) {
  const JsPDF = await ensureJsPDF();
  const doc = new JsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
  let y = addHeader(doc, 'COMPLIANCE CALENDAR FY 2025-26', 'Income Tax | GST | TDS | ROC Due Dates');
  doc.autoTable({ startY:y,
    head:[['Compliance','Category','Due Date','Status','Days Left']],
    body:(dates||[]).map(d=>[d.title,d.category,
      new Date(d.dueDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}),
      d.daysLeft<=0?'OVERDUE':d.daysLeft<=7?'URGENT':d.daysLeft<=15?'SOON':'UPCOMING',
      d.daysLeft<=0?'Past due':`${d.daysLeft} days`]),
    theme:'grid', headStyles:{fillColor:[30,64,175],textColor:255,fontSize:8},
    bodyStyles:{fontSize:7.5},
    didParseCell:d=>{
      if(d.column.index===3&&d.section==='body'){
        const v=d.cell.raw;
        d.cell.styles.fontStyle='bold';
        d.cell.styles.textColor=v==='OVERDUE'||v==='URGENT'?[220,38,38]:v==='SOON'?[217,119,6]:[22,163,74];
      }
    }, margin:{left:14,right:14} });
  addFooter(doc);
  doc.save('TaxMitra_Compliance_Calendar.pdf');
  return true;
}

window.TaxMitraPDF = { generateGSTInvoicePDF, generatePayslipPDF, generateForm16PDF, generatePnLPDF, generateLedgerPDF, generateCompliancePDF, numberToWords, ensureJsPDF };
