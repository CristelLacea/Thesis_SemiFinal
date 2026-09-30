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

// Track internal navigation vs true window exit
document.addEventListener('click', (e) => {
    const target = e.target.closest('a, button');
    if (target && !target.classList.contains('logout-link')) {
        sessionStorage.setItem('nav_internal', '1');
        setTimeout(() => sessionStorage.removeItem('nav_internal'), 2000);
    }
});

// Auto-notify server on window/tab exit
window.addEventListener('pagehide', () => {
    if (sessionStorage.getItem('nav_internal')) return;
    const email = localStorage.getItem('currentUser');
    if (!email) return;
    
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const exitUrl = isLocal ? 'http://localhost:3000/api/session-exit' : 'https://thesis-semifinal.onrender.com/api/session-exit';
    const payload = JSON.stringify({ email });
    
    if (navigator.sendBeacon) {
        const blob = new Blob([payload], { type: 'application/json' });
        navigator.sendBeacon(exitUrl, blob);
    } else {
        fetch(exitUrl, { method: 'POST', body: payload, headers: { 'Content-Type': 'application/json' }, keepalive: true });
    }
});

// Start heartbeat while dashboard is open
function startHeartbeat() {
    const email = localStorage.getItem('currentUser');
    if (!email) return;
    
    const ping = () => {
        fetch('http://localhost:3000/api/users/heartbeat', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-email': email
            },
            body: JSON.stringify({ email })
        }).catch(e => console.warn("Heartbeat error:", e));
    };

    ping();
    setInterval(ping, 15000);
}
startHeartbeat();

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
    sessionStorage.clear();
    
    // Immediately redirect to the login page
    window.location.href = 'login.html';
}