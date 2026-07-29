/* ===================================================
   TaxMitra AI Enterprise – Master JavaScript
   =================================================== */

// ========== THEME ==========
const themeToggle = document.getElementById('themeToggle');
const body = document.body;
const savedTheme = localStorage.getItem('tm-theme') || 'light';
if (savedTheme === 'dark') { body.classList.add('dark-mode'); if(themeToggle) themeToggle.textContent = '☀️'; }
if (themeToggle) {
  themeToggle.addEventListener('click', () => {
    body.classList.toggle('dark-mode');
    const isDark = body.classList.contains('dark-mode');
    themeToggle.textContent = isDark ? '☀️' : '🌙';
    localStorage.setItem('tm-theme', isDark ? 'dark' : 'light');
  });
}

// ========== NAVBAR SCROLL ==========
const mainNav = document.getElementById('mainNav');
window.addEventListener('scroll', () => {
  if (mainNav) {
    mainNav.classList.toggle('scrolled', window.scrollY > 30);
  }
  const scrollTop = document.getElementById('scrollTop');
  if (scrollTop) scrollTop.classList.toggle('show', window.scrollY > 400);
});

// ========== HAMBURGER ==========
const hamburger = document.getElementById('hamburger');
const navWrapper = document.getElementById('navLinksWrapper');
if (hamburger && navWrapper) {
  hamburger.addEventListener('click', () => {
    navWrapper.classList.toggle('show');
    hamburger.classList.toggle('open');
  });
}

// ========== SEARCH ==========
const searchToggle = document.getElementById('searchToggle');
const navSearchBar = document.getElementById('navSearchBar');
const globalSearch = document.getElementById('globalSearch');
const searchResults = document.getElementById('searchResults');

const searchIndex = [
  { title: 'Income Tax Calculator', url: 'pages/calculators.html#income-tax', icon: '💰', tag: 'Calculator' },
  { title: 'HRA Calculator', url: 'pages/calculators.html#hra', icon: '🏠', tag: 'Calculator' },
  { title: 'Capital Gain Calculator', url: 'pages/calculators.html#capital-gain', icon: '📈', tag: 'Calculator' },
  { title: 'SIP Calculator', url: 'pages/calculators.html#sip', icon: '📊', tag: 'Calculator' },
  { title: 'EMI Calculator', url: 'pages/calculators.html#emi', icon: '🏡', tag: 'Calculator' },
  { title: 'PPF Calculator', url: 'pages/calculators.html#ppf', icon: '🏛️', tag: 'Calculator' },
  { title: 'Gratuity Calculator', url: 'pages/calculators.html#gratuity', icon: '🎖️', tag: 'Calculator' },
  { title: 'GST Calculator', url: 'pages/calculators.html#gst-calc', icon: '🧾', tag: 'GST' },
  { title: 'ITR-1 Filing', url: 'pages/itr-center.html#itr1', icon: '📋', tag: 'ITR' },
  { title: 'ITR-4 Sugam', url: 'pages/itr-center.html#itr4', icon: '📋', tag: 'ITR' },
  { title: 'GSTR-1 Filing', url: 'pages/gst.html#gstr1', icon: '📄', tag: 'GST' },
  { title: 'GSTR-3B', url: 'pages/gst.html#gstr3b', icon: '📄', tag: 'GST' },
  { title: 'GST Invoice Generator', url: 'pages/gst.html#invoice', icon: '🧾', tag: 'GST' },
  { title: 'Form 16 Generator', url: 'pages/tds-payroll.html#form16', icon: '📝', tag: 'TDS' },
  { title: 'Payslip Generator', url: 'pages/tds-payroll.html#payslip', icon: '💼', tag: 'Payroll' },
  { title: 'AI Tax Assistant', url: 'pages/ai-assistant.html', icon: '🤖', tag: 'AI' },
  { title: 'Investment Planner', url: 'pages/investment.html', icon: '📈', tag: 'Planning' },
  { title: 'Section 80C Deductions', url: 'pages/investment.html#80c', icon: '💡', tag: 'Tax Saving' },
  { title: 'AIS Analysis', url: 'pages/itr-center.html#ais', icon: '🔍', tag: 'ITR' },
  { title: 'Form 26AS', url: 'pages/itr-center.html#form26as', icon: '📄', tag: 'ITR' },
  { title: 'Compliance Calendar', url: 'pages/compliance.html', icon: '📅', tag: 'Compliance' },
  { title: 'Advance Tax Calculator', url: 'pages/calculators.html#advance-tax', icon: '📅', tag: 'Calculator' },
  { title: 'Old vs New Regime', url: 'pages/calculators.html#regime', icon: '⚖️', tag: 'Calculator' },
  { title: 'NPS Calculator', url: 'pages/calculators.html#nps', icon: '🧓', tag: 'Calculator' },
  { title: 'Knowledge Center', url: 'pages/knowledge.html', icon: '📚', tag: 'Knowledge' },
];

if (searchToggle && navSearchBar) {
  searchToggle.addEventListener('click', () => {
    navSearchBar.classList.toggle('show');
    if (navSearchBar.classList.contains('show') && globalSearch) globalSearch.focus();
  });
}
if (globalSearch && searchResults) {
  globalSearch.addEventListener('input', () => {
    const q = globalSearch.value.toLowerCase().trim();
    if (q.length < 2) { searchResults.classList.remove('show'); return; }
    const matches = searchIndex.filter(item =>
      item.title.toLowerCase().includes(q) || item.tag.toLowerCase().includes(q)
    ).slice(0, 8);
    if (!matches.length) { searchResults.classList.remove('show'); return; }
    searchResults.innerHTML = matches.map(m =>
      `<a href="${m.url}" class="search-result-item">
        <span>${m.icon}</span>
        <div><strong>${m.title}</strong></div>
        <span style="margin-left:auto;font-size:0.7rem;background:var(--bg-secondary);padding:0.15rem 0.5rem;border-radius:9999px;color:var(--text-muted)">${m.tag}</span>
      </a>`
    ).join('');
    searchResults.classList.add('show');
  });
  document.addEventListener('click', (e) => {
    if (!searchResults.contains(e.target) && e.target !== globalSearch) {
      searchResults.classList.remove('show');
    }
  });
}

// ========== SCROLL TO TOP ==========
const scrollTopBtn = document.getElementById('scrollTop');
if (scrollTopBtn) {
  scrollTopBtn.addEventListener('click', () => window.scrollTo({ top: 0, behavior: 'smooth' }));
}

// ========== COUNTER ANIMATION ==========
function animateCounters() {
  document.querySelectorAll('.stat-num').forEach(el => {
    const target = parseInt(el.dataset.target, 10);
    const duration = 1800;
    const step = target / (duration / 16);
    let current = 0;
    const timer = setInterval(() => {
      current += step;
      if (current >= target) { el.textContent = target.toLocaleString('en-IN'); clearInterval(timer); }
      else { el.textContent = Math.floor(current).toLocaleString('en-IN'); }
    }, 16);
  });
}
const heroSection = document.querySelector('.hero-section');
if (heroSection) {
  const obs = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) { animateCounters(); obs.disconnect(); }
  }, { threshold: 0.3 });
  obs.observe(heroSection);
}

// ========== CALC CATEGORY FILTER ==========
const calcCatBtns = document.querySelectorAll('.calc-cat-btn');
calcCatBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    calcCatBtns.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const cat = btn.dataset.cat;
    document.querySelectorAll('.calc-card').forEach(card => {
      if (cat === 'all' || card.dataset.cat === cat) card.classList.remove('hidden');
      else card.classList.add('hidden');
    });
  });
});

// ========== DUE DATES ==========
function populateDueDates() {
  const grid = document.getElementById('dueDatesGrid');
  if (!grid) return;
  const dates = [
    { type: 'GST', title: 'GSTR-3B Filing', date: '20 August 2025', urgency: 'warning' },
    { type: 'GST', title: 'GSTR-1 Filing', date: '11 August 2025', urgency: 'warning' },
    { type: 'Income Tax', title: 'ITR Filing (Non-Audit)', date: '31 July 2025', urgency: 'urgent' },
    { type: 'TDS', title: 'TDS Payment (Q1)', date: '7 August 2025', urgency: 'warning' },
    { type: 'TDS', title: 'Form 24Q / 26Q', date: '31 July 2025', urgency: 'urgent' },
    { type: 'Advance Tax', title: 'Advance Tax Q2', date: '15 September 2025', urgency: 'safe' },
    { type: 'GST', title: 'GSTR-9 Annual', date: '31 December 2025', urgency: 'safe' },
    { type: 'Income Tax', title: 'ITR Filing (Audit)', date: '31 October 2025', urgency: 'safe' },
  ];
  grid.innerHTML = dates.map(d => `
    <div class="due-date-card ${d.urgency}">
      <div class="ddc-type">${d.type}</div>
      <div class="ddc-title">${d.title}</div>
      <div class="ddc-date">📅 ${d.date}</div>
      <span class="ddc-badge ${d.urgency}">${d.urgency === 'urgent' ? '🔴 Urgent' : d.urgency === 'warning' ? '🟡 Soon' : '🟢 Upcoming'}</span>
    </div>
  `).join('');
}
populateDueDates();

// ========== AI DEMO CHAT ==========
let currentLang = 'hi';
function switchLang(lang) {
  currentLang = lang;
  document.querySelectorAll('.lang-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`[onclick="switchLang('${lang}')"]`)?.classList.add('active');
}

const aiResponses = {
  hi: {
    default: 'आपका सवाल समझ आया! 🙏 TaxMitra AI आपकी मदद करने के लिए हमेशा तैयार है। कोई specific tax question पूछें।',
    itr: 'ITR Form Selection:\n📋 ITR-1: Salary + interest income (≤₹50L)\n📋 ITR-2: Capital gains, foreign income\n📋 ITR-3: Business/profession income\n📋 ITR-4: Presumptive income\nआपकी income source क्या है?',
    gst: '🧾 GST Filing Process:\n1. GSTR-1: 11th of next month (outward supplies)\n2. GSTR-3B: 20th of next month (summary)\n3. GSTR-9: Annual by 31st December\nKya aapko kisi specific return ki help chahiye?',
    tax: '💰 Tax Calculation Tips:\n• New Regime mein ₹7L tak ZERO tax (87A rebate)\n• Standard Deduction: ₹75,000\n• Basic Exemption: ₹3L (New Regime)\nApni income batayein, main exact tax calculate karunga!',
    '80c': '💡 Section 80C Deductions (max ₹1.5L):\n• PPF / EPF contributions\n• ELSS Mutual Funds\n• LIC Premium\n• Home Loan Principal\n• NSC / Sukanya Samriddhi\n• 5-year FD\nOld Regime mein yeh deductions milti hain.',
    regime: '⚖️ Regime Comparison:\n🔵 Old Regime: Deductions available (80C, HRA, etc.)\n🟢 New Regime: Lower slabs, no deductions\n\nRule of thumb:\n• If deductions > ₹3.75L → Old Regime better\n• Otherwise → New Regime better\nMain aapke liye calculate kar sakta hoon!',
  },
  en: {
    default: 'I understand your question! 🙏 TaxMitra AI is always ready to help. Please ask a specific tax question.',
    itr: 'ITR Form Selection:\n📋 ITR-1: Salary + interest (≤₹50L)\n📋 ITR-2: Capital gains, foreign income\n📋 ITR-3: Business/profession\n📋 ITR-4: Presumptive income\nWhat is your income source?',
    gst: '🧾 GST Filing Process:\n1. GSTR-1: 11th of next month\n2. GSTR-3B: 20th of next month\n3. GSTR-9: Annual by Dec 31\nWhich return do you need help with?',
    tax: '💰 Tax Tips:\n• New Regime: ZERO tax up to ₹7L\n• Standard Deduction: ₹75,000\n• Basic Exemption: ₹3L (New Regime)\nShare your income details for exact calculation!',
    '80c': '💡 Section 80C (max ₹1.5L):\n• PPF / EPF\n• ELSS Mutual Funds\n• LIC Premium\n• Home Loan Principal\n• NSC / SSY / 5-yr FD\nAvailable only under Old Regime.',
    regime: '⚖️ Old vs New Regime:\n🔵 Old: Higher slabs with deductions\n🟢 New: Lower slabs, no deductions\n\nIf total deductions > ₹3.75L → Old Regime\nOtherwise → New Regime is better!',
  }
};

function getAIResponse(msg) {
  const m = msg.toLowerCase();
  const r = aiResponses[currentLang];
  if (m.includes('itr') || m.includes('form') || m.includes('return')) return r.itr;
  if (m.includes('gst') || m.includes('gstr')) return r.gst;
  if (m.includes('80c') || m.includes('deduction') || m.includes('katoti')) return r['80c'];
  if (m.includes('regime') || m.includes('old') || m.includes('new tax')) return r.regime;
  if (m.includes('tax') || m.includes('income') || m.includes('calc')) return r.tax;
  return r.default;
}

function sendDemoMsg() {
  const input = document.getElementById('demoInput');
  if (!input || !input.value.trim()) return;
  const msgs = document.getElementById('aiDemoMessages');
  const userMsg = document.createElement('div');
  userMsg.className = 'chat-msg user';
  userMsg.textContent = input.value;
  msgs.appendChild(userMsg);
  const userText = input.value;
  input.value = '';
  const typingDiv = document.createElement('div');
  typingDiv.className = 'chat-msg bot';
  typingDiv.innerHTML = '<span class="typing-dots"><span></span><span></span><span></span></span>';
  msgs.appendChild(typingDiv);
  msgs.scrollTop = msgs.scrollHeight;
  setTimeout(() => {
    msgs.removeChild(typingDiv);
    const botMsg = document.createElement('div');
    botMsg.className = 'chat-msg bot';
    botMsg.style.whiteSpace = 'pre-line';
    botMsg.textContent = getAIResponse(userText);
    msgs.appendChild(botMsg);
    msgs.scrollTop = msgs.scrollHeight;
  }, 1000);
}

// ========== AI FLOAT WINDOW ==========
const aiFloatBtn = document.getElementById('aiFloatBtn');
const aiFloatWindow = document.getElementById('aiFloatWindow');
const afwClose = document.getElementById('afw-close');
const afwInput = document.getElementById('afwInput');
const afwMessages = document.getElementById('afwMessages');

if (aiFloatBtn) {
  aiFloatBtn.addEventListener('click', () => {
    aiFloatWindow?.classList.toggle('show');
    if (aiFloatWindow?.classList.contains('show')) afwInput?.focus();
  });
}
if (afwClose) afwClose.addEventListener('click', () => aiFloatWindow?.classList.remove('show'));

function appendAfwMsg(text, isUser = false) {
  if (!afwMessages) return;
  const div = document.createElement('div');
  div.className = `afw-msg ${isUser ? 'user' : 'bot'}`;
  div.innerHTML = `
    ${!isUser ? '<div class="afw-msg-avatar">🤖</div>' : ''}
    <div class="afw-msg-text" style="white-space:pre-line">${text}</div>
    ${isUser ? '<div class="afw-msg-avatar">👤</div>' : ''}
  `;
  afwMessages.appendChild(div);
  afwMessages.scrollTop = afwMessages.scrollHeight;
}

function sendAfwMsg(presetMsg) {
  const msg = presetMsg || afwInput?.value.trim();
  if (!msg) return;
  appendAfwMsg(msg, true);
  if (afwInput) afwInput.value = '';

  const typingDiv = document.createElement('div');
  typingDiv.className = 'afw-msg bot typing-indicator';
  typingDiv.innerHTML = '<div class="afw-msg-avatar">🤖</div><div class="afw-msg-text"><span class="typing-dots"><span></span><span></span><span></span></span></div>';
  afwMessages.appendChild(typingDiv);
  afwMessages.scrollTop = afwMessages.scrollHeight;

  setTimeout(() => {
    afwMessages.removeChild(typingDiv);
    appendAfwMsg(getAIResponse(msg));
  }, 900);
}

function askQuick(msg) {
  if (aiFloatWindow) aiFloatWindow.classList.add('show');
  sendAfwMsg(msg);
}

if (afwInput) {
  afwInput.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendAfwMsg(); });
}

// Voice Input
const afwVoiceBtn = document.getElementById('afwVoiceBtn');
if (afwVoiceBtn && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SR();
  recognition.lang = 'hi-IN';
  recognition.continuous = false;
  afwVoiceBtn.addEventListener('click', () => {
    afwVoiceBtn.style.background = '#ef4444';
    recognition.start();
    recognition.onresult = (e) => {
      if (afwInput) afwInput.value = e.results[0][0].transcript;
      afwVoiceBtn.style.background = '';
    };
    recognition.onerror = () => { afwVoiceBtn.style.background = ''; };
    recognition.onend = () => { afwVoiceBtn.style.background = ''; };
  });
}

// ========== TOAST ==========
function showToast(msg, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity = '0'; toast.style.transform = 'translateX(30px)'; setTimeout(() => toast.remove(), 300); }, 3000);
}

// ========== INTERSECTION OBSERVER (ANIMATIONS) ==========
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('animate-in');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });
document.querySelectorAll('.module-card, .audience-card, .testi-card, .tech-category, .ai-feat-item').forEach(el => {
  el.style.opacity = '0';
  el.style.transform = 'translateY(24px)';
  el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
  observer.observe(el);
});
document.head.insertAdjacentHTML('beforeend', '<style>.animate-in { opacity: 1 !important; transform: translateY(0) !important; }</style>');

// ========== HERO PARTICLES ==========
function createParticles() {
  const container = document.getElementById('heroParticles');
  if (!container) return;
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.style.cssText = `
      position:absolute;
      width:${Math.random()*4+2}px;height:${Math.random()*4+2}px;
      background:rgba(255,255,255,${Math.random()*0.3+0.1});
      border-radius:50%;
      left:${Math.random()*100}%;
      top:${Math.random()*100}%;
      animation:floatParticle ${Math.random()*10+8}s ease-in-out infinite;
      animation-delay:${Math.random()*5}s;
    `;
    container.appendChild(p);
  }
}
document.head.insertAdjacentHTML('beforeend', `
  <style>
    @keyframes floatParticle {
      0%,100%{transform:translateY(0) translateX(0);opacity:0.6}
      25%{transform:translateY(-30px) translateX(15px);opacity:1}
      50%{transform:translateY(-60px) translateX(-10px);opacity:0.4}
      75%{transform:translateY(-30px) translateX(20px);opacity:0.8}
    }
  </style>
`);
createParticles();

// ========== NOTIFICATION BELL ==========
function showWelcomeNotification() {
  setTimeout(() => {
    showToast('🎉 TaxMitra AI Enterprise में आपका स्वागत है! ITR Filing Season Open है।', 'success');
  }, 2000);
}
showWelcomeNotification();

// ========== PWA INSTALL ==========
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  // Could show custom install button
});

// ========== KEYBOARD SHORTCUTS ==========
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault();
    navSearchBar?.classList.toggle('show');
    if (navSearchBar?.classList.contains('show')) globalSearch?.focus();
  }
  if (e.key === 'Escape') {
    aiFloatWindow?.classList.remove('show');
    navSearchBar?.classList.remove('show');
    searchResults?.classList.remove('show');
    navWrapper?.classList.remove('show');
  }
});

console.log('%c⚡ TaxMitra AI Enterprise', 'color:#1e40af;font-size:20px;font-weight:900;');
console.log('%cIndia\'s Most Advanced Tax Platform | Built by Abhishek Agrahari', 'color:#6366f1;font-size:12px;');
