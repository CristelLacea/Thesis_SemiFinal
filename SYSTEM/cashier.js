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

// --- 1. INITIALIZATION & DATA SETUP ---
let products = []; 
let cart = [];
let scannerStrokeBuffer = "";
let lastStrokeTimestamp = Date.now();
let scanStartTime = null; // Tracks when the current scan burst started

// --- 2. DATABASE FETCH INTERFACE ---
async function loadProductsFromDB() {
    try {
        const response = await fetch('http://localhost:3000/api/products');
        products = await response.json();
    } catch (error) {
        console.error("Cashier failed to load products:", error);
    }
}

// --- 3. CORE CHECKOUT & CART ENGINE ---
function addToCart(id) {
    const prod = products.find(p => p.prod_id === id);
    if (!prod || prod.stock_Qty <= 0) return alert("Out of Stock!");
    
    const itemInCart = cart.find(c => c.prod_id === id);
    const salePrice = prod.orig_price + prod.price_capital;

    if (itemInCart) {
        if (itemInCart.qty < prod.stock_Qty) {
            itemInCart.qty++;
        } else {
            alert("Maximum stock reached!");
        }
    } else {
        cart.push({ 
            prod_id: prod.prod_id, 
            prod_name: prod.prod_name, 
            price: salePrice, 
            orig_price: prod.orig_price, 
            qty: 1 
        });
    }

    // 🟢 FORCE UI REFRESH
    // Ensure the scanner panel is removed and the table is injected
    updateCartUI(); 
    
    // Explicitly hide the scanner panel if it's still visible due to DOM caching
    const scannerPanel = document.querySelector('.scanner-status-panel');
    if (scannerPanel && cart.length > 0) {
        scannerPanel.style.display = 'none';
    }
}

function changeQty(id, delta) {
    const item = cart.find(c => c.prod_id === id);
    if (!item) return;
    
    const prod = products.find(p => p.prod_id === id);
    
    if (delta > 0) {
        if (item.qty < prod.stock_Qty) item.qty++;
        else alert("Maximum stock reached!");
    } else {
        item.qty--;
        if (item.qty <= 0) {
            cart = cart.filter(c => c.prod_id !== id);
        }
    }
    updateCartUI();
}

// --- 4. UPGRADED TABULAR RETAIL UI ENGINE (BUG 3 FIXED) ---
function updateCartUI() {
    const list = document.getElementById('orderList');
    if (!list) return;
    list.innerHTML = '';
    
    let grandTotal = 0;

    // A. Cart is empty -> show the modern grocery status template
    if (cart.length === 0) {
        list.innerHTML = `
            <div class="scanner-status-panel" style="flex: 1; background: linear-gradient(135deg, #1d2b38, #111a22); border-radius: 20px; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; text-align: center; padding: 40px; height: 100%;">
                <div class="barcode-laser-icon" style="font-size: 4.5rem; color: #ff7675; margin-bottom: 15px; text-shadow: 0 0 15px rgba(255,118,117,0.4);">
                    <i class="fa-solid fa-barcode"></i>
                </div>
                <h3 style="font-weight: 800; font-size: 1.4rem; letter-spacing: 0.5px;">Scanner Interface Engaged</h3>
                <p style="color: #94a3b8; font-size: 0.9rem; margin-top: 5px; max-width: 320px;">Point device at a product barcode to automatically increment your checkout invoice ledger.</p>
            </div>`;
        
        document.getElementById('totalPrice').innerText = "₱0.00";
        document.getElementById('changeAmount').innerText = "₱0.00";
        return;
    }

    // B. Cart has active rows -> compile clean item subtotal rows natively
    let itemsHTML = `
        <div style="background: white; border-radius: 15px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
                <thead>
                    <tr style="background: #f8fafc; border-bottom: 2px solid #edf2f7; color: #64748b; font-size: 0.85rem; text-transform: uppercase;">
                        <th style="padding: 15px;">Product Name</th>
                        <th style="padding: 15px; text-align: center;">Unit Price</th>
                        <th style="padding: 15px; text-align: center;">Quantity</th>
                        <th style="padding: 15px; text-align: right;">Subtotal</th>
                    </tr>
                </thead>
                <tbody>`;

    cart.forEach(item => {
        const itemSubtotal = item.price * item.qty;
        grandTotal += itemSubtotal;
        
        itemsHTML += `
            <tr style="border-bottom: 1px solid #f1f5f9; font-size: 1rem; color: #1e293b;">
                <td style="padding: 15px; font-weight: 600;">${item.prod_name}</td>
                <td style="padding: 15px; text-align: center; color: #64748b;">₱${item.price.toFixed(2)}</td>
                <td style="padding: 15px; text-align: center;">
                    <div style="display: inline-flex; align-items: center; gap: 8px; background: #f1f5f9; padding: 4px 8px; border-radius: 8px;">
                        <button onclick="changeQty(${item.prod_id}, -1)" style="border: none; background: none; font-weight: bold; cursor: pointer; padding: 0 5px; color: #64748b;">-</button>
                        <span style="font-weight: bold; min-width: 20px; text-align: center;">${item.qty}</span>
                        <button onclick="changeQty(${item.prod_id}, 1)" style="border: none; background: none; font-weight: bold; cursor: pointer; padding: 0 5px; color: #64748b;">+</button>
                    </div>
                </td>
                <td style="padding: 15px; text-align: right; font-weight: 700; color: #1d2b38;">₱${itemSubtotal.toFixed(2)}</td>
            </tr>`;
    });

    itemsHTML += `</tbody></table></div>`;
    list.innerHTML = itemsHTML;

    // Cache absolute totals directly on dataset properties
    const totalContainer = document.getElementById('totalPrice');
    totalContainer.innerText = `₱${grandTotal.toFixed(2)}`;
    totalContainer.dataset.rawTotal = grandTotal;

    calculateChange();
}

function calculateChange() {
    const totalContainer = document.getElementById('totalPrice');
    if (!totalContainer) return;
    
    const total = parseFloat(totalContainer.dataset.rawTotal) || 0;
    const cash = parseFloat(document.getElementById('cashReceived').value) || 0;

    if (total === 0) {
        document.getElementById('changeAmount').innerText = "₱0.00";
        return; 
    }

    const change = cash - total;
    document.getElementById('changeAmount').innerText = `₱${(change >= 0 ? change : 0).toFixed(2)}`;
}

// --- 5. ONSCREEN INTERACTIVE NUMPAD HANDLER (BUG 2 FIXED) ---
function pressNum(val) {
    const input = document.getElementById('cashReceived');
    if (!input) return;
    
    if (val === 'C') {
        input.value = '';
    } else {
        if (val === '.' && input.value.includes('.')) return;
        input.value += val;
    }
    
    // Force math calculations to execute when screen button matrix elements are clicked
    calculateChange(); 
}

// --- 6. UNIFIED HARDWARE SCANNER & KEYBOARD LISTENER ---

const scannerInput = document.getElementById('scannerFocus');
const searchInput = document.getElementById('searchProduct');

searchInput.addEventListener('input', (e) => {
    const val = searchInput.value.trim();
    // Assuming barcodes are 12-13 digits long
    if (val.length >= 12) { 
        const foundItem = products.find(p => String(p.barcode_number) === val);
        if (foundItem) {
            addToCart(foundItem.prod_id);
            searchInput.value = ""; // Clear automatically
            
            // Force hidden banner to hide
            const panel = document.querySelector('.scanner-status-panel');
            if (panel) panel.style.display = 'none';
        }
    }
});

// Force focus to the invisible scanner input on every click
document.addEventListener('click', (e) => {
    // If we aren't clicking the cash input or search input, move focus back to scanner
    if (e.target.id !== 'cashReceived' && e.target.id !== 'searchProduct') {
        scannerInput.focus();
    }
});

document.addEventListener('click', (e) => {
    // If we click anywhere EXCEPT the numpad/search, focus scanner
    if (e.target.id !== 'searchProduct' && !e.target.closest('.numpad')) {
        scannerInput.focus();
    }
});

document.addEventListener('keydown', async (e) => {
    // 1. Existing firewall — ignore if typing in search box or numpad
    if (document.activeElement.id === 'searchProduct') return;
    if (e.target.closest('.numpad')) return;

    const timeNow = Date.now();
    const timeSinceLastKey = timeNow - lastStrokeTimestamp;

    // --- SCANNER DETECTION ---
    // Hardware barcode scanners fire keys extremely fast (< 50ms per key).
    // We track scanStartTime so EVERY digit in the burst — including the first — is detected.
    if (timeSinceLastKey > 50) {
        // Gap is too long: reset buffer. This might be the START of a new scan burst.
        scannerStrokeBuffer = "";
        scanStartTime = null;
    }
    lastStrokeTimestamp = timeNow;

    // Detect scan burst: if the next key arrives within 50ms of the buffer having content,
    // OR if this is the very first digit and the buffer was just reset (scanStartTime not yet set).
    if (e.key.length === 1 && /[0-9]/.test(e.key) && scanStartTime === null) {
        // First digit of a potential scan — record the burst start time
        scanStartTime = timeNow;
    }
    const isLikelyScanner = scanStartTime !== null && timeSinceLastKey < 50;

    if (e.key === 'Enter') {
        e.preventDefault();
        const barcode = scannerInput.value.trim() || scannerStrokeBuffer;
        
        if (barcode.length > 3) {
            const foundItem = products.find(p => String(p.barcode_number) === barcode);
            if (foundItem) {
                addToCart(foundItem.prod_id);
                
                // Clear any digit that leaked into cashReceived during the scan burst
                const cashInput = document.getElementById('cashReceived');
                if (cashInput && isNaN(parseFloat(cashInput.value))) {
                    cashInput.value = '';
                    calculateChange();
                } else if (cashInput && scannerStrokeBuffer.length > 3) {
                    // A long barcode was leaking — wipe it
                    cashInput.value = '';
                    calculateChange();
                }

                const dropdown = document.getElementById('cashierDropdownResults');
                if (dropdown) dropdown.style.display = 'none';
                
                const panel = document.querySelector('.scanner-status-panel');
                if (panel) panel.style.display = 'none';
            } else {
                alert(`Product barcode [${barcode}] not registered.`);
            }
            
            scannerInput.value = "";
            scannerStrokeBuffer = "";
            scanStartTime = null;
        }
        return;
    }

    // Build scanner stroke buffer for digit keys
    if (e.key.length === 1 && /[0-9]/.test(e.key)) {
        scannerStrokeBuffer += e.key;
    }

    // --- KEY GUARD: If this keystroke is part of a fast scanner burst,
    // prevent it from reaching the cashReceived input entirely ---
    if (isLikelyScanner) {
        e.preventDefault();
        return;
    }

    // If cashReceived is deliberately focused by the user (slow typing), allow normal input
    if (document.activeElement.id === 'cashReceived') {
        setTimeout(() => { calculateChange(); }, 10);
        return;
    }

    // Global keyboard numpad shortcuts ONLY when cashReceived is NOT focused
    if ((e.key >= '0' && e.key <= '9') || e.key === '.') {
        e.preventDefault();
        const input = document.getElementById('cashReceived');
        if (e.key === '.' && input.value.includes('.')) return;
        input.value += e.key;
        calculateChange();
    } else if (e.key === 'Backspace') {
        e.preventDefault();
        const input = document.getElementById('cashReceived');
        input.value = input.value.slice(0, -1);
        calculateChange();
    } else if (e.key === 'Escape') {
        e.preventDefault();
        document.getElementById('cashReceived').value = '';
        calculateChange();
    }
});

function liveCashierSearch(searchQuery) {
    // 🟢 STOP the dropdown from ever appearing if the input is long enough to be a barcode
    // Most barcodes are 12+ digits. If you type a name, it's usually shorter.
    if (searchQuery.length >= 10) {
        const dropdownMenu = document.getElementById('cashierDropdownResults');
        if (dropdownMenu) dropdownMenu.style.display = 'none';
        return;
    }

    const dropdownMenu = document.getElementById('cashierDropdownResults');
    if (!dropdownMenu) return;

    if (!searchQuery || searchQuery.trim() === "") {
        dropdownMenu.style.display = 'none';
        return;
    }

    // FIX: Look up by both product name AND barcode number string matches
    const matchedItems = products.filter(p => {
        const nameMatch = p.prod_name && p.prod_name.toLowerCase().includes(searchQuery.toLowerCase());
        
        const barcodeStr = p.barcode_number ? String(p.barcode_number).toLowerCase() : '';
        const barcodeMatch = barcodeStr.includes(searchQuery.toLowerCase());
        
        return (nameMatch || barcodeMatch) && p.stock_Qty > 0;
    });

    // Sort matched products alphabetically
    matchedItems.sort((a, b) => a.prod_name.localeCompare(b.prod_name));

    if (matchedItems.length > 0) {
        dropdownMenu.innerHTML = matchedItems.map(p => {
            const retailPrice = p.orig_price + p.price_capital;
            return `
                <div class="dropdown-row" onclick="handleDropdownSelection(${p.prod_id})"
                     style="display: flex; justify-content: space-between; align-items: center; padding: 12px 20px; cursor: pointer; border-bottom: 1px solid #f1f5f9; background: white; transition: 0.2s;">
                    <span style="font-weight: 600; color: #334155;">${p.prod_name}</span>
                    <strong style="color: #10b981;">₱${retailPrice.toFixed(2)}</strong>
                </div>`;
        }).join('');
        dropdownMenu.style.display = 'block';
    } else {
        dropdownMenu.innerHTML = '<div style="padding: 15px; text-align: center; color: #94a3b8; background: white;">No matching products available</div>';
        dropdownMenu.style.display = 'block';
    }
}

function handleDropdownSelection(productId) {
    addToCart(productId);
    document.getElementById('searchProduct').value = "";
    document.getElementById('cashierDropdownResults').style.display = 'none';
}

// Global click wrapper interceptor to hide dropdown elements on focus outs (BUG 1 FIXED)
window.addEventListener('click', function(e) {
    const dropdown = document.getElementById('cashierDropdownResults');
    const searchInput = document.getElementById('searchProduct');
    if (dropdown && e.target !== dropdown && e.target !== searchInput) {
        dropdown.style.display = 'none';
    }
});

// --- 8. TRANSACTION LOGGING & DATABASE SYNC ---
async function processTransaction() {
    if (cart.length === 0) return alert("Cart is empty!");
    
    const totalContainer = document.getElementById('totalPrice');
    const total = parseFloat(totalContainer.dataset.rawTotal);
    
    const cash = parseFloat(document.getElementById('cashReceived').value) || 0;
    if (cash < total) return alert("Insufficient Cash!");

    let transactionProfit = 0;

    try {
        for (const item of cart) {
            const p = products.find(prod => prod.prod_id === item.prod_id);
            const newStock = p.stock_Qty - item.qty;
            transactionProfit += (item.price - p.orig_price) * item.qty;
            await updateStockInMySQL(item.prod_id, newStock);
        }

        const saleData = {
            total_amount: total,
            total_profit: transactionProfit,
            items_json: JSON.stringify(cart.map(i => ({ name: i.prod_name, qty: i.qty })))
        };

        const saveRes = await fetch('http://localhost:3000/api/save-sale', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-user-email': localStorage.getItem('currentUser') || 'system@weljo.com'
            },
            body: JSON.stringify(saleData)
        });
        const saveResult = await saveRes.json();

        const printReceiptOption = confirm("Transaction recorded! Would you like to print the official customer receipt?");
        if (printReceiptOption) {
            const currentChange = cash - total;
            generateThermalReceipt(saveResult.id || "0000", total, cash, currentChange, cart);
        }

        cart = [];
        document.getElementById('cashReceived').value = '';
        await loadProductsFromDB(); 
        updateCartUI();
    } catch (error) {
        console.error(error);
        alert("Database Error: Could not save sale.");
    }
}

async function updateStockInMySQL(prod_id, newStock) {
    const p = products.find(item => item.prod_id === prod_id);
    const updatedData = {
        barcode: p.barcode_number, // 🟢 ADD THIS LINE
        name: p.prod_name,
        category: p.prod_category,
        orig_price: p.orig_price,
        price_capital: p.price_capital,
        stock: newStock,
        expiry: p.expiry_Date,
        img: p.img_Url,
        fav: p.Favorite
    };

    const response = await fetch(`http://localhost:3000/api/update-product/${prod_id}`, {
        method: 'PUT',
        headers: { 
            'Content-Type': 'application/json',
            'x-user-email': localStorage.getItem('currentUser') || 'system@weljo.com'
        },
        body: JSON.stringify(updatedData)
    });

    if (!response.ok) throw new Error("Failed to update stock in Database");
}

// --- 9. THERMAL RECEIPT LAYOUT SUB-SYSTEM ---
function generateThermalReceipt(saleId, totalAmount, cashReceived, changeAmount, itemsList) {
    let existingPrintArea = document.getElementById('receipt-print-area');
    if (existingPrintArea) existingPrintArea.remove();

    const printArea = document.createElement('div');
    printArea.id = 'receipt-print-area';
    const cleanDate = new Date().toLocaleString();

    printArea.innerHTML = `
        <div class="ticket-wrapper">
            <div class="receipt-brand">WELJO'S STORE</div>
            <div class="receipt-subhead">Balilihan, Bohol, Philippines</div>
            <div class="receipt-divider">================================</div>
            
            <div class="meta-row"><strong>INVOICE ID:</strong> #${saleId}</div>
            <div class="meta-row"><strong>DATE:</strong> ${cleanDate}</div>
            <div class="receipt-divider">--------------------------------</div>
            
            <div class="items-header">
                <span>ITEM DESCRIPTION</span>
                <span>QTY</span>
                <span>TOTAL</span>
            </div>
            <div class="receipt-divider">--------------------------------</div>
            
            <div class="receipt-items-list">
                ${itemsList.map(i => `
                    <div class="receipt-item-row">
                        <span class="item-name-col">${i.prod_name}</span>
                        <span>x${i.qty}</span>
                        <span>₱${(i.price * i.qty).toFixed(2)}</span>
                    </div>
                `).join('')}
            </div>
            
            <div class="receipt-divider">--------------------------------</div>
            <div class="summary-line grand-total-row"><span>TOTAL AMOUNT:</span> <span>₱${totalAmount.toFixed(2)}</span></div>
            <div class="receipt-divider">--------------------------------</div>
            <div class="summary-line"><span>CASH TENDERED:</span> <span>₱${cashReceived.toFixed(2)}</span></div>
            <div class="summary-line"><span>CHANGE DUE:</span> <span>₱${changeAmount.toFixed(2)}</span></div>
            
            <div class="receipt-divider">================================</div>
            <div class="receipt-footer">
                Thank You For Shopping With Us!<br>
                Please Keep This Copy For Your Records.
            </div>
        </div>`;

    document.body.appendChild(printArea);
    window.print();
    printArea.remove();
}

async function handleLogout() {
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
    localStorage.clear();
    window.location.href = 'login.html';
}

function setupNavButton() {
    const navBottom = document.getElementById('navBottom');
    const role = localStorage.getItem('userRole');
    if (!navBottom) return;

    if (role && role.toLowerCase() === 'admin') {
        navBottom.innerHTML = `
            <button onclick="location.href='dashboard.html'" class="cat-btn" style="border: none; background: none; cursor: pointer; width: 100%; text-align: left; padding: 15px 20px; color: #94a3b8;">
                <i class="fa-solid fa-arrow-left"></i> Back to Dashboard
            </button>`;
    } else {
        navBottom.innerHTML = `
            <button onclick="handleLogout()" class="cat-btn" style="color: #ff7675; border: none; background: none; cursor: pointer; width: 100%; text-align: left; padding: 15px 20px;">
                <i class="fa-solid fa-arrow-right-from-bracket"></i> Logout
            </button>`;
    }
}

// --- 10. SYSTEM STARTUP SETUP ---
window.onload = async () => {
    await loadProductsFromDB(); // Force the system to wait until MySQL returns the data
    setupNavButton();
    updateCartUI(); 
    if (typeof startHeartbeat === 'function') startHeartbeat();
};

window.addEventListener('focus', async () => {
    console.log("Cashier tab focused. Syncing fresh inventory state from MySQL...");
    await loadProductsFromDB();
});

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
    setInterval(ping, 25000);
}
