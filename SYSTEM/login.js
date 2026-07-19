// --- DYNAMIC BACKEND DEPLOYMENT ROUTING INTERCEPTOR ---
const originalFetch = window.fetch;
window.fetch = function (url, options = {}) {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const remoteBackendUrl = 'https://weljo-backend.onrender.com'; // TODO: Update with your Render URL
    
    let processedUrl = url;
    if (!isLocal && typeof url === 'string' && url.startsWith('http://localhost:3000')) {
        processedUrl = url.replace('http://localhost:3000', remoteBackendUrl);
    }
    return originalFetch(processedUrl, options);
};

document.querySelector('.login-form').addEventListener('submit', function(e) {
    e.preventDefault(); 
    
    const emailInput = document.getElementById('email').value;
    const passwordInput = document.getElementById('password').value;

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
            // We use .toLowerCase() to prevent issues with "Admin" vs "admin"
            const role = data.role.toLowerCase();

            if (role === 'admin') {
                window.location.href = 'dashboard.html'; 
            } else if (role === 'cashier') {
                window.location.href = 'cashier.html'; 
            } else {
                alert("Role not recognized. Contact Admin.");
            }
        } else {
            alert(data.message);
            document.getElementById('password').value = "";
        }
    })
    .catch(error => {
        console.error('Error:', error);
        alert("Cannot connect to server. Is your Node.js running?");
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