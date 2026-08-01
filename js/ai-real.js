/* ============================================================
   TaxMitra AI Enterprise — Multi-Model AI Engine v3.1
   Developer: Abhishek Agrahari | Lucknow, UP
   
   Architecture: "AI + Code Rule Engine" (Golden Rule)
   ✅ Tax MATH → JavaScript (exact, no hallucination)
   ✅ AI Models → Advice, Explanation, OCR, Notices
   
   Model Stack (July 2026 — UPDATED):
   1. Gemini 2.5 Flash  → OCR, Document reading, General advice (v1beta)
   2. DeepSeek R1 (free via OpenRouter) → Complex tax reasoning, Notices
   3. Llama 3.3 70B (free via OpenRouter) → Hindi tips, Tax saving advice
   4. Rule-based fallback → Works without any API key
   
   ⚠️ DEPRECATED MODELS (404 error):
   - gemini-1.5-flash → Shutdown June 2026 → Use gemini-2.5-flash
   - gemini-2.0-flash → Shutdown June 1, 2026 → Use gemini-2.5-flash
   
   Key Setup (console): TaxMitra.setKeys({geminiApiKey:'AIzaSy...', openrouterApiKey:'sk-or-...'})
   Gemini key must start with 'AIzaSy' — get from: aistudio.google.com
   ============================================================ */

'use strict';

// ── ENDPOINTS (Updated July 2026) ────────────────────────────
// gemini-2.5-flash: latest stable, free tier available, multimodal
const GEMINI_FLASH_EP    = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
// gemini-flash-latest: AI Studio default model (cURL quickstart Aug 2026)
const GEMINI_LATEST_EP   = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent';
// Fallback: gemini-2.5-flash-lite (faster, lower quota usage)
const GEMINI_LITE_EP     = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-lite:generateContent';
const OPENROUTER_EP      = 'https://openrouter.ai/api/v1/chat/completions';

// ── KEY LOADER ─────────────────────────────────────────────────
function loadKeys() {
  try {
    const stored = JSON.parse(localStorage.getItem('tm_keys') || '{}');
    return {
      gemini:      stored.geminiApiKey      || window.TAXMITRA_CONFIG?.GEMINI_API_KEY      || '',
      openrouter:  stored.openrouterApiKey  || window.TAXMITRA_CONFIG?.OPENROUTER_API_KEY  || '',
    };
  } catch(e) {
    return { gemini: '', openrouter: '' };
  }
}

function isKeyValid(k) {
  if (!k || k.trim().length < 10) return false;
  const key = k.trim();
  // Reject placeholder strings
  if (key.startsWith('AIzaSyXXX') || key.startsWith('AQ.XXXX') || key.includes('YOUR_') ||
      key.includes('AAPKI') || key.includes('sk-or-XXXX') ||
      key.includes('YOUR-OPEN') || key === '') return false;
  // Gemini key MUST start with AIzaSy (39 chars total)
  // OpenRouter key starts with sk-or-
  // Both are valid real keys
  return true;
}

function isGeminiKey(k) {
  // Google updated Gemini key format in 2026
  // Old format: AIzaSy... (39 chars) | New format: AQ.... (20+ chars)
  if (!k || !k.trim()) return false;
  const key = k.trim();
  return (key.startsWith('AIzaSy') && key.length > 30) || (key.startsWith('AQ.') && key.length > 20);
}

// ── PRIVACY MASKER ─────────────────────────────────────────────
// Sensitive data NEVER sent to AI in plain form
function maskSensitiveData(text) {
  if (!text) return text;
  return text
    .replace(/\b[A-Z]{5}[0-9]{4}[A-Z]\b/g, 'XXXXXPANX')           // PAN
    .replace(/\b\d{12}\b/g, 'XXXXXXXXXXXX')                         // Aadhaar
    .replace(/\b\d{9,18}\b/g, (m) => m.length > 8 ? 'XXXX' + m.slice(-4) : m) // Bank acc
    .replace(/\+91\s?\d{10}/g, '+91-XXXXXXXXXX')                    // Phone
    .replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, 'user@masked.com'); // Email
}

// ── SYSTEM PROMPT BUILDER ──────────────────────────────────────
function buildSystemPrompt(mode, lang) {
  const langStr = lang === 'en' ? 'English' : 'Hindi-English mix (Hinglish — friendly aur simple)';
  
  // ✅ Budget 2025 | AY 2026-27 CORRECT SLABS
  const TAX_FACTS = `
KEY TAX FACTS — AY 2026-27 (FY 2025-26) | Budget 2025:

NEW TAX REGIME (Default):
• Slabs: 0-4L:Nil | 4-8L:5% | 8-12L:10% | 12-16L:15% | 16-20L:20% | 20-24L:25% | >24L:30%
• Standard Deduction: ₹75,000 (salaried/pensioners)
• Rebate u/s 87A: ₹60,000 (if total income ≤ ₹12 Lakh) → ZERO TAX!
• Net effect: ZERO tax up to ₹12,75,000 gross salary!
• 80CCD(2) Employer NPS: allowed in New Regime (deductible from salary)
• No other deductions (80C, 80D, HRA, home loan) in new regime

OLD TAX REGIME:
• Slabs: 0-2.5L:Nil | 2.5-5L:5% | 5-10L:20% | >10L:30% (below 60 yrs)
• Standard Deduction: ₹50,000
• Rebate u/s 87A: ₹12,500 (if income ≤ ₹5 Lakh)
• 80C: ₹1,50,000 | 80CCD(1B) NPS extra: ₹50,000 | 80D: ₹25K-75K
• HRA, Home Loan (₹2L interest), 80G, 80E, 80TTA, 80TTB allowed

CAPITAL GAINS (AY 2026-27):
• LTCG equity/MF (STT paid): 12.5% above ₹1,25,000 exemption
• STCG equity/MF (STT paid): 20%
• LTCG property (>24 months): 12.5% without indexation OR 20% with indexation
• STCG property (<24 months): Slab rate

GST:
• GSTR-1: 11th of next month | GSTR-3B: 20th of next month
• GSTR-9 Annual: 31 December | Late fee GSTR-3B: ₹50/day (max ₹10,000)
• ITC u/s 17(5): blocked credits (motor vehicles personal use, food, club membership)

ITR DEADLINES:
• Non-audit: 31 July 2026 | Audit: 31 October 2026
• Belated return: 31 December 2026 | Updated return (ITR-U): 31 March 2029

IMPORTANT: Tax calculations are done by JavaScript code engine — you explain concepts only.
PRIVACY: Never ask for or repeat actual PAN, Aadhaar, bank account numbers.`;

  const base = `Aap TaxMitra AI hain — India ke expert CA Tax Sahayak.
Answer in ${langStr}. Be accurate, friendly, concise.
Hamesha end mein add karein: "CA se final filing ke liye zaroor consult karein."
${TAX_FACTS}`;

  const modePrompts = {
    itr:      base + '\n\nFOCUS: ITR form selection, AIS/26AS reconciliation, Form 16, e-filing process, ITR-U.',
    gst:      base + '\n\nFOCUS: GST returns (GSTR-1/3B/9), ITC rules, e-invoice, HSN codes, composition scheme.',
    notice:   base + '\n\nFOCUS: IT notices u/s 143(1)/143(2)/148/156/245 — explain simply, tell next steps, when to respond, penalty risks.',
    invest:   base + '\n\nFOCUS: 80C/80D/NPS/PPF/ELSS/home loan — tax saving strategies, Old vs New regime comparison.',
    planner:  base + '\n\nFOCUS: Tax optimization, advance tax planning, regime comparison with numbers, surcharge planning.',
    calc:     base + '\n\nFOCUS: Explain calculation methodology — slabs, surcharge, cess, marginal relief. Do NOT do math yourself (code does it).',
    ocr:      `You are an expert Indian tax document analyser. Extract financial data accurately. Return ONLY valid JSON. Mask any Aadhaar/bank account numbers in output.`,
    general:  base,
  };
  return modePrompts[mode] || base;
}

// ── MODEL SELECTOR (Right model for right task) ────────────────
function selectModel(mode, keys) {
  const hasGemini = isKeyValid(keys.gemini) && isGeminiKey(keys.gemini);
  const hasOR = isKeyValid(keys.openrouter);

  // Notice/reasoning → Llama 3.3 70B (more reliable than deepseek:free which has 5% uptime)
  if (mode === 'notice' && hasOR) {
    return { type: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B' };
  }
  // Hindi tips, invest advice → Llama 3.3 70B
  if ((mode === 'invest' || mode === 'planner') && hasOR) {
    return { type: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B' };
  }
  // OCR / Document → Gemini 2.5 Flash (multimodal, vision capable)
  if (mode === 'ocr' && hasGemini) {
    return { type: 'gemini', model: GEMINI_FLASH_EP, label: 'Gemini 2.5 Flash Vision' };
  }
  // Default → Gemini 2.5 Flash (updated from retired 1.5/2.0)
  if (hasGemini) {
    return { type: 'gemini', model: GEMINI_FLASH_EP, label: 'Gemini 2.5 Flash' };
  }
  // OpenRouter fallback with free models
  if (hasOR) {
    return { type: 'openrouter', model: 'meta-llama/llama-3.3-70b-instruct:free', label: 'Llama 3.3 70B' };
  }
  // No valid keys → warn user
  if (isKeyValid(keys.gemini) && !isGeminiKey(keys.gemini)) {
    console.warn('[TaxMitra] Invalid Gemini key format! Keys start with AIzaSy (old) or AQ. (new 2026). Get key from: aistudio.google.com');
  }
  return { type: 'none', model: '', label: 'Rule-based' };
}

// ── GEMINI API CALL ─────────────────────────────────────────────
// Updated July 2026: gemini-2.5-flash, header auth (secure), lite fallback
async function callGeminiAPI(message, mode, lang, history, apiKey, endpoint) {
  const ep = endpoint || GEMINI_FLASH_EP;
  const systemPrompt = buildSystemPrompt(mode, lang);
  const contents = [];
  
  if (history && history.length > 0) {
    history.slice(-6).forEach(h => {
      contents.push({
        role: h.role === 'user' ? 'user' : 'model',
        parts: [{ text: maskSensitiveData(h.content) }]
      });
    });
  }
  
  const userText = contents.length === 0
    ? systemPrompt + '\n\nUser question: ' + maskSensitiveData(message)
    : maskSensitiveData(message);
  
  contents.push({ role: 'user', parts: [{ text: userText }] });

  // Use proxy if configured, else direct API with header auth
  let res;
  if (window.TAXMITRA_PROXY?.enabled && window.TAXMITRA_PROXY.url) {
    // Server-side proxy (Cloudflare Worker) — key stays server-side
    try {
      const proxyData = await window.TAXMITRA_PROXY.callGemini({
        contents,
        generationConfig: { temperature: mode === 'calc' ? 0.2 : 0.7, maxOutputTokens: 2000, topP: 0.95 },
        safetySettings: [
          { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
          { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        ],
      });
      return proxyData.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
    } catch(proxyErr) {
      console.warn('[TaxMitra] Proxy failed, trying direct:', proxyErr.message);
      // Fall through to direct API call
    }
  }
  // Direct API call - x-goog-api-key works for BOTH AIzaSy AND AQ. format keys
  // Confirmed from Google AI Studio cURL quickstart (Aug 2026)
  res = await fetch(ep, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey,
    },
    body: JSON.stringify({
      contents,
      generationConfig: {
        temperature: mode === 'calc' ? 0.2 : 0.7,
        maxOutputTokens: 2000,
        topP: 0.95
      },
      safetySettings: [
        { category: 'HARM_CATEGORY_HARASSMENT',        threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_HATE_SPEECH',       threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
        { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_MEDIUM_AND_ABOVE' },
      ],
    }),
  });
  
  if (!res.ok) {
    const errText = await res.text();
    // If 404 on main model, try lite model automatically
    if (res.status === 404 && ep === GEMINI_FLASH_EP) {
      console.warn('[TaxMitra] gemini-2.5-flash 404, trying gemini-flash-latest...');
      return await callGeminiAPI(message, mode, lang, history, apiKey, GEMINI_LATEST_EP);
    }
    if (res.status === 404 && ep === GEMINI_LATEST_EP) {
      console.warn('[TaxMitra] gemini-flash-latest 404, trying gemini-2.5-flash-lite...');
      return await callGeminiAPI(message, mode, lang, history, apiKey, GEMINI_LITE_EP);
    }
    throw new Error('Gemini API ' + res.status + ': ' + errText.substring(0, 200));
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
}

// ── OPENROUTER API CALL ─────────────────────────────────────────
// Free models (July 2026 verified working):
//   meta-llama/llama-3.3-70b-instruct:free  — general (131K ctx)
//   meta-llama/llama-3.2-3b-instruct:free   — fast fallback
//   deepseek/deepseek-r1:free               — reasoning (when available)
//   google/gemma-4-27b-it:free              — multimodal fallback
const OR_FREE_MODELS = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'meta-llama/llama-3.2-3b-instruct:free',
  'google/gemma-4-27b-it:free',
];

async function callOpenRouterAPI(message, mode, lang, history, apiKey, model, _retryIdx) {
  const systemPrompt = buildSystemPrompt(mode, lang);
  // Trim system prompt to avoid 400 (too long)
  const trimmedSystem = systemPrompt.length > 4000
    ? systemPrompt.substring(0, 4000) + '...(truncated)'
    : systemPrompt;

  const messages = [{ role: 'system', content: trimmedSystem }];
  
  if (history && history.length > 0) {
    history.slice(-4).forEach(h => {  // reduced from 6 to 4 to avoid 400
      const content = maskSensitiveData(h.content);
      if (content && content.trim()) {
        messages.push({
          role: h.role === 'user' ? 'user' : 'assistant',
          content: content.substring(0, 1000)  // cap history msg length
        });
      }
    });
  }
  messages.push({ role: 'user', content: maskSensitiveData(message).substring(0, 2000) });
  
  // Use proxy if configured, else direct OpenRouter API
  if (window.TAXMITRA_PROXY?.enabled && window.TAXMITRA_PROXY.url) {
    try {
      const proxyData = await window.TAXMITRA_PROXY.callOpenRouter({ model, messages, temperature: mode === 'notice' ? 0.3 : 0.65, max_tokens: 1500 });
      return proxyData.choices?.[0]?.message?.content || 'No response.';
    } catch(proxyErr) {
      console.warn('[TaxMitra] OpenRouter proxy failed:', proxyErr.message);
    }
  }
  const res = await fetch(OPENROUTER_EP, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + apiKey,
      'HTTP-Referer': 'https://abhishekagrahari307-max.github.io/ITR-AND-GST/',
      'X-Title': 'TaxMitra AI Enterprise',
    },
    body: JSON.stringify({
      model: model,
      messages,
      temperature: mode === 'notice' ? 0.3 : 0.65,
      max_tokens: 1500,
    }),
  });
  
  if (!res.ok) {
    const errText = await res.text();
    const status = res.status;
    console.warn('[TaxMitra OpenRouter] ' + status + ' for model ' + model + ':', errText.substring(0, 150));

    // Auto-retry with next free model in list
    const retryIdx = (_retryIdx || 0) + 1;
    if (retryIdx < OR_FREE_MODELS.length) {
      const nextModel = OR_FREE_MODELS[retryIdx];
      console.warn('[TaxMitra] Retrying with', nextModel, '...');
      return await callOpenRouterAPI(message, mode, lang, history, apiKey, nextModel, retryIdx);
    }
    throw new Error('OpenRouter API ' + status + ': All free models exhausted. ' + errText.substring(0, 100));
  }
  const data = await res.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    console.warn('[TaxMitra OpenRouter] Empty response from', model, data);
    return 'Jawab generate nahi ho saka. Please dobara try karein.';
  }
  return content;
}

// ── MAIN CALL FUNCTION (exported) ──────────────────────────────
async function callGemini(message, mode = 'general', lang = 'hi', history = []) {
  const keys = loadKeys();
  const modelInfo = selectModel(mode, keys);
  
  // No API key → rule-based
  if (modelInfo.type === 'none') {
    return { text: getRuleBasedResponse(message, lang, mode), provider: 'rule-based' };
  }
  
  try {
    let text = '';
    if (modelInfo.type === 'gemini') {
      text = await callGeminiAPI(message, mode, lang, history, keys.gemini);
    } else if (modelInfo.type === 'openrouter') {
      text = await callOpenRouterAPI(message, mode, lang, history, keys.openrouter, modelInfo.model);
    }
    return { text, provider: modelInfo.label };
  } catch (err) {
    console.warn('[TaxMitra AI] ' + modelInfo.label + ' failed:', err.message, '— trying fallback...');
    
    // Try other provider as fallback
    try {
      if (modelInfo.type === 'gemini' && isKeyValid(keys.openrouter)) {
        const text = await callOpenRouterAPI(message, mode, lang, history, keys.openrouter, 'meta-llama/llama-3.3-70b-instruct:free');
        return { text, provider: 'Llama 3.3 70B (fallback)' };
      } else if (modelInfo.type === 'openrouter' && isKeyValid(keys.gemini) && isGeminiKey(keys.gemini)) {
        const text = await callGeminiAPI(message, mode, lang, history, keys.gemini);
        return { text, provider: 'Gemini 2.5 Flash (fallback)' };
      }
    } catch (err2) {
      console.warn('[TaxMitra AI] Fallback also failed:', err2.message);
    }
    
    return { text: getRuleBasedResponse(message, lang, mode), provider: 'rule-based' };
  }
}

// ── GEMINI VISION — Document OCR ──────────────────────────────
async function analyseDocumentWithAI(fileDataUrl, docType, mimeType) {
  const keys = loadKeys();
  if (!isKeyValid(keys.gemini)) {
    return parseDocumentFallback('', docType);
  }
  
  const prompts = {
    'Form 16': `Extract from this Form 16 into JSON only:
{"employer_name":"","employer_tan":"","employee_name":"","employee_pan":"","assessment_year":"","gross_salary":0,"hra_exemption":0,"standard_deduction":0,"professional_tax":0,"net_taxable_salary":0,"section_80c":0,"section_80d":0,"total_deductions":0,"taxable_income":0,"tax_payable":0,"tds_deducted":0,"rebate_87a":0}
Output ONLY the JSON, no explanation. Mask full PAN/Aadhaar.`,
    'Form 26AS': `Extract from this Form 26AS into JSON only:
{"pan":"MASKED","assessment_year":"","total_tds_salary":0,"total_tds_other":0,"advance_tax":0,"self_assessment_tax":0,"total_tax_paid":0,"refund_amount":0}
Output ONLY the JSON.`,
    'AIS': `Extract from this Annual Information Statement (AIS) into JSON:
{"pan":"MASKED","assessment_year":"","salary_income":0,"dividend_income":0,"interest_income":0,"capital_gains":0,"total_tds":0}
Output ONLY the JSON.`,
    'GST Invoice': `Extract from this GST Invoice into JSON:
{"invoice_number":"","invoice_date":"","supplier_name":"","supplier_gstin":"","buyer_name":"","buyer_gstin":"","taxable_value":0,"cgst":0,"sgst":0,"igst":0,"total_amount":0}
Output ONLY the JSON.`,
    'PAN Card': `Extract from PAN card: {"name":"","pan":"XXXXX1234X (last 4 only)","dob":"","father_name":""} JSON only.`,
    'Salary Slip': `Extract: {"month":"","employee_name":"","basic_salary":0,"hra":0,"special_allowance":0,"gross_salary":0,"pf_deduction":0,"tds_deduction":0,"professional_tax":0,"net_salary":0} JSON only.`,
  };
  
  const prompt = prompts[docType] || `Extract key financial data from this ${docType} as JSON.`;
  const base64 = fileDataUrl.split(',')[1];
  const imgMime = mimeType || 'image/jpeg';
  
  // x-goog-api-key works for both AIzaSy and AQ. keys (confirmed Aug 2026)
  const res = await fetch(GEMINI_FLASH_EP, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': keys.gemini,
    },
    body: JSON.stringify({
      contents: [{
        parts: [
          { text: prompt },
          { inline_data: { mime_type: imgMime, data: base64 } }
        ]
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 1000 }
    })
  });
  
  if (!res.ok) {
    const errBody = await res.text();
    throw new Error('Gemini Vision API ' + res.status + ': ' + errBody.substring(0, 200));
  }
  const data = await res.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  
  // Parse JSON from response
  const jsonMatch = rawText.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      return { ...JSON.parse(jsonMatch[0]), _source: 'gemini-vision', _docType: docType };
    } catch(e) {
      return { rawText, _source: 'gemini-vision', _docType: docType };
    }
  }
  return { rawText, _source: 'gemini-vision', _docType: docType };
}

// ── NOTICE EXPLAINER (uses DeepSeek R1 for deep reasoning) ─────
async function explainITNotice(noticeText, lang) {
  const keys = loadKeys();
  const maskedText = maskSensitiveData(noticeText);
  
  const noticePrompt = `Aap India ke expert tax advocate hain. Neeche ek IT Notice diya gaya hai.
Yeh samjhao:
1. 📋 Notice ka TYPE kya hai (143(1)/143(2)/148/156/245)?
2. ⚠️ REASON kya hai (mismatch/non-filing/scrutiny)?
3. 🚨 RISK level kitna hai (Low/Medium/High)?
4. ✅ RESPONSE kab tak dena hai?
5. 📝 KYA KARNA CHAHIYE step-by-step?
6. 💡 CA ki zaroorat hai ya khud handle ho sakta hai?

Notice text:
${maskedText}

${lang === 'en' ? 'Answer in English.' : 'Answer in Hindi-English mix (Hinglish).'}`;
  
  const model = isKeyValid(keys.openrouter) ? 'openrouter' : 'gemini';
  
  try {
    if (model === 'openrouter') {
      const text = await callOpenRouterAPI(noticePrompt, 'notice', lang, [], keys.openrouter, 'deepseek/deepseek-r1:free');
      return { text, provider: 'DeepSeek R1' };
    } else if (isGeminiKey(keys.gemini)) {
      const text = await callGeminiAPI(noticePrompt, 'notice', lang, [], keys.gemini);
      return { text, provider: 'Gemini 2.5 Flash' };
    } else {
      return { text: getNoticeRuleBasedResponse(maskedText), provider: 'rule-based' };
    }
  } catch(e) {
    return { text: getNoticeRuleBasedResponse(maskedText), provider: 'rule-based' };
  }
}

function getNoticeRuleBasedResponse(noticeText) {
  const t = noticeText.toLowerCase();
  if (t.includes('143(1)') || t.includes('intimation')) {
    return `📋 **Notice Type: Intimation u/s 143(1)**\n\n⚠️ **Reason:** ITR processing mein adjustment hua hai (TDS mismatch ya deduction issue).\n\n🚨 **Risk:** LOW — Yeh routine notice hai.\n\n✅ **What to do:**\n1. Notice mein demand amount check karein\n2. Demand ₹0 hai → koi action nahi chahiye\n3. Demand > ₹0 → Form 26AS se TDS verify karein\n4. Disagree hai → 30 days mein online response submit karein\n\n💡 Simple cases mein CA ki zaroorat nahi.`;
  }
  if (t.includes('148') || t.includes('reassessment') || t.includes('escaped')) {
    return `📋 **Notice Type: Notice u/s 148 (Reassessment)**\n\n⚠️ **Reason:** Tax dept ko lagta hai income tax se bacha hai (income escaped assessment).\n\n🚨 **Risk:** HIGH — Seriously lena chahiye.\n\n✅ **What to do:**\n1. Immediately CA se milein\n2. Notice ki date se 30 days mein respond karein\n3. Original ITR ki copy ready karein\n4. All income proofs gather karein\n\n⚠️ **Important:** Ignore mat karein — penalty + interest lag sakta hai!`;
  }
  if (t.includes('156') || t.includes('demand')) {
    return `📋 **Notice Type: Demand Notice u/s 156**\n\n⚠️ **Reason:** Tax demand outstanding hai.\n\n🚨 **Risk:** MEDIUM — Payment ya response required.\n\n✅ **What to do:**\n1. Demand amount verify karein Form 26AS se\n2. Agree hai → 30 days mein pay karein\n3. Disagree hai → u/s 154 rectification file karein\n4. CA se consult karein before responding\n\n💡 Late payment par 1% monthly interest lagta hai u/s 220(2).`;
  }
  return `📋 **IT Notice Explanation**\n\nNotice text se accurately identify nahi ho saka. Please:\n1. Notice section number (143/148/156 etc.) batayein\n2. Ya full notice text paste karein\n\n🤖 TaxMitra AI suggest karega — Notice text paste karein ya section number batayein.`;
}

// ── RULE-BASED FALLBACK ─────────────────────────────────────────
function getRuleBasedResponse(msg, lang = 'hi', mode = 'general') {
  const m = msg.toLowerCase();
  
  const responses_hi = {
    // ITR Questions
    itrForm: () => {
      if (m.includes('itr-1') || m.includes('itr 1') || (m.includes('salary') && !m.includes('capital')))
        return `📋 **ITR-1 (Sahaj)** aapke liye sahi hai!\n\n✅ **Eligible:** Resident individual, Salary/Pension, 1 house property, other sources\n✅ **Income limit:** ₹50 Lakh\n❌ **Not for:** Capital gains, foreign assets, director\n\n📅 Due: **31 July 2026**`;
      if (m.includes('itr-4') || m.includes('itr 4') || m.includes('44ad') || m.includes('presumptive'))
        return `📋 **ITR-4 (Sugam)** aapke liye sahi hai!\n\n✅ **44AD:** Business turnover ≤ ₹3 crore → 6%/8% income\n✅ **44ADA:** Professional receipts ≤ ₹75 lakh → 50% income\n✅ **44AE:** Goods carriage owners\n\n📅 Due: **31 July 2026**`;
      if (m.includes('capital gain') || m.includes('ltcg') || m.includes('stcg') || m.includes('shares'))
        return `📋 **ITR-2** aapke liye sahi hai!\n\nCapital gains wale taxpayers ke liye:\n✅ Salary + Capital gains\n✅ 2+ house properties\n✅ Foreign assets\n✅ Director in company (no business income)`;
      return `📋 **ITR Form Selection Guide:**\n\n• **ITR-1:** Salary only, income ≤ ₹50L\n• **ITR-2:** Capital gains / foreign assets / director\n• **ITR-3:** Business/Profession (full books)\n• **ITR-4:** Presumptive (44AD/44ADA)\n• **ITR-5:** Firm/LLP/AOP\n• **ITR-6:** Companies\n• **ITR-7:** Trusts/NPOs\n\nApni income details batayein, main sahi form suggest karunga!`;
    },
    
    regime: () => `⚖️ **Old vs New Regime (AY 2026-27):**\n\n🟢 **New Regime (Default):**\n• Slabs: 0-4L:Nil, 4-8L:5%, 8-12L:10%, 12-16L:15%...\n• Std Deduction: ₹75,000\n• **ZERO TAX upto ₹12,75,000 gross salary!**\n• Rebate 87A: ₹60,000 (income ≤ ₹12L)\n\n🔵 **Old Regime:**\n• Std Deduction: ₹50,000\n• 80C: ₹1.5L | 80D: ₹25K | HRA, Home Loan etc.\n• Rebate 87A: ₹12,500 (income ≤ ₹5L)\n\n📊 **Break-even:** ~₹3.75L deductions → Old Regime better\n• Deductions > ₹3.75L → Old Regime save karega\n• Deductions < ₹3.75L → New Regime better\n\n💡 New regime mein **80CCD(2) employer NPS** allow hai!`,
    
    zeroTax: () => `🎉 **₹12.75 Lakh tak ZERO TAX! (Budget 2025)**\n\nCalculation:\n• Gross Salary: ₹12,75,000\n• (-) Std Deduction: ₹75,000\n• **Net Taxable: ₹12,00,000**\n\nTax calculation (New Regime):\n• 0-4L: ₹0\n• 4-8L @ 5%: ₹20,000\n• 8-12L @ 10%: ₹40,000\n• **Gross Tax: ₹60,000**\n• (-) Rebate u/s 87A: ₹60,000\n• **NET TAX = ₹0** 🎉`,
    
    deadline: () => {
      const now = new Date();
      const july31 = new Date(2026, 6, 31);
      const days = Math.ceil((july31 - now) / 86400000);
      return `📅 **ITR Filing Deadlines AY 2026-27:**\n\n• **Non-audit (Salary/Presumptive):** 31 July 2026${days > 0 ? ` — **${days} din bache hain!**` : ' — **Deadline pass ho gayi!**'}\n• **Audit cases:** 31 October 2026\n• **Belated return:** 31 December 2026 (late fee: ₹5,000)\n• **Updated return (ITR-U):** 31 March 2029\n\n⚠️ Late fee u/s 234F:\n• Income ≤ ₹5L → ₹1,000\n• Income > ₹5L → ₹5,000`;
    },
    
    ded80c: () => `💡 **Section 80C Deductions (Max ₹1,50,000):**\n\n🏆 **Best Options:**\n• **ELSS Mutual Fund** — 3 yr lock-in, market returns (12-18%)\n• **PPF** — 15 yr, 7.1% guaranteed, tax-free maturity\n• **EPF** — Auto deducted from salary\n• **NPS** — 10% returns + extra ₹50K u/s 80CCD(1B)\n\n📋 **Other 80C:**\n• LIC Premium | NSC | 5yr Tax Saver FD | Tuition fees\n• Home loan principal repayment\n\n⚠️ **New Regime mein 80C nahi milta** — sirf Old Regime mein!`,
    
    hra: () => `🏠 **HRA Exemption Calculation:**\n\n**Minimum of 3 limits:**\n1. Actual HRA received\n2. Rent paid − 10% of basic salary\n3. 50% of salary (metro) or 40% (non-metro)\n\n**Example:**\n• Basic: ₹40,000/month | HRA: ₹20,000 | Rent: ₹18,000 (Delhi)\n• Limit 1: ₹20,000\n• Limit 2: ₹18,000 - ₹4,000 = ₹14,000\n• Limit 3: ₹40,000 × 50% = ₹20,000\n• **HRA Exempt: ₹14,000/month**\n\n⚠️ HRA sirf Old Regime mein milta hai!`,
    
    gstFiling: () => `🧾 **GST Return Filing Schedule:**\n\n📅 **Monthly:**\n• **GSTR-1:** 11th — Outward supplies (B2B invoices)\n• **GSTR-3B:** 20th — Summary return + tax payment\n\n📅 **Quarterly (QRMP ≤ ₹5 Cr):**\n• **IFF:** 13th | **GSTR-3B:** 22nd/24th\n\n📅 **Annual:**\n• **GSTR-9:** 31 December (mandatory if TO > ₹2 Cr)\n• **GSTR-9C:** 31 December (if TO > ₹5 Cr)\n\n⚠️ **Late fee:** ₹50/day GSTR-3B (max ₹10,000) | NIL return: ₹20/day`,
    
    itc: () => `✅ **Input Tax Credit (ITC) Rules:**\n\n**Conditions (Section 16):**\n• Valid tax invoice hona chahiye\n• Goods/services received hone chahiye\n• Supplier ne tax deposit kiya ho\n• Return filed honi chahiye (GSTR-3B)\n• Invoice GSTR-2B mein appear ho\n\n🚫 **Blocked Credits (Section 17(5)):**\n• Personal motor vehicles\n• Food, beverages, outdoor catering\n• Health services, beauty treatment\n• Club membership\n• Works contract for civil structure\n\n📊 **Utilization Order (Section 49):**\nIGST credit → IGST → CGST → SGST`,
    
    notice: () => `📋 **IT Notice Types:**\n\n• **143(1) Intimation:** Routine processing — demand ya refund. LOW risk.\n• **143(2) Scrutiny:** Detailed examination. Respond within 30 days. MEDIUM.\n• **148 Reassessment:** Income escaped. HIGH risk — CA se milein immediately!\n• **156 Demand:** Tax payable. Pay within 30 days. MEDIUM.\n• **245 Refund Adjusted:** Refund ke against demand adjust. Verify karo.\n\n💡 Tip: Notice ignore mat karein — penalty + interest lag sakta hai!`,
    
    advance: () => `📅 **Advance Tax (u/s 208):**\n\nRequired if tax liability > ₹10,000 after TDS.\n\n**Installments:**\n• **15 June:** 15% of total tax\n• **15 September:** 45% cumulative\n• **15 December:** 75% cumulative\n• **15 March:** 100%\n\n**Penalty u/s 234B/C:** 1%/month if not paid timely\n\n💡 Salaried: TDS usually covers advance tax. Business owners ko dhyan dena chahiye!`,
    
    default: () => `🙏 **TaxMitra AI — Aapka CA Sahayak!**\n\nIn topics mein help kar sakta hoon:\n\n📋 **ITR** — Form selection, AIS, Form 16, e-filing\n⚖️ **Regime** — Old vs New comparison with numbers\n💡 **Tax Saving** — 80C, NPS, HRA, home loan\n🧾 **GST** — Returns, ITC, e-invoice, HSN codes\n💼 **TDS** — Salary, interest, contractor, 194A\n🔔 **IT Notice** — 143/148/156 explain karna\n📈 **Capital Gains** — LTCG/STCG calculation\n📅 **Advance Tax** — Quarterly installments\n\n🤖 **AI Ready** — Koi bhi tax sawaal puchein!`,
  };
  
  // Mode-based routing
  if (mode === 'notice') return getNoticeRuleBasedResponse(msg);

  // ── SALARY CALCULATOR — works for any amount ──────────────
  const salMatch = m.match(/(\d+(?:\.\d+)?)\s*(?:lakh|lac|l)\b/);
  if (salMatch && (m.includes('tax') || m.includes('kitna') || m.includes('salary') || m.includes('income') || m.includes('kamaata') || m.includes('earn'))) {
    const lakh = parseFloat(salMatch[1]);
    const gross = lakh * 100000;
    const stdDed = 75000;
    const taxable = Math.max(0, gross - stdDed);
    const slabs = [[400000,0],[400000,.05],[400000,.10],[400000,.15],[400000,.20],[400000,.25],[Infinity,.30]];
    let tax = 0; let rem = taxable;
    for (const [lim,r] of slabs) { const t=Math.min(rem,lim); tax+=t*r; rem-=t; if(rem<=0)break; }
    if (taxable <= 1200000) tax = Math.max(0, tax - Math.min(tax, 60000));
    const total = Math.round(tax * 1.04);
    const fmt = n => '₹' + Math.round(n).toLocaleString('en-IN');
    return `💰 **${lakh}L Salary — New Regime Tax (AY 2026-27):**\n\n` +
      `• Gross Salary: ${fmt(gross)}\n• (-) Std Deduction: ${fmt(stdDed)}\n• Net Taxable: ${fmt(taxable)}\n\n` +
      `Tax calculation:\n• 0-4L: ₹0\n` +
      (taxable>400000?`• 4-8L @ 5%: ${fmt(Math.min(taxable-400000,400000)*0.05)}\n`:'') +
      (taxable>800000?`• 8-12L @ 10%: ${fmt(Math.min(taxable-800000,400000)*0.10)}\n`:'') +
      (taxable>1200000?`• 12-16L @ 15%: ${fmt(Math.min(taxable-1200000,400000)*0.15)}\n`:'') +
      (taxable>1600000?`• 16L+: Higher slabs\n`:'') +
      (taxable<=1200000?`• (-) 87A Rebate: ${fmt(Math.min(tax,60000))}\n`:'') +
      `• 4% Cess\n` +
      `\n**${total===0?'🎉 NET TAX = ₹0 — ZERO TAX!':'💳 Total Tax = '+fmt(total)+' | Monthly TDS = '+fmt(Math.round(total/12))}**`;
  }

  // ── FLEXIBLE KEYWORD MATCHING ─────────────────────────────
  // ITR forms
  if (m.match(/itr|income.*tax.*return|return.*file|form.*fill|kaunsa.*form|which.*form|konsa.*form/))
    return responses_hi.itrForm();
  // Regime  
  if (m.match(/regime|old.*tax|new.*tax|slab|konsa.*regime|purana.*regime|naya.*regime|compare.*tax|tax.*compare/))
    return responses_hi.regime();
  // Zero tax
  if (m.match(/zero.*tax|12.75|koi.*tax.*nahi|no.*tax|tax.*nahi|free.*tax/))
    return responses_hi.zeroTax();
  // Deadline
  if (m.match(/deadline|last.*date|due.*date|kab.*tak|31.*july|july.*31|filing.*date|date.*filing/))
    return responses_hi.deadline();
  // 80C deductions
  if (m.match(/80c|ppf|elss|lic|nsc|tax.*save|save.*tax|invest.*tax|deduction|bachao.*tax|invest.*kahan/))
    return responses_hi.ded80c();
  // HRA
  if (m.match(/hra|house.*rent|rent.*exempt|rent.*tax|makaan.*kiraya|home.*rent/))
    return responses_hi.hra();
  // GST
  if (m.match(/gst|gstr|goods.*service.*tax|invoice.*tax|input.*tax|itc|gstin|nil.*return/))
    return responses_hi.gstFiling();
  // TDS
  if (m.match(/tds|tax.*deduct|form.*16|26as|ais|194|192|tax.*source/))
    return `💼 **TDS Rates (Key Sections):**\n\n• **192:** Salary — slab rate\n• **194A:** Bank FD interest — 10% (>₹40K)\n• **194C:** Contractor — 1%/2%\n• **194H:** Commission — 5%\n• **194I:** Rent — 10%\n• **194J:** Professional fees — 10%\n• **No PAN:** 20% (u/s 206AA)\n\n📋 Form 16: Part A = TDS | Part B = Salary computation\n📋 Form 26AS: Check all TDS credits online`;
  // Capital gains
  if (m.match(/capital.*gain|ltcg|stcg|share.*tax|mutual.*fund.*tax|equity.*tax|stock.*tax|profit.*share/))
    return `📈 **Capital Gains Tax (AY 2026-27):**\n\n**Equity / Mutual Fund (STT paid):**\n• STCG (<12 months): **20%**\n• LTCG (>12 months): **12.5%** (first ₹1.25L free)\n\n**Property / Debt:**\n• STCG (<24 months): Slab rate\n• LTCG (>24 months): **12.5%** without indexation\n\n**Exemptions:**\n• u/s 54: Reinvest in house property\n• u/s 54EC: NHAI/REC bonds (max ₹50L)`;
  // Notice
  if (m.match(/notice|143|148|156|demand.*tax|tax.*demand|scrutiny|reassess/))
    return responses_hi.notice();
  // Advance tax
  if (m.match(/advance.*tax|quarterly.*tax|234b|234c|installment/))
    return responses_hi.advance();
  // NPS
  if (m.match(/nps|national.*pension|80ccd|pension.*fund/))
    return `🏦 **NPS — National Pension System:**\n\n• **80CCD(1B):** Extra ₹50,000 deduction (Old Regime only) — over and above ₹1.5L 80C limit!\n• **80CCD(2):** Employer NPS — **BOTH regimes mein allowed!** (up to 10% of salary)\n• ~10% annual returns (market-linked)\n• Maturity: 60% lump sum (tax-free) + 40% annuity\n\n💡 Best option: Ask employer to route salary component as NPS contribution`;
  // Home loan
  if (m.match(/home.*loan|housing.*loan|emi.*deduction|24.*b|section.*24/))
    return `🏠 **Home Loan Tax Benefits:**\n\n**Old Regime:**\n• Interest u/s 24(b): Max **₹2,00,000** (self-occupied)\n• Principal u/s 80C: Within ₹1.5L limit\n• Let-out: Full interest deductible\n\n**New Regime:** No home loan deduction available\n\n💡 High home loan → Old Regime might be better!`;
  // Salary general
  if (m.match(/salary|ctc|take.*home|in.*hand|package|compensation|paisa|income/))
    return `💰 **Salary Tax — Quick Guide:**\n\n🎉 **ZERO TAX: Salary ≤ ₹12,75,000** (New Regime)\n\nNew Regime calculation example (₹15L)::\n• Gross: ₹15,00,000 → (-) ₹75,000 std ded → Taxable: ₹14,25,000\n• Tax: ₹1,35,000 + 4% cess = **₹1,40,400**\n• Monthly TDS: **₹11,700**\n\nApni exact salary batao — main calculate karta hoon!`;
  
  // General helpful response
  return responses_hi.default();
}

function parseDocumentFallback(text, docType) {
  return {
    _source: 'fallback',
    _docType: docType,
    note: 'Upload image/PDF — Gemini Vision automatically data extract karega.',
    extractedText: text ? text.substring(0, 200) : ''
  };
}

// ── GLOBAL EXPORT ─────────────────────────────────────────────
window.TaxMitraAI = {
  callGemini,
  analyseDocumentWithAI,
  explainITNotice,
  getRuleBasedResponse,
  buildSystemPrompt,
  maskSensitiveData,
  loadKeys,
  isKeyValid,
  selectModel,
};

console.log('%c⚡ TaxMitra AI v3.1', 'color:#1e40af;font-weight:900;font-size:14px');
console.log('%cMulti-model: Gemini 2.5 Flash + DeepSeek R1 + Llama 3.3 70B', 'color:#7c3aed;font-size:11px');
console.log('%cGemini key: AIzaSy... (old) or AQ.... (new 2026) → get from: aistudio.google.com', 'color:#dc2626;font-size:10px');
console.log('%cSet keys: TaxMitra.setKeys({geminiApiKey:"AIzaSy... or AQ....", openrouterApiKey:"sk-or-..."})', 'color:#059669;font-size:10px');
