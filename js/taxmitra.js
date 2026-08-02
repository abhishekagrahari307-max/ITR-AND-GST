/* TaxMitra AI Enterprise — Master JS | Developer: Abhishek Agrahari */
'use strict';

// ── Theme ─────────────────────────────────────────────────────
const themeToggle = document.getElementById('themeToggle');
const savedTheme = localStorage.getItem('tm-theme') || 'light';
if (savedTheme === 'dark') {
  document.body.classList.add('dark-mode');
  if (themeToggle) themeToggle.textContent = '☀️';
}
if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    themeToggle.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('tm-theme', isDark ? 'dark' : 'light');
  });
}

// ── Navbar scroll ─────────────────────────────────────────────
const mainNav = document.getElementById('mainNav');
window.addEventListener('scroll', () => {
  if (mainNav) mainNav.classList.toggle('scrolled', window.scrollY > 30);
  const st = document.getElementById('scrollTop');
  if (st) st.classList.toggle('show', window.scrollY > 400);
}, { passive: true });

// ── Hamburger ─────────────────────────────────────────────────
const hamburger = document.getElementById('hamburger');
const navWrapper = document.getElementById('navLinksWrapper');
if (hamburger && navWrapper) {
  hamburger.addEventListener('click', () => {
    navWrapper.classList.toggle('show');
    hamburger.classList.toggle('open');
  });
  // Close nav when a link is clicked
  navWrapper.addEventListener('click', (e) => {
    if (e.target.tagName === 'A' || e.target.closest('a')) {
      navWrapper.classList.remove('show');
      hamburger.classList.remove('open');
    }
  });
  // Close on outside click
  document.addEventListener('click', (e) => {
    if (!navWrapper.contains(e.target) && !hamburger.contains(e.target)) {
      navWrapper.classList.remove('show');
      hamburger.classList.remove('open');
    }
  });
}

// ── Scroll to top ─────────────────────────────────────────────
// Scroll to top - auto inject if missing
let scrollTopBtn = document.getElementById('scrollTop');
if (!scrollTopBtn) {
  scrollTopBtn = document.createElement('button');
  scrollTopBtn.id = 'scrollTop';
  scrollTopBtn.className = 'scroll-top';
  scrollTopBtn.innerHTML = '↑';
  scrollTopBtn.title = 'Back to top';
  document.body.appendChild(scrollTopBtn);
}
if (scrollTopBtn) scrollTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));

// ── Search ────────────────────────────────────────────────────
const searchToggle = document.getElementById('searchToggle');
const navSearchBar = document.getElementById('navSearchBar');
if (searchToggle && navSearchBar) {
  searchToggle.addEventListener('click', () => {
    navSearchBar.classList.toggle('show');
    if (navSearchBar.classList.contains('show')) document.getElementById('globalSearch')?.focus();
  });
}

const searchIndex = [
  { title:'Income Tax Calculator', url:'pages/calculators.html#income-tax', icon:'💰', tag:'Calculator' },
  { title:'Tax Computation Sheet', url:'pages/computation.html', icon:'🧮', tag:'Computation' },
  { title:'HRA Calculator', url:'pages/calculators.html#hra', icon:'🏠', tag:'Calculator' },
  { title:'Capital Gain Calculator', url:'pages/calculators.html#capital-gain', icon:'📈', tag:'Calculator' },
  { title:'SIP Calculator', url:'pages/calculators.html#sip', icon:'📊', tag:'Calculator' },
  { title:'EMI Calculator', url:'pages/calculators.html#emi', icon:'🏡', tag:'Calculator' },
  { title:'GST Calculator', url:'pages/calculators.html#gst-calc', icon:'🧾', tag:'Calculator' },
  { title:'PPF Calculator', url:'pages/calculators.html#ppf', icon:'🏛️', tag:'Calculator' },
  { title:'Gratuity Calculator', url:'pages/calculators.html#gratuity', icon:'🎖️', tag:'Calculator' },
  { title:'Old vs New Regime', url:'pages/calculators.html#regime', icon:'⚖️', tag:'Calculator' },
  { title:'ITR-1 Filing', url:'pages/itr-center.html', icon:'📋', tag:'ITR' },
  { title:'ITR-4 Sugam', url:'pages/itr-center.html', icon:'📋', tag:'ITR' },
  { title:'AIS Analysis', url:'pages/itr-center.html', icon:'🔍', tag:'ITR' },
  { title:'Form 26AS', url:'pages/itr-center.html', icon:'📄', tag:'ITR' },
  { title:'GSTR-1 Filing', url:'pages/gst.html', icon:'📄', tag:'GST' },
  { title:'GSTR-3B Filing', url:'pages/gst.html', icon:'📄', tag:'GST' },
  { title:'GST Invoice Generator', url:'pages/gst.html', icon:'🧾', tag:'GST' },
  { title:'HSN/SAC Search', url:'pages/gst.html', icon:'🔍', tag:'GST' },
  { title:'Form 16 Generator', url:'pages/tds-payroll.html', icon:'📝', tag:'TDS' },
  { title:'Payslip Generator', url:'pages/tds-payroll.html', icon:'💼', tag:'Payroll' },
  { title:'AI Tax Assistant', url:'pages/ai-assistant.html', icon:'🤖', tag:'AI' },
  { title:'Investment Planner', url:'pages/investment.html', icon:'📈', tag:'Planning' },
  { title:'Section 80C Deductions', url:'pages/investment.html', icon:'💡', tag:'Tax Saving' },
  { title:'Compliance Calendar', url:'pages/compliance.html', icon:'📅', tag:'Compliance' },
  { title:'Advance Tax Calculator', url:'pages/calculators.html', icon:'📅', tag:'Calculator' },
];

const globalSearch = document.getElementById('globalSearch');
const searchResults = document.getElementById('searchResults');
if (globalSearch && searchResults) {
  globalSearch.addEventListener('input', () => {
    const q = globalSearch.value.toLowerCase().trim();
    if (q.length < 2) { searchResults.classList.remove('show'); return; }
    const matches = searchIndex.filter(i => i.title.toLowerCase().includes(q) || i.tag.toLowerCase().includes(q)).slice(0, 8);
    if (!matches.length) { searchResults.classList.remove('show'); return; }
    searchResults.innerHTML = matches.map(m =>
      `<a href="${m.url}" class="search-result-item">
        <span>${m.icon}</span>
        <div><strong>${m.title}</strong></div>
        <span style="margin-left:auto;font-size:.68rem;background:var(--bg-secondary);padding:.12rem .45rem;border-radius:9999px;color:var(--text-muted)">${m.tag}</span>
      </a>`).join('');
    searchResults.classList.add('show');
  });
  document.addEventListener('click', e => {
    if (!searchResults.contains(e.target) && e.target !== globalSearch) searchResults.classList.remove('show');
  });
}

// ── Counter animation (fixed: observe each counter individually, rAF easing) ──
function animateSingleCounter(el) {
  if (el.dataset.animated) return;
  el.dataset.animated = '1';
  const target = parseInt(el.dataset.target || '0');
  if (!target) { el.textContent = '0'; return; }
  const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReduced) { el.textContent = target.toLocaleString('en-IN'); return; }
  const duration = 1800;
  const start = performance.now();
  function tick(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // easeOutQuart
    const ease = 1 - Math.pow(1 - progress, 4);
    const cur = Math.round(ease * target);
    el.textContent = cur.toLocaleString('en-IN');
    if (progress < 1) requestAnimationFrame(tick);
    else el.textContent = target.toLocaleString('en-IN');
  }
  requestAnimationFrame(tick);
}

function initCounters() {
  const counters = document.querySelectorAll('.stat-num[data-target]');
  if (!counters.length) return;

  // 3-second fallback: always show correct value even if observer never fires
  const fallbackTimer = setTimeout(() => {
    counters.forEach(el => {
      if (!el.dataset.animated) {
        el.textContent = parseInt(el.dataset.target || '0').toLocaleString('en-IN');
        el.dataset.animated = '1';
      }
    });
  }, 3000);

  if ('IntersectionObserver' in window) {
    // Observe EACH counter individually — fixes hero-section threshold issue
    counters.forEach(el => {
      const obs = new IntersectionObserver(entries => {
        if (entries[0].isIntersecting) {
          clearTimeout(fallbackTimer);
          animateSingleCounter(el);
          obs.disconnect();
        }
      }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
      obs.observe(el);
    });
  } else {
    // No IntersectionObserver support — animate immediately
    clearTimeout(fallbackTimer);
    counters.forEach(animateSingleCounter);
  }
}

document.addEventListener('DOMContentLoaded', initCounters);

// ── Calculator category filter ────────────────────────────────
document.querySelectorAll('.calc-cat-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.calc-cat-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const cat = btn.dataset.cat;
    document.querySelectorAll('.calc-card').forEach(card => {
      card.classList.toggle('hidden', cat !== 'all' && card.dataset.cat !== cat);
    });
  });
});

// ── Due dates ─────────────────────────────────────────────────
function populateDueDates() {
  const grid = document.getElementById('dueDatesGrid');
  if (!grid) return;
  const dates = [
    { type:'Income Tax', title:'ITR Filing (Non-Audit)', date:'31 July 2026', urgency:'urgent' },
    { type:'TDS', title:'Form 24Q/26Q (Q1)', date:'31 July 2026', urgency:'urgent' },
    { type:'GST', title:'GSTR-1 – July 2025', date:'11 August 2026', urgency:'warning' },
    { type:'TDS', title:'TDS Payment – July 2025', date:'7 August 2026', urgency:'warning' },
    { type:'GST', title:'GSTR-3B – July 2025', date:'20 August 2026', urgency:'warning' },
    { type:'Income Tax', title:'Advance Tax Q2 (45%)', date:'15 September 2026', urgency:'safe' },
    { type:'GST', title:'GSTR-9 Annual Return', date:'31 December 2026', urgency:'safe' },
    { type:'Income Tax', title:'ITR – Audit Cases', date:'31 October 2026', urgency:'safe' },
  ];
  grid.innerHTML = dates.map(d => `
    <div class="due-date-card ${d.urgency}">
      <div class="ddc-type">${d.type}</div>
      <div class="ddc-title">${d.title}</div>
      <div class="ddc-date">📅 ${d.date}</div>
      <span class="ddc-badge ${d.urgency}">${d.urgency==='urgent'?'🔴 Urgent':d.urgency==='warning'?'🟡 Soon':'🟢 Upcoming'}</span>
    </div>`).join('');
}
populateDueDates();

// ── AI Demo Chat ──────────────────────────────────────────────
let demoLang = 'hi';
function switchLang(lang) {
  demoLang = lang;
  document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[onclick="switchLang('${lang}')"]`)?.classList.add('active');
}
function getAIResponse(msg) {
  const m = msg.toLowerCase();
  const hi = demoLang !== 'en';
  // Use the comprehensive rule-based engine from ai-real.js if available
  if (window.TaxMitraAI && window.TaxMitraAI.getRuleBasedResponse) {
    return window.TaxMitraAI.getRuleBasedResponse(msg, hi ? 'hi' : 'en', 'general');
  }
  // Built-in fallback (comprehensive)
  if (m.match(/zero.*tax|12.*75|12\.75|salary.*koi.*tax|zero.*salary/))
    return '🎉 **₹12.75 Lakh tak ZERO TAX! (Budget 2025)**\n\nCalculation:\n• Gross Salary: ₹12,75,000\n• (-) Standard Deduction: ₹75,000\n• Net Taxable: ₹12,00,000\n• Tax on slabs: ₹60,000\n• (-) 87A Rebate: ₹60,000\n• **NET TAX = ₹0** 🎉\n\nNew Regime mein auto-apply hota hai!';
  if (m.match(/itr.?1|sahaj|salary.*form|form.*salary/))
    return '📝 **ITR-1 (Sahaj):**\n• Salaried employees ke liye\n• Income ≤ ₹50 Lakh\n• 1 House Property\n• FD interest, savings\n• Capital gains walo ke liye nahi\n\n📅 Deadline: 31 July 2026';
  if (m.match(/itr.?2|capital.*gain|shares.*itr|itr.*capital/))
    return '📊 **ITR-2:**\n• Salary + Capital Gains\n• Multiple properties\n• Foreign income/assets\n• Director in company\n\n📋 Documents: Broker statement, Form 16, 26AS';
  if (m.match(/itr.?4|sugam|44ad|presumptive|freelanc|consultant/))
    return '🏪 **ITR-4 (Sugam) — Presumptive:**\n• 44AD: Business turnover ≤ ₹3Cr → 8%/6% income\n• 44ADA: Professional ≤ ₹75L → 50% income\n• Doctors, CAs, lawyers, freelancers\n• Simple filing, no books required';
  if (m.match(/itr|form|return|kaunsa.*form|which.*form/))
    return '📋 **ITR Form Selection:**\n• ITR-1: Salary only (≤₹50L)\n• ITR-2: Capital gains / Foreign income\n• ITR-3: Business (full books)\n• ITR-4: Presumptive (44AD/44ADA)\n• ITR-5: Firm/LLP\n• ITR-7: Trust/NGO\n\nIncome details batao — main sahi form suggest karunga!';
  if (m.match(/regime|old.*new|new.*old|konsa.*regime|compare.*regime/))
    return '⚖️ **Old vs New Regime (AY 2026-27):**\n\n🟢 **New Regime (Default):**\n• 0-4L: Nil | 4-8L: 5% | 8-12L: 10%\n• Std Deduction: ₹75,000\n• ZERO TAX upto ₹12,75,000!\n• 87A Rebate: ₹60,000\n\n🔵 **Old Regime:**\n• 80C: ₹1.5L | 80D: ₹25K | HRA, Home Loan\n• Std Deduction: ₹50,000\n\n💡 Deductions > ₹3.75L → Old Regime better';
  if (m.match(/hra|house.*rent|rent.*exemption/))
    return '🏠 **HRA Exemption = Min of 3:**\n1. Actual HRA received\n2. Rent paid − 10% of Basic salary\n3. 50% of Basic (Metro) / 40% (Non-Metro)\n\n**Example:** Basic ₹40K, HRA ₹20K, Rent ₹18K (Delhi)\n• ₹20,000 | ₹14,000 | ₹20,000\n• **Exempt: ₹14,000/month**\n\n⚠️ HRA only in Old Regime!';
  if (m.match(/80c|ppf|elss|lic|nsc|tax.*save|save.*tax|invest.*tax/))
    return '💡 **Section 80C (Max ₹1,50,000):**\n• ELSS MF — 3yr lock, 12-18% returns (Best!)\n• PPF — 7.1%, 15yr, tax-free maturity\n• EPF — auto salary deduction\n• NPS — 10% returns + extra ₹50K via 80CCD(1B)\n• LIC Premium, NSC, 5yr FD\n• Home loan principal, tuition fees\n\n⚠️ New Regime mein 80C nahi milta!';
  if (m.match(/nps|80ccd|pension/))
    return '🏦 **NPS — National Pension System:**\n• 80C mein count (₹1.5L limit)\n• 80CCD(1B): EXTRA ₹50,000 over 80C!\n• **80CCD(2): Employer NPS — New Regime mein bhi!**\n• ~10% annual returns\n• 60% maturity tax-free | 40% annuity';
  if (m.match(/80d|health.*insur|medical.*insur/))
    return '🏥 **80D — Health Insurance:**\n• Self+Family (below 60): ₹25,000\n• Self+Family (60+): ₹50,000\n• Parents (below 60): ₹25,000\n• Parents (60+): ₹50,000\n• **Max total: ₹75,000**\n\nOnly in Old Regime!';
  if (m.match(/gst|gstr|invoice|itc|input.*tax/))
    return '🧾 **GST Filing Calendar:**\n• GSTR-1: 11th of next month\n• GSTR-3B: 20th of next month\n• GSTR-9 Annual: 31 December\n\n**ITC Rules:**\n• Valid invoice hona chahiye\n• Supplier ne tax deposit kiya ho\n• GSTR-2B mein appear ho\n\nLate fee: ₹50/day (max ₹10,000)';
  if (m.match(/tds|194|192|form 16|form16/))
    return '💼 **TDS Key Rates:**\n• 192: Salary → Slab rate\n• 194A: FD interest → 10% (>₹40K)\n• 194C: Contractor → 1%/2%\n• 194H: Commission → 5%\n• 194I: Rent → 10%\n• 194J: Professional → 10%\n\nForm 16: Part A = TDS cert | Part B = Salary computation';
  if (m.match(/capital.*gain|ltcg|stcg|shares.*tax|mutual.*fund.*tax/))
    return '📈 **Capital Gains Tax (AY 2026-27):**\n\n**Equity/MF (STT paid):**\n• STCG (<12M): **20%**\n• LTCG (>12M): **12.5%** above ₹1.25L exemption\n\n**Property/Debt:**\n• STCG (<24M): Slab rate\n• LTCG (>24M): 12.5% without indexation\n\n**Exemption u/s 54:** Reinvest in property → CG exempt';
  if (m.match(/advance.*tax|234b|234c|quarterly/))
    return '📅 **Advance Tax Schedule:**\n• 15 June: 15% of annual tax\n• 15 Sept: 45% cumulative\n• 15 Dec: 75% cumulative\n• 15 March: 100%\n\nRequired if tax >₹10,000 after TDS\nInterest u/s 234B/C: 1%/month if not paid';
  if (m.match(/notice|143|148|156|scrutiny|demand/))
    return '🔔 **IT Notice Types:**\n• 143(1): Intimation — routine, low risk\n• 143(2): Scrutiny — respond in 30 days\n• 148: Reassessment — HIGH RISK, CA se milein!\n• 156: Demand notice — pay/contest in 30 days\n\n⚠️ Ignore mat karo — penalty + interest!';
  if (m.match(/deadline|last.*date|due.*date|31.*july|july.*31/))
    return '📅 **ITR Deadlines AY 2026-27:**\n• Non-Audit: **31 July 2026**\n• Audit: 31 October 2026\n• Belated: 31 December 2026 (₹5K penalty)\n• ITR-U Updated: 31 March 2029\n\nLate fee u/s 234F: ≤₹5L → ₹1,000 | >₹5L → ₹5,000';
  if (m.match(/12.*lakh|12 lakh|twelve.*lakh|meri.*salary|my.*salary|salary.*tax/))
    return '💰 **₹12 Lakh Salary — Tax Calculation:**\n\nNew Regime:\n• Gross: ₹12,00,000\n• (-) Std Deduction: ₹75,000\n• Taxable: ₹11,25,000\n• Tax: ₹42,500\n• Cess 4%: ₹1,700\n• **Total Tax: ₹44,200**\n\n(₹12.75L tak gross salary = ZERO TAX!)';
  return '🙏 **TaxMitra AI — Aapka CA Sahayak!**\n\nYe topics cover karta hoon:\n• ITR Forms (ITR-1/2/3/4)\n• Old vs New Regime comparison\n• 80C, 80D, NPS deductions\n• HRA, Home Loan tax benefit\n• GST filing & ITC\n• TDS rates & Form 16\n• Capital Gains (LTCG/STCG)\n• IT Notices explanation\n• Advance Tax schedule\n\nKoi bhi tax sawaal puchein — seedha answer milega! 💡';
}
function sendDemoMsg() {
  const input = document.getElementById('demoInput');
  if (!input?.value.trim()) return;
  const msgs = document.getElementById('aiDemoMessages');
  if (!msgs) return;
  const userDiv = document.createElement('div');
  userDiv.className = 'chat-msg user'; userDiv.textContent = input.value;
  msgs.appendChild(userDiv);
  const userText = input.value; input.value = '';
  const typing = document.createElement('div');
  typing.className = 'chat-msg bot'; typing.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';
  msgs.appendChild(typing); msgs.scrollTop = msgs.scrollHeight;
  setTimeout(() => {
    msgs.removeChild(typing);
    const botDiv = document.createElement('div');
    botDiv.className = 'chat-msg bot'; botDiv.style.whiteSpace = 'pre-line';
    botDiv.textContent = getAIResponse(userText);
    msgs.appendChild(botDiv); msgs.scrollTop = msgs.scrollHeight;
  }, 800);
}
document.getElementById('demoInput')?.addEventListener('keypress', e => { if (e.key === 'Enter') sendDemoMsg(); });

// ── AI Float Window v2 ──────────────────────────────────────
// Auto-inject on pages that don't have the float window HTML
(function injectAIFloat() {
  if (document.getElementById('aiFloatWindow')) return; // already exists
  const floatHTML = `
  <div class="ai-float-btn" id="aiFloatBtn" title="AI Tax Assistant">
    <div class="ai-float-icon">🤖</div>
    <div class="ai-float-pulse"></div>
    <div class="ai-tooltip">AI Tax Assistant</div>
  </div>
  <div class="ai-float-window" id="aiFloatWindow">
    <div class="afw-header">
      <div class="afw-info">
        <div class="afw-avatar">🤖</div>
        <div><strong>TaxMitra AI</strong><span class="afw-status">● AI Powered</span></div>
      </div>
      <div class="afw-actions">
        <button onclick="window.open('../pages/ai-assistant.html','_self')" title="Full Screen">⛶</button>
        <button id="afw-close" title="Close">✕</button>
      </div>
    </div>
    <div class="afw-quick-actions">
      <button onclick="askQuick('ITR form kaunsa bharna chahiye?')">📋 ITR Form?</button>
      <button onclick="askQuick('Tax saving tips 2026')">💡 Tax Tips</button>
      <button onclick="askQuick('Old vs New Regime comparison')">⚖️ Regime?</button>
      <button onclick="askQuick('GST filing kaise karte hain')">🧾 GST Help</button>
    </div>
    <div class="afw-messages" id="afwMessages">
      <div class="afw-msg bot"><div class="afw-msg-avatar">🤖</div><div class="afw-msg-text" id="afwWelcome">नमस्ते! 🙏 Main TaxMitra AI hoon.<br>ITR, GST, Tax Saving — kuch bhi puchein!</div></div>
    </div>
    <div class="afw-input-area">
      <input type="text" id="afwInput" placeholder="Tax question puchein..." autocomplete="off"/>
      <button onclick="sendAfwMsg()" title="Send"><i class="fa fa-paper-plane"></i></button>
    </div>
    <div class="afw-footer"><a href="pages/ai-assistant.html">Open Full AI Assistant →</a></div>
  </div>`;
  const wrapper = document.createElement('div');
  wrapper.innerHTML = floatHTML;
  document.body.appendChild(wrapper);
})();

// AI Float show/hide
function _showAFWKeyPrompt() {
  // Show one-time setup prompt if no key configured
  const keys = JSON.parse(localStorage.getItem('tm_keys') || '{}');
  const hasKey = keys.geminiApiKey && (keys.geminiApiKey.startsWith('AIzaSy') || keys.geminiApiKey.startsWith('AQ.')) && keys.geminiApiKey.length > 20;
  const shown = sessionStorage.getItem('tm_afwKeyPromptShown');
  if (!hasKey && !shown) {
    sessionStorage.setItem('tm_afwKeyPromptShown', '1');
    const welcome = document.getElementById('afwWelcome');
    if (welcome) {
      const base = location.pathname.includes('/pages/') ? '' : 'pages/';
      welcome.innerHTML = 'नमस्ते! 🙏 Main TaxMitra AI hoon.<br>ITR, GST, Tax Saving — kuch bhi puchein!<br><br>' +
        '<a href="' + base + 'pages/setup.html" style="display:inline-block;background:#2563eb;color:#fff;padding:.35rem .85rem;border-radius:99px;font-size:.75rem;font-weight:700;text-decoration:none;margin-top:.3rem">🔑 Gemini AI Activate karo →</a>';
    }
  }
}

function _initAIFloat() {
  const btn = document.getElementById('aiFloatBtn');
  const win = document.getElementById('aiFloatWindow');
  const closeBtn = document.getElementById('afw-close');
  if (btn && win) {
    btn.addEventListener('click', () => win.classList.toggle('show'));
    if (closeBtn) closeBtn.addEventListener('click', () => win.classList.remove('show'));
    // Close on outside click
    document.addEventListener('click', (e) => {
      if (win.classList.contains('show') && !win.contains(e.target) && !btn.contains(e.target)) {
        win.classList.remove('show');
      }
    });
  }
  // Enter key on input
  const inp = document.getElementById('afwInput');
  if (inp) {
    inp.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendAfwMsg(); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); sendAfwMsg(); } });
  }
}

// Init after DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { _initAIFloat(); setTimeout(_showAFWKeyPrompt, 500); });
} else {
  _initAIFloat();
  setTimeout(_showAFWKeyPrompt, 500);
}

// ── AFW conversation history ─────────────────────────────────
const _afwHistory = [];

async function sendAfwMsg(preset) {
  const input = document.getElementById('afwInput');
  const msg = (preset || (input ? input.value.trim() : '')).trim();
  if (!msg) return;
  const msgs = document.getElementById('afwMessages');
  if (!msgs) return;

  appendAfwMsg(msg, true);
  if (input) input.value = '';
  _afwHistory.push({ role: 'user', content: msg });

  // Typing indicator
  const typing = document.createElement('div');
  typing.className = 'afw-msg bot';
  typing.id = 'afwTyping';
  typing.innerHTML = '<div class="afw-msg-avatar">🤖</div><div class="afw-msg-text"><span class="typing-dots"><span></span><span></span><span></span></span></div>';
  msgs.appendChild(typing);
  msgs.scrollTop = msgs.scrollHeight;

  let aiText = '';
  try {
    // Try real AI first (Gemini/OpenRouter via ai-real.js)
    if (window.TaxMitraAI && typeof window.TaxMitraAI.callGemini === 'function') {
      const result = await window.TaxMitraAI.callGemini(msg, 'general', 'hi', _afwHistory.slice(-4));
      if (result && result.text && result.text.length > 10) {
        aiText = result.text;
      }
    }
    // Fallback to local rule-based (comprehensive engine in ai-real.js)
    if (!aiText) {
      if (window.TaxMitraAI && typeof window.TaxMitraAI.getRuleBasedResponse === 'function') {
        aiText = window.TaxMitraAI.getRuleBasedResponse(msg, 'hi', 'general');
      } else {
        aiText = getAIResponse(msg);
      }
    }
  } catch(err) {
    console.warn('[AFW]', err.message);
    // Use comprehensive rule-based on any error
    try {
      aiText = window.TaxMitraAI?.getRuleBasedResponse(msg, 'hi', 'general') || getAIResponse(msg);
    } catch(e2) {
      aiText = getAIResponse(msg);
    }
  }

  const t = document.getElementById('afwTyping');
  if (t) t.remove();
  appendAfwMsg(aiText, false);
  _afwHistory.push({ role: 'assistant', content: aiText });
  // Keep history trim
  if (_afwHistory.length > 20) _afwHistory.splice(0, 2);
}

function appendAfwMsg(text, isUser) {
  const msgs = document.getElementById('afwMessages');
  if (!msgs) return;
  const div = document.createElement('div');
  div.className = 'afw-msg ' + (isUser ? 'user' : 'bot');
  // Sanitize and format text
  const safe = text.replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/`(.*?)`/g, '<code>$1</code>')
    .replace(/[\n]/g, '<br>');
  div.innerHTML = (isUser ? '' : '<div class="afw-msg-avatar">🤖</div>') +
    '<div class="afw-msg-text">' + safe + '</div>' +
    (isUser ? '<div class="afw-msg-avatar">👤</div>' : '');
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

function askQuick(msg) {
  const win = document.getElementById('aiFloatWindow');
  if (win) win.classList.add('show');
  sendAfwMsg(msg);
}

window.sendAfwMsg = sendAfwMsg;
window.askQuick = askQuick;
window.appendAfwMsg = appendAfwMsg;

// ── Toast ─────────────────────────────────────────────────────
function showToast(msg, type = 'success') {
  // Auto-create container if missing (works on ALL pages)
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.cssText = 'position:fixed;bottom:1.5rem;right:1.5rem;z-index:9999;display:flex;flex-direction:column;gap:.4rem;pointer-events:none;max-width:380px';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.style.cssText = 'pointer-events:auto;cursor:pointer';
  toast.textContent = msg;
  toast.onclick = () => toast.remove();
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(24px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ── Intersection observer animations ─────────────────────────
// Animate cards on scroll (safe for all pages)
(function initAnimations() {
  const animEl = document.querySelectorAll('.module-card,.audience-card,.due-date-card,.tech-card,.testimonial-card,.guide-card,.kb-card');
  if (!animEl.length) return;
  const style = document.createElement('style');
  style.textContent = '.animate-in{opacity:1!important;transform:none!important}';
  document.head.appendChild(style);
  const animObs = new IntersectionObserver(entries => {
    entries.forEach(e => { if (e.isIntersecting) { e.target.classList.add('animate-in'); animObs.unobserve(e.target); } });
  }, { threshold: 0.08 });
  animEl.forEach(el => {
    el.style.cssText += ';opacity:0;transform:translateY(16px);transition:opacity .45s ease,transform .45s ease';
    animObs.observe(el);
  });
})();

// ── PWA + Keyboard shortcuts ──────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register(location.pathname.includes('/ITR-AND-GST/') ? '/ITR-AND-GST/sw.js' : '/sw.js').catch(() => {});
}
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); navSearchBar?.classList.toggle('show'); document.getElementById('globalSearch')?.focus(); }
  if (e.key === 'Escape') { aiFloatWin?.classList.remove('show'); navSearchBar?.classList.remove('show'); navWrapper?.classList.remove('show'); }
});

// ── Welcome toast ─────────────────────────────────────────────
setTimeout(() => showToast('🎉 TaxMitra AI Enterprise mein aapka swagat hai!'), 1500);

console.log('%c⚡ TaxMitra AI Enterprise', 'color:#1e40af;font-size:18px;font-weight:900;');
console.log('%cDeveloped by Abhishek Agrahari', 'color:#8b5cf6;font-size:11px;');

// ── Global Auto Date/AY Updater ───────────────────────────────────
(function autoUpdateGlobalDates() {
  const today = new Date();
  const month = today.getMonth() + 1;
  const year = today.getFullYear();
  const fyStart = month >= 4 ? year : year - 1;
  const fy = `${fyStart}-${String(fyStart+1).slice(2)}`;
  const ay = `${fyStart+1}-${String(fyStart+2).slice(2)}`;
  const ayYear = fyStart + 1;
  const dueDate = new Date(ayYear, 6, 31); // 31 July of AY year
  const daysLeft = Math.ceil((dueDate - today) / 86400000);
  const todayStr = today.toLocaleDateString('en-IN', { day:'2-digit', month:'long', year:'numeric' });

  // Expose globally for other scripts
  window.TAXMITRA_DATES = { today, todayStr, fy, ay, fyStart, ayYear, daysLeft };

  // Update any element with data-auto-date attribute
  document.querySelectorAll('[data-auto-ay]').forEach(el => { el.textContent = ay; });
  document.querySelectorAll('[data-auto-fy]').forEach(el => { el.textContent = fy; });
  document.querySelectorAll('[data-auto-date]').forEach(el => { el.textContent = todayStr; });
  document.querySelectorAll('[data-auto-days-left]').forEach(el => {
    el.textContent = daysLeft > 0 ? `${daysLeft} days remaining` : 'Deadline passed';
    el.style.color = daysLeft < 10 ? 'var(--danger)' : daysLeft < 30 ? '#f59e0b' : 'var(--success)';
  });

  // Update title tags that contain old AY
  document.querySelectorAll('title').forEach(el => {
    el.textContent = el.textContent.replace(/AY \d{4}-\d{2,4}/g, `AY ${ay}`);
  });
})();

// ── TaxMitra Key Management (Global API) ─────────────────────────
window.TaxMitra = {
  setKeys: function(keys) {
    const existing = JSON.parse(localStorage.getItem('tm_keys') || '{}');
    const updated = { ...existing, ...keys };
    const set = [];
    const warnings = [];

    // Validate Gemini key format (old: AIzaSy... | new 2026: AQ....)
    if (keys.geminiApiKey) {
      if ((keys.geminiApiKey.startsWith('AIzaSy') || keys.geminiApiKey.startsWith('AQ.')) && keys.geminiApiKey.length > 20) {
        set.push('Gemini 2.5 Flash ✅');
      } else {
        warnings.push('⚠️ Gemini key invalid! Must start with "AIzaSy". Get from: aistudio.google.com');
        console.warn('%c⚠️ Invalid Gemini Key! Gemini keys start with "AIzaSy" (39 chars). Your key: ' + keys.geminiApiKey.substring(0, 8) + '...', 'color:#dc2626;font-weight:700;font-size:13px');
        console.warn('%c👉 Get correct key: https://aistudio.google.com/app/apikey', 'color:#dc2626;font-size:12px');
      }
    }
    if (keys.openrouterApiKey) {
      if (keys.openrouterApiKey.startsWith('sk-or-') && keys.openrouterApiKey.length > 20) {
        set.push('OpenRouter ✅');
      } else {
        warnings.push('⚠️ OpenRouter key should start with "sk-or-". Get from: openrouter.ai/keys');
        console.warn('%c⚠️ OpenRouter key format unusual. Expected "sk-or-..." prefix.', 'color:#f59e0b;font-size:12px');
      }
    }

    // Save to BOTH localStorage AND sessionStorage for resilience
    localStorage.setItem('tm_keys', JSON.stringify(updated));
    sessionStorage.setItem('tm_keys', JSON.stringify(updated));

    if (set.length > 0) {
      console.log('%c✅ TaxMitra Keys Set: ' + set.join(', '), 'color:#059669;font-weight:700;font-size:13px');
      console.log('%cReload page to activate AI', 'color:#6b7280;font-size:11px');
    }
    warnings.forEach(w => console.warn(w));
    if (typeof showToast === 'function') {
      if (set.length > 0) showToast('API Keys saved! ' + set.join(', '), 'success');
      else if (warnings.length > 0) showToast('Key format error — check console!', 'error');
    }
    return updated;
  },

  checkKeys: function() {
    const keys = JSON.parse(localStorage.getItem('tm_keys') || '{}');
    const gemini = keys.geminiApiKey || '';
    const openrouter = keys.openrouterApiKey || '';
    // Gemini key format: old=AIzaSy... | new 2026=AQ....
    const gOk = gemini && (gemini.startsWith('AIzaSy') || gemini.startsWith('AQ.')) && gemini.length > 20;
    const gWrong = gemini && !gemini.startsWith('AIzaSy') && !gemini.startsWith('AQ.'); // set but wrong format
    const oOk = openrouter && openrouter.length > 10 && !openrouter.includes('XXX');
    console.group('%c⚡ TaxMitra AI Key Status (v3.1 — July 2026)', 'color:#1e40af;font-weight:900;font-size:14px');
    if (gWrong) {
      console.log('%c🔑 Gemini API: ❌ WRONG FORMAT! Key must start with "AIzaSy" (old) or "AQ." (new 2026)', 'color:#dc2626;font-weight:700');
      console.log('%c   Your key starts with: ' + gemini.substring(0, 8) + '...', 'color:#dc2626');
      console.log('%c   👉 Get correct key: https://aistudio.google.com/app/apikey', 'color:#dc2626');
    } else {
      console.log('%c🔑 Gemini API:     ' + (gOk ? '✅ Active (Gemini 2.5 Flash)' : '❌ Not set'), gOk ? 'color:#059669' : 'color:#dc2626');
    }
    console.log('%c🔑 OpenRouter API: ' + (oOk ? '✅ Active' : '❌ Not set (optional)'), oOk ? 'color:#059669' : 'color:#f59e0b');
    console.log('%c📊 AI Models available:', 'color:#7c3aed');
    if (gOk)  console.log('   → Gemini 2.5 Flash (OCR + General advice) — Updated from retired 1.5/2.0');
    if (oOk) { console.log('   → DeepSeek R1 free (Notice + Complex reasoning)'); console.log('   → Llama 3.3 70B free (Hindi tips + Investment advice)'); }
    if (!gOk && !oOk) console.log('%c   No AI keys → Rule-based fallback active', 'color:#f59e0b');
    console.log('%c💡 Set: TaxMitra.setKeys({geminiApiKey:"AIzaSy...", openrouterApiKey:"sk-or-..."})', 'color:#6b7280;font-size:10px');
    console.log('%c🆓 Free Gemini key: https://aistudio.google.com/app/apikey', 'color:#059669;font-size:10px');
    console.log('%c🆓 Free OpenRouter: https://openrouter.ai/keys', 'color:#059669;font-size:10px');
    console.groupEnd();
    return { gemini: gOk, geminiWrongFormat: gWrong, openrouter: oOk, activeModel: gOk ? 'Gemini 2.5 Flash' : oOk ? 'Llama 3.3 70B' : 'Rule-based' };
  },

  clearKeys: function() {
    localStorage.removeItem('tm_keys');
    sessionStorage.removeItem('tm_keys');
    console.log('%c🗑️ TaxMitra keys cleared', 'color:#dc2626;font-weight:700');
    return true;
  },

  // ── Cloudflare Worker Proxy ──────────────────────────────────
  setProxy: function(proxyUrl) {
    if (!proxyUrl) {
      localStorage.removeItem('tm_proxy_url');
      if (window.TAXMITRA_PROXY) window.TAXMITRA_PROXY.enabled = false;
      console.log('%c🔗 Proxy cleared', 'color:#dc2626;font-weight:700');
      return;
    }
    // Validate URL
    try { new URL(proxyUrl); } catch { console.error('Invalid proxy URL:', proxyUrl); return; }
    localStorage.setItem('tm_proxy_url', proxyUrl);
    if (window.TAXMITRA_PROXY) {
      window.TAXMITRA_PROXY.url = proxyUrl;
      window.TAXMITRA_PROXY.enabled = true;
    }
    console.log('%c✅ Proxy set: ' + proxyUrl, 'color:#059669;font-weight:700;font-size:13px');
    console.log('%cTest: TaxMitra.testProxy()', 'color:#6b7280;font-size:10px');
    if (typeof showToast === 'function') showToast('🔗 Proxy configured!', 'success');
    return proxyUrl;
  },

  testProxy: async function() {
    if (!window.TAXMITRA_PROXY?.url) {
      console.warn('No proxy URL set. Use: TaxMitra.setProxy("https://...")');
      return false;
    }
    return await window.TAXMITRA_PROXY.test();
  },

  // Model info
  models: {
    gemini: { name: 'Gemini 1.5 Flash', use: 'OCR, General advice, Document analysis', free: true, tier: 'Free (15 req/min)' },
    deepseek: { name: 'DeepSeek R1', use: 'IT Notice explainer, Complex tax reasoning', free: true, tier: 'Free via OpenRouter' },
    llama: { name: 'Llama 3.3 70B', use: 'Hindi tips, Investment advice, Tax planning', free: true, tier: 'Free via OpenRouter' },
  },

  // Privacy helper
  maskData: function(text) {
    return window.TaxMitraAI?.maskSensitiveData(text) || text;
  },

  version: '3.0 — Multi-Model AI (Gemini + DeepSeek + Llama)',
  developer: 'Abhishek Agrahari | Lucknow, UP',
};

// Key setup guide handled by firebase-config.js

// ══════════════════════════════════════════════════════════════
// QUICK WINS — All Roadmap Features | Developer: Abhishek Agrahari
// ══════════════════════════════════════════════════════════════

// ── 1. KEYBOARD SHORTCUTS ─────────────────────────────────────
(function initKeyboardShortcuts() {
  const shortcuts = {
    'k':     () => { document.getElementById('searchToggle')?.click(); document.getElementById('globalSearch')?.focus(); },
    'd':     () => { const win=document.getElementById('aiFloatWindow'); if(win) win.classList.toggle('show'); },
    'h':     () => window.location.href = (location.pathname.includes('/pages/') ? '../' : '') + 'index.html',
    'c':     () => navigateTo('pages/calculators.html'),
    'g':     () => navigateTo('pages/gst.html'),
    'i':     () => navigateTo('pages/itr-center.html'),
    't':     () => navigateTo('pages/computation.html'),
    'a':     () => navigateTo('pages/ai-assistant.html'),
    'p':     () => window.print(),
    'e':     () => window.TaxMitra?.exportBackup && window.TaxMitra.exportBackup(),
    'Escape':() => { document.getElementById('aiFloatWindow')?.classList.remove('show'); document.getElementById('navLinksWrapper')?.classList.remove('show'); },
  };
  function navigateTo(path) {
    const base = location.pathname.includes('/pages/') ? '../' : '';
    window.location.href = base + path;
  }
  document.addEventListener('keydown', e => {
    if (['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) return;
    if (e.ctrlKey || e.metaKey) {
      if (shortcuts[e.key]) { e.preventDefault(); shortcuts[e.key](); }
      return;
    }
    if (e.key === 'Escape') shortcuts['Escape']();
  });
  // Show keyboard shortcut hint on first visit
  if (!localStorage.getItem('tm_kb_hint_shown')) {
    setTimeout(() => {
      if (typeof showToast === 'function') showToast('⌨️ Keyboard shortcuts: Ctrl+K search, Ctrl+D AI, Ctrl+H home', 'info');
      localStorage.setItem('tm_kb_hint_shown', '1');
    }, 3000);
  }
})();

// ── 2. CONFETTI ANIMATION ─────────────────────────────────────
function launchConfetti(duration = 2500) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:99999';
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  const particles = Array.from({length: 120}, () => ({
    x: Math.random() * canvas.width,
    y: Math.random() * canvas.height - canvas.height,
    r: Math.random() * 7 + 4,
    d: Math.random() * 30 + 15,
    color: ['#2563eb','#7c3aed','#059669','#f59e0b','#dc2626','#06b6d4','#ec4899'][Math.floor(Math.random()*7)],
    tilt: Math.floor(Math.random() * 10) - 10,
    tiltAngle: 0, tiltSpeed: Math.random() * 0.07 + 0.05
  }));
  let angle = 0, frame;
  function draw() {
    ctx.clearRect(0,0,canvas.width,canvas.height);
    angle += 0.01;
    particles.forEach((p,i) => {
      p.tiltAngle += p.tiltSpeed;
      p.y += (Math.cos(angle + p.d) + 3 + p.r/2) * 1.2;
      p.x += Math.sin(angle) * 1.5;
      p.tilt = Math.sin(p.tiltAngle - i/3) * 12;
      ctx.beginPath();
      ctx.lineWidth = p.r/2;
      ctx.strokeStyle = p.color;
      ctx.moveTo(p.x + p.tilt + p.r/4, p.y);
      ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r/4);
      ctx.stroke();
    });
    frame = requestAnimationFrame(draw);
  }
  draw();
  setTimeout(() => { cancelAnimationFrame(frame); canvas.remove(); }, duration);
}
window.launchConfetti = launchConfetti;

// ── 3. SHAREABLE REPORT LINKS ─────────────────────────────────
window.TaxMitraShare = {
  // Encode current computation/ITR data into URL params (non-sensitive)
  generateLink: function(data) {
    try {
      const safeData = {
        gross: data.gross || 0,
        regime: data.regime || 'new',
        tax: data.tax || 0,
        ay: data.ay || '2026-27',
        v: 1
      };
      const encoded = btoa(JSON.stringify(safeData));
      const base = window.location.origin + window.location.pathname.split('/pages/')[0];
      const url = base + '/pages/computation.html?share=' + encoded;
      navigator.clipboard.writeText(url).then(() => {
        if (typeof showToast === 'function') showToast('🔗 Link copied to clipboard!', 'success');
      }).catch(() => prompt('Copy this link:', url));
      return url;
    } catch { return null; }
  },
  // Read shared link data
  readLink: function() {
    const params = new URLSearchParams(window.location.search);
    const share = params.get('share');
    if (!share) return null;
    try { return JSON.parse(atob(share)); }
    catch { return null; }
  }
};

// Auto-read shared link on computation page
if (window.location.search.includes('share=')) {
  const shared = window.TaxMitraShare.readLink();
  if (shared) {
    setTimeout(() => {
      if (typeof showToast === 'function') showToast('🔗 Shared computation loaded! Regime: ' + (shared.regime==='new'?'New':'Old') + ' | Gross: ₹' + (shared.gross||0).toLocaleString('en-IN'), 'info');
    }, 1000);
  }
}

// ── 4. COMPARISON HISTORY ─────────────────────────────────────
window.TaxMitraHistory = {
  save: function(type, data, label) {
    const hist = JSON.parse(localStorage.getItem('tm_compare_history') || '[]');
    hist.unshift({
      type,
      data,
      label: label || (new Date().toLocaleDateString('en-IN') + ' — ' + type),
      savedAt: Date.now()
    });
    localStorage.setItem('tm_compare_history', JSON.stringify(hist.slice(0, 20)));
  },
  getAll: function() {
    return JSON.parse(localStorage.getItem('tm_compare_history') || '[]');
  },
  clear: function() {
    localStorage.removeItem('tm_compare_history');
  }
};

// ── 5. XLSX EXPORT (SheetJS via CDN) ──────────────────────────
window.TaxMitraXLSX = {
  // Dynamically load SheetJS when needed
  _loaded: false,
  load: function() {
    if (this._loaded || typeof XLSX !== 'undefined') { this._loaded = true; return Promise.resolve(); }
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
      s.onload = () => { this._loaded = true; resolve(); };
      s.onerror = reject;
      document.head.appendChild(s);
    });
  },
  // Export any data array to xlsx
  exportToXLSX: async function(data, filename, sheetName) {
    await this.load();
    try {
      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, sheetName || 'TaxMitra');
      // Auto column width
      const cols = Object.keys(data[0] || {}).map(k => ({wch: Math.max(k.length, 12)}));
      ws['!cols'] = cols;
      XLSX.writeFile(wb, (filename || 'TaxMitra_Export') + '.xlsx');
      if (typeof showToast === 'function') showToast('📊 XLSX downloaded!', 'success');
      return true;
    } catch(e) {
      console.error('XLSX export error:', e);
      if (typeof showToast === 'function') showToast('XLSX export failed — try CSV', 'error');
      return false;
    }
  },
  // Export computation data
  exportComputationXLSX: async function(r) {
    if (!r) { if (typeof showToast === 'function') showToast('Compute first!', 'warning'); return; }
    const data = [
      { 'Particulars': 'Assessment Year', 'Amount (₹)': r.ay || '2026-27' },
      { 'Particulars': 'Tax Regime', 'Amount (₹)': r.regime === 'new' ? 'New Regime' : 'Old Regime' },
      { 'Particulars': 'Gross Salary', 'Amount (₹)': r.grossSal || 0 },
      { 'Particulars': 'HRA Exemption', 'Amount (₹)': r.hraExempt || 0 },
      { 'Particulars': 'Standard Deduction', 'Amount (₹)': r.stdDed || 0 },
      { 'Particulars': 'Net Taxable Income', 'Amount (₹)': r.totalIncome || 0 },
      { 'Particulars': 'Income Tax', 'Amount (₹)': r.taxOnIncome || 0 },
      { 'Particulars': 'Surcharge', 'Amount (₹)': r.surcharge || 0 },
      { 'Particulars': '4% Cess', 'Amount (₹)': r.cess || 0 },
      { 'Particulars': '87A Rebate', 'Amount (₹)': r.rebate || 0 },
      { 'Particulars': 'Total Tax', 'Amount (₹)': r.totalTax || 0 },
      { 'Particulars': 'TDS Deducted', 'Amount (₹)': r.tdsTotal || 0 },
      { 'Particulars': 'Tax Payable / Refund', 'Amount (₹)': r.netPayable || 0 },
    ];
    await this.exportToXLSX(data, 'TaxMitra_Computation_' + (r.ay||'2026-27'), 'Tax Computation');
  },
  // Export accounting transactions
  exportAccountingXLSX: async function() {
    const txns = JSON.parse(localStorage.getItem('tm_accounting_txns') || '[]');
    if (!txns.length) { if (typeof showToast === 'function') showToast('No transactions to export!', 'warning'); return; }
    await this.exportToXLSX(txns.map(t => ({
      'Date': t.date || '', 'Description': t.desc || '', 'Amount (₹)': t.amount || 0,
      'Type': t.type || '', 'Category': t.category || ''
    })), 'TaxMitra_Accounting', 'Transactions');
  },
  // Export ITR data
  exportITRXLSX: async function(formNum) {
    const d = JSON.parse(localStorage.getItem('itr_draft_'+(formNum||'1')) || '{}');
    if (!Object.keys(d).length) { if (typeof showToast === 'function') showToast('No ITR data to export!', 'warning'); return; }
    const rows = Object.entries(d).filter(([k])=>!k.startsWith('_')).map(([k,v]) => ({'Field': k, 'Value': v}));
    await this.exportToXLSX(rows, 'TaxMitra_ITR'+formNum+'_Draft', 'ITR Data');
  }
};
window.exportXLSX = (data, name, sheet) => window.TaxMitraXLSX.exportToXLSX(data, name, sheet);

// ── 6. PWA INSTALL PROMPT ─────────────────────────────────────
let _pwaPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  _pwaPrompt = e;
  // Show install button if element exists
  const installBtns = document.querySelectorAll('.pwa-install-btn, #pwaInstall');
  installBtns.forEach(btn => { btn.style.display = 'flex'; });
  // Show toast after 5s
  setTimeout(() => {
    if (typeof showToast === 'function') showToast('📱 TaxMitra install kar sakte ho — "Install App" button click karo!', 'info');
  }, 5000);
});
window.installPWA = function() {
  if (_pwaPrompt) {
    _pwaPrompt.prompt();
    _pwaPrompt.userChoice.then(r => {
      if (r.outcome === 'accepted') {
        if (typeof showToast === 'function') showToast('✅ TaxMitra installed!', 'success');
        if (typeof launchConfetti === 'function') launchConfetti(2000);
      }
      _pwaPrompt = null;
    });
  } else {
    if (typeof showToast === 'function') showToast('Browser install prompt not available — use browser menu "Add to Home Screen"', 'info');
  }
};
window.addEventListener('appinstalled', () => {
  if (typeof showToast === 'function') showToast('✅ TaxMitra successfully installed!', 'success');
  if (typeof launchConfetti === 'function') launchConfetti();
});

// ── 7. FULL BACKUP EXPORT (quick access) ──────────────────────
window.TaxMitra.exportBackup = function() {
  const backup = { _meta: { version:'2.1', exportedAt:new Date().toISOString(), by:'TaxMitra AI Enterprise — Abhishek Agrahari' }, data:{} };
  for (let k in localStorage) {
    if (localStorage.hasOwnProperty(k)) {
      try { backup.data[k] = JSON.parse(localStorage.getItem(k)); }
      catch { backup.data[k] = localStorage.getItem(k); }
    }
  }
  const blob = new Blob([JSON.stringify(backup,null,2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'TaxMitra_Backup_'+new Date().toISOString().slice(0,10)+'.json'; a.click();
  if (typeof showToast==='function') showToast('💾 Full backup exported!','success');
};

// ── 8. ACTIVITY TRACKER (auto-log page visits) ────────────────
(function trackActivity() {
  const page = document.title.replace(' – TaxMitra AI Enterprise','').replace('TaxMitra AI Enterprise – ','');
  if (!page || page.includes('TaxMitra AI Enterprise')) return;
  const activity = JSON.parse(localStorage.getItem('tm_activity') || '[]');
  const entry = { page, url: location.pathname.split('/').pop(), time: Date.now(), ts: new Date().toLocaleTimeString('en-IN') };
  activity.unshift(entry);
  localStorage.setItem('tm_activity', JSON.stringify(activity.slice(0, 50)));
})();

// ── 9. PRINT-FRIENDLY enhancement ────────────────────────────
window.printPage = function(title) {
  const t = document.title;
  if (title) document.title = title + ' — TaxMitra';
  window.print();
  if (title) document.title = t;
};

// ── 10. NOTIFICATION / COMPLIANCE REMINDERS ──────────────────
window.TaxMitraNotify = {
  _supported: 'Notification' in window,
  requestPermission: async function() {
    if (!this._supported) return false;
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  },
  sendReminder: function(title, body, url) {
    if (!this._supported || Notification.permission !== 'granted') return;
    const n = new Notification(title, {
      body, icon: '/ITR-AND-GST/manifest.json',
      badge: '/ITR-AND-GST/manifest.json', tag: 'taxmitra-reminder'
    });
    if (url) n.onclick = () => { window.open(url,'_blank'); n.close(); };
  },
  scheduleCheck: function() {
    // Check compliance deadlines
    const today = new Date();
    const alerts = [
      { date: new Date(today.getFullYear(),6,31), title:'⚠️ ITR Due Today!', body:'31 July — ITR filing deadline! File now.', url:'/ITR-AND-GST/pages/itr-center.html' },
      { date: new Date(today.getFullYear(),6,28), title:'📅 ITR Due in 3 Days!', body:'File ITR by 31 July to avoid ₹5,000 penalty', url:'/ITR-AND-GST/pages/itr-center.html' },
      { date: new Date(today.getFullYear(),1,14), title:'📅 Advance Tax Q4', body:'15 March — Pay 100% advance tax before deadline', url:'/ITR-AND-GST/pages/calculators.html#advance-tax' },
    ];
    alerts.forEach(a => {
      const diff = Math.ceil((a.date-today)/86400000);
      if (diff >= 0 && diff <= 3) this.sendReminder(a.title, a.body, a.url);
    });
  }
};
// Check on load (if permission already granted)
if ('Notification' in window && Notification.permission === 'granted') {
  setTimeout(() => window.TaxMitraNotify.scheduleCheck(), 2000);
}

// ── 11. TAX TIPS NEWSLETTER (rotating daily tips) ─────────────
window.TaxMitraTips = {
  tips: [
    '💡 New Regime mein ₹12.75L tak ZERO TAX — Standard Deduction ₹75K + Rebate 87A ₹60K',
    '💡 80CCD(2) employer NPS — New Regime mein bhi milta hai! Best deduction in new regime.',
    '💡 Form 26AS aur AIS hamesha match karein before filing — mismatch = notice!',
    '💡 LTCG Equity: ₹1.25L tak tax-free. Har saal ₹1.25L redeem karke re-invest karo (harvesting)',
    '💡 HRA: Monthly rent receipt rakhein. ₹8,333+ monthly rent = Landlord PAN mandatory',
    '💡 Advance Tax: Tax > ₹10,000 hai to quarterly pay karo — 234B/C interest bachao',
    '💡 ITR-U (Updated Return): Galti ho gayi? 2 saal tak correct kar sakte ho — additional tax ke saath',
    '💡 GST GSTR-1 deadline: 11th of next month. Late fee ₹50/day (max ₹10,000)',
    '💡 Section 44ADA: Professional (doctor, CA, lawyer) ₹75L tak 50% presumptive income — easy filing',
    '💡 NPS: 80CCD(1B) mein ₹50,000 extra deduction — old regime mein 80C ke upar!',
    '💡 Home Loan: Interest u/s 24(b) ₹2L deduction + Principal 80C mein — double benefit old regime',
    '💡 Old vs New: Break-even deductions ≈ ₹3.75L. Isse zyada deductions → Old Regime better',
  ],
  getDailyTip: function() {
    const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(),0,0)) / 86400000);
    return this.tips[dayOfYear % this.tips.length];
  },
  showTip: function() {
    const tip = this.getDailyTip();
    const lastShown = localStorage.getItem('tm_tip_date');
    const today = new Date().toDateString();
    if (lastShown === today) return; // Show once per day
    setTimeout(() => {
      if (typeof showToast==='function') {
        const div = document.createElement('div');
        div.style.cssText = 'position:fixed;bottom:1.5rem;left:1rem;right:1rem;max-width:420px;background:linear-gradient(135deg,#1e40af,#7c3aed);color:#fff;padding:.85rem 1.1rem;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.25);z-index:9990;font-size:.82rem;line-height:1.5;animation:toastIn .3s ease';
        div.innerHTML = '<div style="font-weight:700;margin-bottom:.3rem;font-size:.75rem;opacity:.8">💡 Tax Tip of the Day</div>' + tip +
          '<button onclick="this.parentElement.remove()" style="position:absolute;top:.4rem;right:.6rem;background:none;border:none;color:#fff;cursor:pointer;opacity:.7;font-size:.9rem">✕</button>';
        div.style.position = 'fixed';
        document.body.appendChild(div);
        setTimeout(() => div?.remove(), 8000);
      }
      localStorage.setItem('tm_tip_date', today);
    }, 4000);
  }
};
window.TaxMitraTips.showTip();

// ── 12. PROGRESS BAR (filing progress) ───────────────────────
window.TaxMitraProgress = {
  getFilingProgress: function() {
    const itr = JSON.parse(localStorage.getItem('itr_draft_1') || '{}');
    const fields = ['firstName','grossSalary','tdsSalary','pan','dob','mobile','email','bankAccount'];
    const filled = fields.filter(f => itr[f]).length;
    return Math.round((filled / fields.length) * 100);
  },
  renderProgressBar: function(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const pct = this.getFilingProgress();
    el.innerHTML = `<div style="display:flex;align-items:center;gap:.65rem;font-size:.78rem">
      <span style="color:var(--text-secondary)">ITR Filing Progress</span>
      <div style="flex:1;height:8px;background:var(--bg-secondary);border-radius:4px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:${pct===100?'var(--success)':'var(--primary)'};border-radius:4px;transition:width 1s ease"></div>
      </div>
      <strong style="color:${pct===100?'var(--success)':'var(--primary)'}">${pct}%</strong>
    </div>`;
  }
};

// ── 13. SYSTEM PREFERENCE DARK MODE ──────────────────────────
if (!localStorage.getItem('tm-theme')) {
  // No preference saved — use system preference
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.body.classList.add('dark-mode');
    const tt = document.getElementById('themeToggle');
    if (tt) tt.textContent = '☀️';
  }
}
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
  if (!localStorage.getItem('tm-theme')) { // Only if user hasn't set preference
    document.body.classList.toggle('dark-mode', e.matches);
  }
});

// ── 14. ACCESSIBILITY HELPERS ─────────────────────────────────
// Skip to main content
if (!document.querySelector('#skip-to-main') && document.body) {
  const skip = document.createElement('a');
  skip.id = 'skip-to-main'; skip.href = '#main-content';
  skip.textContent = 'Skip to main content';
  skip.style.cssText = 'position:absolute;top:-40px;left:0;background:var(--primary);color:#fff;padding:.5rem 1rem;border-radius:4px;z-index:10000;font-size:.875rem;transition:top .2s';
  skip.addEventListener('focus', () => skip.style.top = '0');
  skip.addEventListener('blur', () => skip.style.top = '-40px');
  document.body.insertBefore(skip, document.body.firstChild);
}

// ── 15. ERROR BOUNDARY ────────────────────────────────────────
window.addEventListener('error', e => {
  console.error('[TaxMitra] Uncaught error:', e.message, 'at', e.filename, e.lineno);
  // Don't show toast for minor errors
});
window.addEventListener('unhandledrejection', e => {
  console.warn('[TaxMitra] Unhandled promise rejection:', e.reason);
});

console.log('%c⚡ TaxMitra AI v3.1 — Quick Wins Active', 'color:#059669;font-weight:700;font-size:11px');
console.log('%c  Ctrl+K: Search | Ctrl+D: AI Chat | Ctrl+H: Home | Ctrl+C: Calculator', 'color:#64748b;font-size:10px');

// ══════════════════════════════════════════════════════════════
// MULTI-LANGUAGE SUPPORT v2.0 — Tamil, Telugu, Bengali, Marathi + Hi, En
// Developer: Abhishek Agrahari | TaxMitra AI Enterprise
// ══════════════════════════════════════════════════════════════

window.TaxMitraLang = {
  current: localStorage.getItem('tm_lang') || 'hi',
  
  strings: {
    en: {
      heroTitle: 'TaxMitra\nAI Enterprise',
      heroSub: "India's first All-In-One AI Tax Ecosystem — ITR Filing, GST Suite, TDS, Payroll, Investment Planning and 100+ Professional Tools — all at one place.",
      zeroTax: 'Budget 2025: Zero Tax upto ₹12.75L | 87A Rebate ₹60,000 | Fully Updated',
      fileITR: 'File ITR Now',
      openAI: 'Open AI Assistant',
      newRegime: 'New Regime (Default)',
      oldRegime: 'Old Regime',
      deadline: 'AY 2026-27 Deadline: 31 July 2026',
      copyright: 'Developed by Abhishek Agrahari | TaxMitra AI Enterprise',
    },
    hi: {
      heroTitle: 'TaxMitra\nAI Enterprise',
      heroSub: 'India का पहला All-In-One AI Tax Ecosystem — ITR Filing, GST Suite, TDS, Payroll, Investment Planning और 100+ Professional Tools — सब एक जगह।',
      zeroTax: 'Budget 2025: ₹12.75L तक ZERO TAX | 87A Rebate ₹60,000 | पूरी तरह अपडेट',
      fileITR: 'ITR अभी भरें',
      openAI: 'AI Assistant खोलें',
      newRegime: 'नई व्यवस्था (डिफ़ॉल्ट)',
      oldRegime: 'पुरानी व्यवस्था',
      deadline: 'AY 2026-27 अंतिम तिथि: 31 जुलाई 2026',
      copyright: 'विकसित by अभिषेक अग्रहरि | TaxMitra AI Enterprise',
    },
    ta: {
      heroTitle: 'TaxMitra\nAI Enterprise',
      heroSub: 'இந்தியாவின் முதல் All-In-One AI வரி தளம் — ITR தாக்கல், GST Suite, TDS, சம்பளம், முதலீட்டு திட்டமிடல் மற்றும் 100+ தொழில்முறை கருவிகள்.',
      zeroTax: 'Budget 2025: ₹12.75L வரை ZERO TAX | 87A Rebate ₹60,000',
      fileITR: 'ITR தாக்கல் செய்யுங்கள்',
      openAI: 'AI உதவியாளர் திற',
      newRegime: 'புதிய ஆட்சி (இயல்புநிலை)',
      oldRegime: 'பழைய ஆட்சி',
      deadline: 'AY 2026-27 கடைசி தேதி: 31 ஜூலை 2026',
      copyright: 'உருவாக்கியவர்: Abhishek Agrahari | TaxMitra AI Enterprise',
    },
    te: {
      heroTitle: 'TaxMitra\nAI Enterprise',
      heroSub: 'భారతదేశపు మొదటి All-In-One AI పన్ను వేదిక — ITR ఫైలింగ్, GST Suite, TDS, జీతం, పెట్టుబడి ప్రణాళిక మరియు 100+ వృత్తిపరమైన సాధనాలు.',
      zeroTax: 'Budget 2025: ₹12.75L వరకు ZERO TAX | 87A Rebate ₹60,000',
      fileITR: 'ITR ఇప్పుడే దాఖలు చేయండి',
      openAI: 'AI సహాయకుడిని తెరవండి',
      newRegime: 'కొత్త పాలన (డిఫాల్ట్)',
      oldRegime: 'పాత పాలన',
      deadline: 'AY 2026-27 చివరి తేదీ: 31 జూలై 2026',
      copyright: 'అభివృద్ధి: Abhishek Agrahari | TaxMitra AI Enterprise',
    },
    bn: {
      heroTitle: 'TaxMitra\nAI Enterprise',
      heroSub: 'ভারতের প্রথম All-In-One AI ট্যাক্স প্ল্যাটফর্ম — ITR ফাইলিং, GST Suite, TDS, বেতন, বিনিয়োগ পরিকল্পনা এবং ১০০+ পেশাদার সরঞ্জাম।',
      zeroTax: 'Budget 2025: ₹12.75L পর্যন্ত ZERO TAX | 87A Rebate ₹60,000',
      fileITR: 'এখনই ITR দাখিল করুন',
      openAI: 'AI সহকারী খুলুন',
      newRegime: 'নতুন ব্যবস্থা (ডিফল্ট)',
      oldRegime: 'পুরনো ব্যবস্থা',
      deadline: 'AY 2026-27 শেষ তারিখ: ৩১ জুলাই ২০২৬',
      copyright: 'তৈরি: Abhishek Agrahari | TaxMitra AI Enterprise',
    },
    mr: {
      heroTitle: 'TaxMitra\nAI Enterprise',
      heroSub: 'भारताचे पहिले All-In-One AI कर व्यासपीठ — ITR भरणे, GST Suite, TDS, पगार, गुंतवणूक नियोजन आणि 100+ व्यावसायिक साधने.',
      zeroTax: 'Budget 2025: ₹12.75L पर्यंत ZERO TAX | 87A Rebate ₹60,000',
      fileITR: 'आत्ता ITR भरा',
      openAI: 'AI सहाय्यक उघडा',
      newRegime: 'नवीन व्यवस्था (डीफॉल्ट)',
      oldRegime: 'जुनी व्यवस्था',
      deadline: 'AY 2026-27 शेवटची तारीख: ३१ जुलै २०२६',
      copyright: 'विकसित: Abhishek Agrahari | TaxMitra AI Enterprise',
    },
  },

  get: function(key) {
    const lang = this.current;
    return (this.strings[lang] || this.strings['en'])[key] || this.strings['en'][key] || key;
  },

  setLang: function(lang) {
    if (!this.strings[lang]) return;
    this.current = lang;
    localStorage.setItem('tm_lang', lang);
    this.applyToPage();
    if (typeof showToast === 'function') {
      const names = {hi:'हिंदी',en:'English',ta:'தமிழ்',te:'తెలుగు',bn:'বাংলা',mr:'मराठी'};
      showToast('🌐 Language: ' + (names[lang]||lang), 'success');
    }
  },

  applyToPage: function() {
    // Update elements with data-lang-key attribute
    document.querySelectorAll('[data-lang-key]').forEach(el => {
      const key = el.getAttribute('data-lang-key');
      const text = this.get(key);
      if (text) el.textContent = text;
    });
    // Update html lang attribute
    document.documentElement.lang = this.current;
    // Update active button
    document.querySelectorAll('.lang-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.lang === this.current);
    });
  },

  renderSwitcher: function(containerId) {
    const el = document.getElementById(containerId);
    if (!el) return;
    const langs = [
      {code:'hi', name:'हिं', full:'हिंदी'},
      {code:'en', name:'En', full:'English'},
      {code:'ta', name:'த', full:'தமிழ்'},
      {code:'te', name:'తె', full:'తెలుగు'},
      {code:'bn', name:'বা', full:'বাংলা'},
      {code:'mr', name:'म', full:'मराठी'},
    ];
    el.innerHTML = `<div style="display:flex;gap:.3rem;flex-wrap:wrap;align-items:center">
      <span style="font-size:.72rem;color:var(--text-muted);margin-right:.2rem">🌐</span>
      ${langs.map(l => `<button class="lang-btn ${l.code===this.current?'active':''}" data-lang="${l.code}"
        onclick="window.TaxMitraLang.setLang('${l.code}')"
        title="${l.full}"
        style="padding:.2rem .5rem;border-radius:99px;font-size:.72rem;font-weight:700;border:1px solid var(--border);background:${l.code===this.current?'var(--primary)':'var(--bg-secondary)'};color:${l.code===this.current?'#fff':'var(--text-secondary)'};cursor:pointer;transition:.2s">${l.name}</button>`).join('')}
    </div>`;
  },

  // Inject language switcher into navbar on all pages
  injectIntoNavbar: function() {
    // Try to find nav-right or nav-container
    const navRight = document.querySelector('.nav-right');
    if (navRight && !document.getElementById('langSwitcherNav')) {
      const div = document.createElement('div');
      div.id = 'langSwitcherNav';
      div.style.cssText = 'display:flex;align-items:center';
      navRight.insertBefore(div, navRight.firstChild);
      this.renderSwitcher('langSwitcherNav');
    }
  },
};

// Init language on page load
document.addEventListener('DOMContentLoaded', () => {
  window.TaxMitraLang.applyToPage();
  // Don't auto-inject in navbar to avoid crowding — only if user has set non-default
  if (localStorage.getItem('tm_lang') && localStorage.getItem('tm_lang') !== 'hi') {
    window.TaxMitraLang.injectIntoNavbar();
  }
});

// Expose switchLang globally for onclick buttons
window.switchLang = function(lang) { window.TaxMitraLang.setLang(lang); };
window.TaxMitraLang.setLang(window.TaxMitraLang.current); // apply immediately
