// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Set current date in security header
    updateCurrentDate();
    
    // Initialize tabs functionality
    setupTabs();
    
    // Initialize form validation
    setupFormValidation();
    
    // Initialize voice input buttons
    setupVoiceInput();
    
    // Verify security features
    verifySecurity();
    
    // Initialize 3D elements
    init3DElements();
});

// Update current date in Indian format
function updateCurrentDate() {
    const options = {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    };
    document.getElementById('current-date').textContent = new Date().toLocaleDateString('en-IN', options);
}

// Tab switching functionality
function setupTabs() {
    const tabs = document.querySelectorAll('.tab');
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Get parent tabs container and all tab contents
            const parent = tab.closest('.tabs');
            const contents = parent.nextElementSibling.querySelectorAll('.tab-content');
            
            // Remove active class from all tabs and contents
            parent.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            
            // Add active class to clicked tab and corresponding content
            tab.classList.add('active');
            const tabId = tab.getAttribute('data-tab');
            document.getElementById(tabId).classList.add('active');
        });
    });
}

// Form validation setup
function setupFormValidation() {
    // PAN validation
    const panInput = document.getElementById('pan');
    if (panInput) {
        panInput.addEventListener('blur', () => validatePAN(panInput));
    }
    
    // GSTIN validation
    const gstinInput = document.getElementById('gstin');
    if (gstinInput) {
        gstinInput.addEventListener('blur', () => validateGSTIN(gstinInput));
    }
    
    // TAN validation
    const tanInput = document.getElementById('tan');
    if (tanInput) {
        tanInput.addEventListener('blur', () => validateTAN(tanInput));
    }
    
    // Mobile validation
    const mobileInput = document.getElementById('mobile');
    if (mobileInput) {
        mobileInput.addEventListener('blur', () => validateMobile(mobileInput));
    }
    
    // Email validation
    const emailInput = document.getElementById('email');
    if (emailInput) {
        emailInput.addEventListener('blur', () => validateEmail(emailInput));
    }
    
    // Name validation
    const nameInput = document.getElementById('name');
    if (nameInput) {
        nameInput.addEventListener('blur', () => validateName(nameInput));
    }
    
    // Form submission handlers
    const itrForm = document.getElementById('itr-form-1');
    if (itrForm) {
        itrForm.addEventListener('submit', handleFormSubmit);
    }
    
    const gstForm = document.getElementById('gstr-1-form');
    if (gstForm) {
        gstForm.addEventListener('submit', handleFormSubmit);
    }
    
    const tdsForm = document.getElementById('tds-form-q1');
    if (tdsForm) {
        tdsForm.addEventListener('submit', handleFormSubmit);
    }
}

// Validation functions
function validatePAN(input) {
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
    const isValid = panRegex.test(input.value.toUpperCase());
    toggleError(input, 'pan-error', isValid, 'Please enter a valid PAN (e.g., AAAAA9999A)');
    return isValid;
}

function validateGSTIN(input) {
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    const isValid = gstinRegex.test(input.value.toUpperCase());
    toggleError(input, 'gstin-error', isValid, 'Please enter a valid GSTIN (e.g., 22AAAAA0000A1Z5)');
    return isValid;
}

function validateTAN(input) {
    const tanRegex = /^[A-Z]{4}[0-9]{5}[A-Z]{1}$/;
    const isValid = tanRegex.test(input.value.toUpperCase());
    toggleError(input, 'tan-error', isValid, 'Please enter a valid TAN (e.g., BLRA12345B)');
    return isValid;
}

function validateMobile(input) {
    const mobileRegex = /^[6-9][0-9]{9}$/;
    const isValid = mobileRegex.test(input.value.trim());
    toggleError(input, 'mobile-error', isValid, 'Please enter a valid 10-digit mobile number');
    return isValid;
}

function validateEmail(input) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailRegex.test(input.value.trim());
    toggleError(input, 'email-error', isValid, 'Please enter a valid email address');
    return isValid;
}

function validateName(input) {
    const isValid = input.value.trim().length > 0;
    toggleError(input, 'name-error', isValid, 'Please enter your full name');
    return isValid;
}

function toggleError(input, errorId, isValid, errorMessage) {
    const errorElement = document.getElementById(errorId);
    
    if (!isValid) {
        input.classList.add('error');
        errorElement.textContent = errorMessage;
        errorElement.style.display = 'block';
    } else {
        input.classList.remove('error');
        errorElement.style.display = 'none';
    }
}

// Form submission handler
function handleFormSubmit(e) {
    e.preventDefault();
    
    // Validate all relevant fields for the form
    let isValid = true;
    const form = e.target;
    
    if (form.id === 'itr-form-1') {
        isValid = validatePAN(document.getElementById('pan')) && 
                  validateName(document.getElementById('name')) &&
                  validateMobile(document.getElementById('mobile')) &&
                  validateEmail(document.getElementById('email'));
    } else if (form.id === 'gstr-1-form') {
        isValid = validateGSTIN(document.getElementById('gstin'));
    } else if (form.id === 'tds-form-q1') {
        isValid = validateTAN(document.getElementById('tan'));
    }
    
    if (isValid) {
        // In a real application, this would submit to the server
        alert('Form validation successful! In a real application, this would submit to the server.');
        // form.submit();
    } else {
        alert('Please fix the errors in the form before submitting.');
    }
}

// Voice input setup
function setupVoiceInput() {
    const voiceButtons = {
        'pan-voice-btn': 'pan',
        'name-voice-btn': 'name',
        'gstin-voice-btn': 'gstin',
        'tan-voice-btn': 'tan'
    };

    Object.entries(voiceButtons).forEach(([btnId, fieldId]) => {
        const button = document.getElementById(btnId);
        const field = document.getElementById(fieldId);
        
        if (button && field && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
            const recognition = new (window.SpeechRecognition || window.webkitSpeechRecognition)();
            recognition.lang = 'en-IN'; // Default to English, can be changed to 'hi-IN' for Hindi
            
            button.addEventListener('click', () => {
                recognition.start();
                button.classList.add('listening');
                
                recognition.onresult = (event) => {
                    const transcript = event.results[0][0].transcript;
                    field.value = transcript;
                    button.classList.remove('listening');
                    
                    // Trigger validation after voice input
                    if (fieldId === 'pan') validatePAN(field);
                    else if (fieldId === 'gstin') validateGSTIN(field);
                    else if (fieldId === 'tan') validateTAN(field);
                    else if (fieldId === 'name') validateName(field);
                };
                
                recognition.onerror = () => {
                    button.classList.remove('listening');
                };
            });
        } else if (button) {
            button.style.display = 'none'; // Hide button if speech API not supported
        }
    });
}

// Initialize 3D elements
function init3DElements() {
    // This would be more complex in a real implementation with Three.js
    // For now we're using CSS transforms for simple 3D effects
    const cube = document.querySelector('.tax-cube');
    if (cube) {
        document.addEventListener('mousemove', (e) => {
            const xAxis = (window.innerWidth / 2 - e.pageX) / 25;
            const yAxis = (window.innerHeight / 2 - e.pageY) / 25;
            cube.style.transform = `translate(-50%, -50%) rotateX(${yAxis}deg) rotateY(${xAxis}deg)`;
        });
    }
}

// BharatOS Security Verification
function verifySecurity() {
    // In a real implementation, this would check TPM status and other security features
    console.log('Performing BharatOS security verification...');
    
    // Simulate security check
    setTimeout(() => {
        const securityStatus = document.querySelector('.security-status');
        if (securityStatus) {
            securityStatus.innerHTML += ' <i class="fas fa-check-circle"></i> Verified';
        }
    }, 2000);
    
    return true;
}

// Service Worker Registration for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').then(registration => {
            console.log('ServiceWorker registration successful');
        }).catch(err => {
            console.log('ServiceWorker registration failed: ', err);
        });
    });
}
