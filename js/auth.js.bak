// Authentication JavaScript
document.addEventListener('DOMContentLoaded', function() {
    // Initialize authentication forms
    initLoginForm();
    initSignupForm();
    initPasswordToggle();
    initPasswordStrength();
});

// Initialize login form
function initLoginForm() {
    const loginForm = document.getElementById('login-form');
    if (!loginForm) return;
    
    loginForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const email = document.getElementById('login-email').value.trim();
        const password = document.getElementById('login-password').value.trim();
        const rememberMe = document.getElementById('remember-me').checked;
        
        // Validate inputs
        let isValid = true;
        
        if (!email) {
            document.getElementById('email-error').textContent = 'Please enter your email';
            document.getElementById('email-error').style.display = 'block';
            isValid = false;
        } else if (!validateEmail(email)) {
            document.getElementById('email-error').textContent = 'Please enter a valid email';
            document.getElementById('email-error').style.display = 'block';
            isValid = false;
        } else {
            document.getElementById('email-error').style.display = 'none';
        }
        
        if (!password) {
            document.getElementById('password-error').textContent = 'Please enter your password';
            document.getElementById('password-error').style.display = 'block';
            isValid = false;
        } else {
            document.getElementById('password-error').style.display = 'none';
        }
        
        if (isValid) {
            // Simulate login - in a real app this would call your backend
            simulateLogin(email, password, rememberMe);
        }
    });
}

// Initialize signup form
function initSignupForm() {
    const signupForm = document.getElementById('signup-form');
    if (!signupForm) return;
    
    signupForm.addEventListener('submit', function(e) {
        e.preventDefault();
        
        const name = document.getElementById('signup-name').value.trim();
        const email = document.getElementById('signup-email').value.trim();
        const mobile = document.getElementById('signup-mobile').value.trim();
        const password = document.getElementById('signup-password').value.trim();
        const confirmPassword = document.getElementById('signup-confirm').value.trim();
        const agreeTerms = document.getElementById('agree-terms').checked;
        
        // Validate inputs
        let isValid = true;
        
        if (!name) {
            document.getElementById('name-error').textContent = 'Please enter your name';
            document.getElementById('name-error').style.display = 'block';
            isValid = false;
        } else {
            document.getElementById('name-error').style.display = 'none';
        }
        
        if (!email) {
            document.getElementById('email-error').textContent = 'Please enter your email';
            document.getElementById('email-error').style.display = 'block';
            isValid = false;
        } else if (!validateEmail(email)) {
            document.getElementById('email-error').textContent = 'Please enter a valid email';
            document.getElementById('email-error').style.display = 'block';
            isValid = false;
        } else {
            document.getElementById('email-error').style.display = 'none';
        }
        
        if (!mobile) {
            document.getElementById('mobile-error').textContent = 'Please enter your mobile number';
            document.getElementById('mobile-error').style.display = 'block';
            isValid = false;
        } else if (!validateMobile(mobile)) {
            document.getElementById('mobile-error').textContent = 'Please enter a valid 10-digit mobile number';
            document.getElementById('mobile-error').style.display = 'block';
            isValid = false;
        } else {
            document.getElementById('mobile-error').style.display = 'none';
        }
        
        if (!password) {
            document.getElementById('password-error').textContent = 'Please enter a password';
            document.getElementById('password-error').style.display = 'block';
            isValid = false;
        } else if (password.length < 8) {
            document.getElementById('password-error').textContent = 'Password must be at least 8 characters';
            document.getElementById('password-error').style.display = 'block';
            isValid = false;
        } else {
            document.getElementById('password-error').style.display = 'none';
        }
        
        if (!confirmPassword) {
            document.getElementById('confirm-error').textContent = 'Please confirm your password';
            document.getElementById('confirm-error').style.display = 'block';
            isValid = false;
        } else if (password !== confirmPassword) {
            document.getElementById('confirm-error').textContent = 'Passwords do not match';
            document.getElementById('confirm-error').style.display = 'block';
            isValid = false;
        } else {
            document.getElementById('confirm-error').style.display = 'none';
        }
        
        if (!agreeTerms) {
            alert('Please agree to the Terms of Service and Privacy Policy');
            isValid = false;
        }
        
        if (isValid) {
            // Simulate signup - in a real app this would call your backend
            simulateSignup(name, email, mobile, password);
        }
    });
}

// Initialize password toggle
function initPasswordToggle() {
    document.querySelectorAll('.toggle-password').forEach(button => {
        button.addEventListener('click', function() {
            const input = this.previousElementSibling;
            const icon = this.querySelector('i');
            
            if (input.type === 'password') {
                input.type = 'text';
                icon.classList.remove('fa-eye');
                icon.classList.add('fa-eye-slash');
            } else {
                input.type = 'password';
                icon.classList.remove('fa-eye-slash');
                icon.classList.add('fa-eye');
            }
        });
    });
}

// Initialize password strength meter
function initPasswordStrength() {
    const passwordInput = document.getElementById('signup-password');
    if (!passwordInput) return;
    
    passwordInput.addEventListener('input', function() {
        const password = this.value;
        const strengthBar = document.querySelector('.strength-bar');
        const strengthText = document.querySelector('.strength-text');
        
        // Calculate password strength
        let strength = 0;
        
        // Length check
        if (password.length >= 8) strength += 1;
        if (password.length >= 12) strength += 1;
        
        // Character variety checks
        if (/[A-Z]/.test(password)) strength += 1; // Uppercase
        if (/[a-z]/.test(password)) strength += 1; // Lowercase
        if (/[0-9]/.test(password)) strength += 1; // Numbers
        if (/[^A-Za-z0-9]/.test(password)) strength += 1; // Special chars
        
        // Update UI
        let width = 0;
        let color = '';
        let text = '';
        
        if (strength <= 2) {
            width = 33;
            color = 'var(--danger)';
            text = 'Weak';
        } else if (strength <= 4) {
            width = 66;
            color = 'var(--warning)';
            text = 'Medium';
        } else {
            width = 100;
            color = 'var(--success)';
            text = 'Strong';
        }
        
        strengthBar.style.width = `${width}%`;
        strengthBar.style.backgroundColor = color;
        strengthText.textContent = text;
        strengthText.style.color = color;
    });
}

// Helper function to validate email
function validateEmail(email) {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
}

// Helper function to validate mobile
function validateMobile(mobile) {
    const re = /^[6-9][0-9]{9}$/;
    return re.test(mobile);
}

// Simulate login (replace with actual API call)
function simulateLogin(email, password, rememberMe) {
    console.log('Simulating login with:', { email, password, rememberMe });
    
    // Show loading state
    const submitBtn = document.querySelector('#login-form button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Logging in...';
    submitBtn.disabled = true;
    
    // Simulate API delay
    setTimeout(() => {
        // In a real app, you would check the response from your backend
        const success = true; // Simulate successful login
        
        if (success) {
            // Store session (in a real app, you'd get a token from your backend)
            if (rememberMe) {
                localStorage.setItem('authToken', 'simulated-token');
            } else {
                sessionStorage.setItem('authToken', 'simulated-token');
            }
            
            // Redirect to dashboard
            window.location.href = 'dashboard.html';
        } else {
            alert('Invalid email or password');
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    }, 1500);
}

// Simulate signup (replace with actual API call)
function simulateSignup(name, email, mobile, password) {
    console.log('Simulating signup with:', { name, email, mobile, password });
    
    // Show loading state
    const submitBtn = document.querySelector('#signup-form button[type="submit"]');
    const originalText = submitBtn.textContent;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating account...';
    submitBtn.disabled = true;
    
    // Simulate API delay
    setTimeout(() => {
        // In a real app, you would check the response from your backend
        const success = true; // Simulate successful signup
        
        if (success) {
            alert('Account created successfully! Please login.');
            window.location.href = 'login.html';
        } else {
            alert('Error creating account. Please try again.');
            submitBtn.textContent = originalText;
            submitBtn.disabled = false;
        }
    }, 2000);
              }
