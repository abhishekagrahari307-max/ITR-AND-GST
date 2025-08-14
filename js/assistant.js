// AI Assistant JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // Initialize AI Assistant
    const assistantToggle = document.getElementById('assistant-toggle');
    const assistantWindow = document.getElementById('assistant-window');
    const assistantClose = document.getElementById('assistant-close');
    const assistantMessages = document.getElementById('assistant-messages');
    const assistantInput = document.getElementById('assistant-input');
    const assistantSendBtn = document.getElementById('assistant-send-btn');
    const assistantVoiceBtn = document.getElementById('assistant-voice-btn');

    // Toggle assistant window
    assistantToggle.addEventListener('click', () => {
        assistantWindow.style.display = assistantWindow.style.display === 'flex' ? 'none' : 'flex';
        if (assistantWindow.style.display === 'flex') {
            assistantInput.focus();
        }
    });

    assistantClose.addEventListener('click', () => {
        assistantWindow.style.display = 'none';
    });

    // Send message function
    function sendAssistantMessage() {
        const message = assistantInput.value.trim();
        if (message) {
            appendMessage('user', message);
            assistantInput.value = '';
            processAssistantMessage(message);
        }
    }

    // Add message to chat
    function appendMessage(sender, text) {
        const messageDiv = document.createElement('div');
        messageDiv.className = sender === 'user' ? 'user-message' : 'bot-message';
        messageDiv.textContent = text;
        assistantMessages.appendChild(messageDiv);
        assistantMessages.scrollTop = assistantMessages.scrollHeight;
    }

    // Process user message and generate response
    function processAssistantMessage(message) {
        const lowerMsg = message.toLowerCase();
        
        // Show "Thinking..." message
        appendMessage('bot', 'Thinking...');
        
        // Simulate API call delay
        setTimeout(() => {
            // Remove "Thinking..." message
            assistantMessages.removeChild(assistantMessages.lastChild);
            
            // Generate response
            const response = generateAIResponse(lowerMsg);
            appendMessage('bot', response);
        }, 1000);
    }

    // Generate AI response (simulated - in real app this would call an API)
    function generateAIResponse(message) {
        // Hindi responses
        const hindiResponses = {
            'namaste': 'नमस्ते! ITR, GST या TDS में आपकी क्या सहायता कर सकता हूँ?',
            'help': 'मैं निम्न विषयों में मदद कर सकता हूँ:\n- ITR फॉर्म चयन\n- GST रिटर्न फाइलिंग\n- TDS रिपोर्ट जनरेशन\n- टैक्स कानून जानकारी\nकृपया अपना प्रश्न पूछें।',
            'itr form': 'ITR फॉर्म प्रकार:\n1. ITR-1: वेतन/पेंशन\n2. ITR-2: गृह संपत्ति आय\n3. ITR-3: व्यापार आय\n4. ITR-4: प्रेजम्प्टिव इनकम',
            'gst form': 'GST रिटर्न प्रकार:\n1. GSTR-1: आउटवर्ड सप्लाई\n2. GSTR-3B: मासिक सारांश\n3. GSTR-9: वार्षिक रिटर्न\n4. GSTR-4: कंपोजिशन डीलर',
            'tds form': 'TDS रिटर्न प्रकार:\n1. फॉर्म 24Q: सैलरी पर TDS\n2. फॉर्म 26Q: नॉन-सैलरी TDS\n3. फॉर्म 27Q: NRI पर TDS\n4. फॉर्म 27EQ: TCS रिटर्न',
            'deduction': 'आम कटौती:\n- धारा 80C (1.5 लाख)\n- मेडिकल बीमा\n- होम लोन ब्याज\n- दान\nमैं आपके लिए सर्वोत्तम कटौती सुझा सकता हूँ।',
            'login': 'लॉगिन के लिए, कृपया हमारे लॉगिन पेज पर जाएं: <a href="login.html">लॉगिन</a>',
            'signup': 'नया अकाउंट बनाने के लिए, कृपया हमारे साइनअप पेज पर जाएं: <a href="signup.html">साइनअप</a>'
        };
        
        // English responses
        const englishResponses = {
            'hello': 'Hello! How can I assist you with your tax filing today?',
            'help': 'I can help with:\n- Selecting ITR form\n- Filing GST returns\n- Generating TDS reports\n- Tax law information\nPlease ask your question.',
            'itr form': 'ITR form types:\n1. ITR-1: Salaried individuals\n2. ITR-2: House property income\n3. ITR-3: Business income\n4. ITR-4: Presumptive income',
            'gst form': 'GST return types:\n1. GSTR-1: Outward supplies\n2. GSTR-3B: Monthly summary\n3. GSTR-9: Annual return\n4. GSTR-4: Composition dealer',
            'tds form': 'TDS return types:\n1. Form 24Q: TDS on salary\n2. Form 26Q: Non-salary TDS\n3. Form 27Q: TDS on NRI\n4. Form 27EQ: TCS return',
            'deduction': 'Common deductions:\n- Section 80C (₹1.5 lakh)\n- Medical insurance\n- Home loan interest\n- Donations\nI can suggest optimal deductions for you.',
            'login': 'To login, please visit our login page: <a href="login.html">Login</a>',
            'signup': 'To create a new account, please visit our signup page: <a href="signup.html">Sign Up</a>'
        };
        
        // Check for Hindi queries first
        for (const [key, response] of Object.entries(hindiResponses)) {
            if (message.includes(key)) {
                return response;
            }
        }
        
        // Check for English queries
        for (const [key, response] of Object.entries(englishResponses)) {
            if (message.includes(key)) {
                return response;
            }
        }
        
        // Default response
        return "I'm not sure I understand. You can ask about:\n- Which ITR form to file\n- How to file GST returns\n- TDS reporting requirements\n- Tax deduction options";
    }

    // Event listeners for assistant
    assistantSendBtn.addEventListener('click', sendAssistantMessage);
    assistantInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendAssistantMessage();
    });

    // Voice input for assistant
    if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
        const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
        recognition.lang = 'en-IN';
        
        assistantVoiceBtn.addEventListener('click', () => {
            recognition.start();
            assistantVoiceBtn.classList.add('listening');
            
            recognition.onresult = (event) => {
                const transcript = event.results[0][0].transcript;
                assistantInput.value = transcript;
                assistantVoiceBtn.classList.remove('listening');
            };
            
            recognition.onerror = () => {
                assistantVoiceBtn.classList.remove('listening');
            };
        });
    } else {
        assistantVoiceBtn.style.display = 'none';
    }
});
