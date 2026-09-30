// --- DYNAMIC BACKEND DEPLOYMENT ROUTING INTERCEPTOR ---
const originalFetch = window.fetch;
window.fetch = function (url, options = {}) {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const remoteBackendUrl = 'https://thesis-semifinal.onrender.com'; 
    
    let processedUrl = url;
    if (!isLocal && typeof url === 'string' && url.startsWith('http://localhost:3000')) {
        processedUrl = url.replace('http://localhost:3000', remoteBackendUrl);
    }
    return originalFetch(processedUrl, options);
};

let isLoggingIn = false;
document.querySelector('.login-form').addEventListener('submit', function(e) {
    e.preventDefault(); 
    if (isLoggingIn) return;
    
    const emailInput = document.getElementById('email').value.trim();
    const passwordInput = document.getElementById('password').value;
    const submitBtn = document.querySelector('.login-btn');

    isLoggingIn = true;
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Logging in...';
    }

    fetch('http://localhost:3000/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            email: emailInput,
            password: passwordInput
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.status === "success") {
            // 1. SAVE DATA FOR AUDIT LOGS & SESSION
            localStorage.setItem('userRole', data.role); 
            localStorage.setItem('currentUser', data.email);

            // 2. REDIRECT BASED ON DATABASE ROLE
            const role = data.role.toLowerCase();

            if (role === 'admin') {
                window.location.href = 'dashboard.html'; 
            } else if (role === 'cashier') {
                window.location.href = 'cashier.html'; 
            } else {
                alert("Role not recognized. Contact Admin.");
                isLoggingIn = false;
                if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = 'Login'; }
            }
        } else {
            alert(data.message);
            document.getElementById('password').value = "";
            isLoggingIn = false;
            if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = 'Login'; }
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert("Cannot connect to server. Is your Node.js running?");
        isLoggingIn = false;
        if (submitBtn) { submitBtn.disabled = false; submitBtn.innerText = 'Login'; }
    });
});

// --- PASSWORD TOGGLE LOGIC (FIXED) ---
const togglePassword = document.querySelector('#togglePassword'); 
const passwordField = document.getElementById('password');

if (togglePassword && passwordField) {
    togglePassword.addEventListener('click', function() {
    
        const type = passwordField.getAttribute('type') === 'password' ? 'text' : 'password';
        passwordField.setAttribute('type', type);
        
       
        this.classList.toggle('fa-eye');
        this.classList.toggle('fa-eye-slash');

        this.style.transform = 'translateY(-50%) scale(0.9)';
        setTimeout(() => {
            this.style.transform = 'translateY(-50%) scale(1)';
        }, 100);
    });
}