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

// Use localStorage to match your login.js and management.js
const role = localStorage.getItem('userRole');

if (!role) {
    alert("Please login first.");
    window.location.href = 'login.html';
} else if (role.toLowerCase() !== 'admin') {
    // This protects your Admin Dashboard from Cashier accounts
    alert("Access Denied: Admin privileges required.");
    window.location.href = 'cashier.html'; 
}

async function handleLogout(event) {
    if (event) event.preventDefault();
    
    const email = localStorage.getItem('currentUser');
    if (email) {
        try {
            await fetch('http://localhost:3000/api/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-email': email
                },
                body: JSON.stringify({ email })
            });
        } catch (err) {
            console.error("Logout API call failed:", err);
        }
    }
    
    // Clear all stored session data
    localStorage.clear();
    
    // Immediately redirect to the login page
    window.location.href = 'login.html';
}