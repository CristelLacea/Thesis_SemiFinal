// --- INITIALIZATION ---
// Override window.fetch to automatically attach current user email and override endpoint URLs for cloud routing
const originalFetch = window.fetch;
window.fetch = function (url, options = {}) {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const remoteBackendUrl = 'https://thesis-semifinal.onrender.com'; 
    
    let processedUrl = url;
    if (!isLocal && typeof url === 'string' && url.startsWith('http://localhost:3000')) {
        processedUrl = url.replace('http://localhost:3000', remoteBackendUrl);
    }

    const email = localStorage.getItem('currentUser');
    if (email) {
        if (!options.headers) options.headers = {};
        if (options.headers instanceof Headers) {
            options.headers.set('x-user-email', email);
        } else {
            options.headers['x-user-email'] = email;
        }
    }
    return originalFetch(processedUrl, options);
};

let products = JSON.parse(localStorage.getItem('weljo_products')) || [];
let salesData = JSON.parse(localStorage.getItem('weljo_sales')) || [];
let priceHistory = JSON.parse(localStorage.getItem('weljo_price_history')) || [];
let editId = null;
let currentRange = 'weekly';
let currentStatPeriod = 'day'; // Holds the master analytics timeline context

function closeModalByName(modalId) {
    const modal = document.getElementById(modalId);
    if (modal) modal.style.display = 'none';
}

// --- 1. NAVIGATION (The "White Screen" Fix) ---
function showSection(id) {
    const sections = document.querySelectorAll('.content-section');
    sections.forEach(s => {
        s.classList.remove('active');
        s.style.display = 'none';
    });

    const target = document.getElementById(id);
    if (target) {
        target.classList.add('active');
        target.style.display = 'block';
    }

    // Sidebar Active State
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const activeBtn = Array.from(document.querySelectorAll('.nav-btn')).find(b => {
        const attr = b.getAttribute('onclick');
        return attr && attr.includes(id);
    });
    if (activeBtn) activeBtn.classList.add('active');
    
    // Trigger specific logic per tab
    if (id === 'dashboard-overview') {
        const startInput = document.getElementById('chartStartDate');
        const endInput = document.getElementById('chartEndDate');
        const today = new Date();
        if (endInput && !endInput.value) {
            endInput.value = today.toLocaleDateString('sv-SE');
        }
        if (startInput && !startInput.value) {
            const d = new Date();
            d.setDate(today.getDate() - 14);
            startInput.value = d.toLocaleDateString('sv-SE');
        }
        updateOverview();
        initChart();
    }
    if (id === 'inventory-section') { 
        console.log("Navigating to Inventory, rendering table...");
        backToCategoryHub();
    }
    if (id === 'statistics-section') {
        const startInput = document.getElementById('statsStartDate');
        const endInput = document.getElementById('statsEndDate');
        const today = new Date();
        if (endInput && !endInput.value) {
            endInput.value = today.toLocaleDateString('sv-SE');
        }
        if (startInput && !startInput.value) {
            const d = new Date();
            d.setDate(today.getDate() - 30);
            startInput.value = d.toLocaleDateString('sv-SE');
        }
        loadStatsEngine();
    }
    if (id === 'history-section') { backToHistoryHub(); }
    if (id === 'utang-section') {
        const specificView = document.getElementById('specificCustomerView');
        if (!specificView || specificView.style.display !== 'block') {
            renderCustomerFolders(); 
        }   
    }
    if (id === 'user-management-section') { 
        renderUserList(); 
    }
    if (id === 'reports-section') {
        const startInput = document.getElementById('reportStartDate');
        const endInput = document.getElementById('reportEndDate');
        const today = new Date();
        if (endInput && !endInput.value) {
            endInput.value = today.toLocaleDateString('sv-SE');
        }
        if (startInput && !startInput.value) {
            startInput.value = today.toLocaleDateString('sv-SE');
        }
        const catWrapper = document.getElementById('reportCategorySelectWrapper');
        const custWrapper = document.getElementById('reportCustomerSelectWrapper');
        if (catWrapper) {
            catWrapper.style.display = currentReportType === 'cash' ? 'flex' : 'none';
        }
        if (custWrapper) {
            custWrapper.style.display = currentReportType === 'collections' ? 'flex' : 'none';
        }
        populateReportCustomerDropdown();
        generateReportEngine();
    }
}


// --- 2. PRODUCT MANAGEMENT ---
function autoCalcSalePrice() {
    const orig = parseFloat(document.getElementById('prodOrigPrice').value) || 0;
    const capital = parseFloat(document.getElementById('prodCapital').value) || 0;
    const sale = orig + capital;
    const display = document.getElementById('autoSalePrice');
    if (display) display.innerText = `₱${sale.toFixed(2)}`;
    return sale;
}

async function openModal(event, id = null) {
    // 🟢 SAFE CHECK: Check if event exists before calling stopPropagation
    if (event && typeof event.stopPropagation === 'function') {
        event.stopPropagation();
    }
    
    const modal = document.getElementById('productModal');
    if (!modal) {
        console.error("Modal element not found!");
        return;
    }
    
    modal.style.display = 'flex';
    const barcodeInput = document.getElementById('prodBarcode');
    const stockExpiryGroup = document.getElementById('productStockExpiryGroup');
    const stockLockedInfo = document.getElementById('productStockLockedInfo');
    const lockedInfoStock = document.getElementById('lockedInfoStock');
    const prodStockInput = document.getElementById('prodStock');
    
    if (id) {
        editId = id;
        const response = await fetch('http://localhost:3000/api/products');
        const products = await response.json();
        const p = products.find(prod => prod.prod_id === id);
        
        if (p) {
            if (barcodeInput) barcodeInput.value = p.barcode_number || '';
            document.getElementById('prodName').value = p.prod_name;
            document.getElementById('prodCat').value = p.prod_category || 'food';
            document.getElementById('prodOrigPrice').value = p.orig_price;
            document.getElementById('prodCapital').value = p.price_capital;
            document.getElementById('prodImg').value = p.img_Url || '';
            const favEl = document.getElementById('prodFav'); if (favEl) favEl.checked = false;
            
            // Hide stock & expiry inputs when editing an existing product to preserve batch history
            if (stockExpiryGroup) stockExpiryGroup.style.display = 'none';
            if (prodStockInput) prodStockInput.removeAttribute('required');
            if (stockLockedInfo) stockLockedInfo.style.display = 'block';
            if (lockedInfoStock) lockedInfoStock.innerText = `${p.stock_Qty || 0} units`;

            autoCalcSalePrice();
            modal.querySelector('h3').innerText = "Edit Product Details";
        }
    } else {
        editId = null;
        document.getElementById('productForm').reset();
        document.getElementById('autoSalePrice').innerText = "₱0.00";
        
        // Show stock & expiry inputs when creating a brand-new product (Batch #1)
        if (stockExpiryGroup) stockExpiryGroup.style.display = 'block';
        if (prodStockInput) prodStockInput.setAttribute('required', 'required');
        if (stockLockedInfo) stockLockedInfo.style.display = 'none';

        modal.querySelector('h3').innerText = "Add New Product";
        if (barcodeInput) {
            setTimeout(() => barcodeInput.focus(), 100);
        }
    }
}

document.getElementById('productForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('prodName').value;
    const category = document.getElementById('prodCat').value; 
    const newOrigPrice = parseFloat(document.getElementById('prodOrigPrice').value) || 0;
    const newCapital = parseFloat(document.getElementById('prodCapital').value) || 0;
    const newTotalSalePrice = newOrigPrice + newCapital;

    const barcodeInput = document.getElementById('prodBarcode').value.trim();

    let productData;
    if (editId) {
        // Editing existing product: omit stock and expiry so batches and stock are NOT overwritten
        productData = {
            barcode: barcodeInput || null,
            name: name,
            category: category,
            orig_price: newOrigPrice,
            price_capital: newCapital,
            img: document.getElementById('prodImg').value || 'https://via.placeholder.com/150',
            fav: 0
        };
    } else {
        // Brand new product: include initial stock and initial batch expiry
        productData = {
            barcode: barcodeInput || null,
            name: name,
            category: category,
            orig_price: newOrigPrice,
            price_capital: newCapital,
            stock: parseInt(document.getElementById('prodStock').value) || 0,
            expiry: document.getElementById('prodExpiry').value || null,
            img: document.getElementById('prodImg').value || 'https://via.placeholder.com/150',
            fav: 0
        };
    }

    try {
        if (editId) {
            const fetchRes = await fetch('http://localhost:3000/api/products');
            const dbProducts = await fetchRes.json();
            const oldProduct = dbProducts.find(p => p.prod_id === editId);

            if (oldProduct) {
                const oldTotalSalePrice = parseFloat(oldProduct.orig_price) + parseFloat(oldProduct.price_capital);
                
                // 💡 FIXED: Send the price change event to the backend API instead of localStorage
                if (oldTotalSalePrice !== newTotalSalePrice) {
                    const logPayload = {
                        prod_id: editId,
                        prod_name: name,
                        old_price: oldTotalSalePrice,
                        new_price: newTotalSalePrice
                    };

                    // Send payload straight to database log table via POST request
                    await fetch('http://localhost:3000/api/add-price-log', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(logPayload)
                    }).catch(err => console.error("Price logging failed:", err));
                }
            }
        }

        const url = editId ? `http://localhost:3000/api/update-product/${editId}` : 'http://localhost:3000/api/add-product';
        const method = editId ? 'PUT' : 'POST';
        const res = await fetch(url, {
            method: method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(productData)
        });
        const result = await res.json();

        if (res.ok) {
            alert(result.message || "Success!"); 
            closeModal();
            refreshProductsUI(); 
            renderPriceLog(); 
        } else {
            alert("Server Error: " + (result.error || "Check your console"));
        }
    } catch (error) {
        console.error("Submission Error:", error);
        alert("Action failed. Make sure your Node.js server is running!");
    }
});

// --- CENTRALIZED CATEGORIES THEME REGISTRY ---
const categoryThemeRegistry = {
    "⭐ TOP SELLERS": { icon: "fa-solid fa-star", color: "#f1c40f", bg: "#fef9e7" },
    "⭐ FAVORITES": { icon: "fa-solid fa-star", color: "#f1c40f", bg: "#fef9e7" },
    "CHIPS": { icon: "fa-solid fa-cookie", color: "#d97706", bg: "#fef3c7" },
    "DRINKS": { icon: "fa-solid fa-wine-bottle", color: "#2563eb", bg: "#eff6ff" },
    "BISCUIT": { icon: "fa-solid fa-stroopwafel", color: "#b45309", bg: "#fffbeb" },
    "CANDY": { icon: "fa-solid fa-candy-cane", color: "#db2777", bg: "#fdf2f8" },
    "COLD GOODS": { icon: "fa-solid fa-snowflake", color: "#06b6d4", bg: "#ecfeff" },
    "HOME GOODS": { icon: "fa-solid fa-house-laptop", color: "#4f46e5", bg: "#e0e7ff" },
    "HYGIENE": { icon: "fa-solid fa-soap", color: "#0d9488", bg: "#f0fdf4" },
    "SCHOOL SUPPLIES": { icon: "fa-solid fa-pen-nib", color: "#7c3aed", bg: "#f5f3ff" },
    "UNCATEGORIZED": { icon: "fa-solid fa-box", color: "#64748b", bg: "#f8fafc" }
};

let globalActiveCategoryName = ""; // Tracks which category is currently open

let cachedProductsList = [];
let productSalesVolumeMap = {}; // prod_name -> totalQtySold
let topSellingProductNames = new Set(); // Set of names in top 10
let productRankMap = {}; // prod_name -> rank (1, 2, 3...)

function computeSalesRankings(sales) {
    const volumeMap = {};
    if (Array.isArray(sales)) {
        sales.forEach(sale => {
            let items = [];
            try {
                items = typeof sale.items_json === 'string' ? JSON.parse(sale.items_json) : sale.items_json;
            } catch(e) { return; }
            if (!items || !Array.isArray(items)) return;

            items.forEach(item => {
                if (item.name === 'Debt Payment' || item.isCollection === true) return;
                const name = (item.name || '').trim();
                if (!name) return;
                const qty = parseInt(item.qty) || 0;
                volumeMap[name] = (volumeMap[name] || 0) + qty;
            });
        });
    }

    productSalesVolumeMap = volumeMap;

    const ranked = Object.entries(volumeMap)
        .filter(([name, qty]) => qty > 0)
        .sort((a, b) => b[1] - a[1]);

    const top10 = ranked.slice(0, 10);
    topSellingProductNames = new Set(top10.map(([name]) => name));

    productRankMap = {};
    top10.forEach(([name], idx) => {
        productRankMap[name] = idx + 1;
    });
}

async function loadProductsCache() {
    try {
        const [prodRes, salesRes] = await Promise.all([
            fetch('http://localhost:3000/api/products'),
            fetch('http://localhost:3000/api/sales')
        ]);
        cachedProductsList = await prodRes.json();
        const sales = await salesRes.json();
        computeSalesRankings(sales);
    } catch (error) {
        console.error("Error loading products/sales cache:", error);
    }
}
async function refreshProductsUI() {
    await loadProductsCache();
    await renderTable();
    await updateOverview();
}

// 💡 FULLY UPDATED RENDERING ENGINE: Generates the clean Category Selection Cards
async function renderTable() {
    const hubContainer = document.getElementById('productCategoryHub');
    if (!hubContainer) return;

    try {
        if (cachedProductsList.length === 0) {
            await loadProductsCache();
        }
        const productsFromDB = cachedProductsList;
        
        // Exclude archived items natively
        const activeProducts = productsFromDB.filter(p => p.is_archived === 0 || p.is_archived === null);

        // Group active items by category name, dynamically allocating top sellers into Top Sellers category
        const grouped = activeProducts.reduce((acc, p) => {
            if (topSellingProductNames.has(p.prod_name)) {
                if (!acc['⭐ TOP SELLERS']) acc['⭐ TOP SELLERS'] = [];
                acc['⭐ TOP SELLERS'].push(p);
            }
            
            let cat = p.prod_category ? p.prod_category.toUpperCase().trim() : 'UNCATEGORIZED';
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(p);
            return acc;
        }, {});

        // If top sellers exist, sort them by sales rank inside the group
        if (grouped['⭐ TOP SELLERS']) {
            grouped['⭐ TOP SELLERS'].sort((a, b) => (productRankMap[a.prod_name] || 999) - (productRankMap[b.prod_name] || 999));
        }

        // Sort category names alphabetically, keeping top sellers at position index 0
        const sortedCategories = Object.keys(grouped).sort((a, b) => {
            if (a.includes('TOP SELLERS') || a.includes('FAVORITES')) return -1;
            if (b.includes('TOP SELLERS') || b.includes('FAVORITES')) return 1;
            return a.localeCompare(b);
        });

        // Generate the gorgeous category selection grids cards
        hubContainer.innerHTML = sortedCategories.map(category => {
            const config = categoryThemeRegistry[category] || categoryThemeRegistry["UNCATEGORIZED"];
            const count = grouped[category].length;

            return `
            <div class="category-portal-card" style="--portal-color: ${config.color}; --portal-bg: ${config.bg};" onclick="openCategorySubSection('${category}')">
                <div class="portal-icon-box"><i class="${config.icon}"></i></div>
                <h3>${category.toLowerCase()}</h3>
                <p><strong>${count}</strong> registered product(s)</p>
            </div>
            `;
        }).join('');

        // If a category is currently active/open, render its items inside the table sheet
        if (globalActiveCategoryName) {
            compileFilteredCategoryItems(grouped[globalActiveCategoryName] || []);
        }

    } catch (error) {
        hubContainer.innerHTML = '<div style="color:red; text-align:center; padding:30px; grid-column:1/-1;">Error linking with store API infrastructure data pools.</div>';
    }
}

// --- CATEGORICAL SHEET NAVIGATION CONTROLLERS ---
function openCategorySubSection(categoryName) {
    globalActiveCategoryName = categoryName;
    
    // Hide the category boxes grid menu
    document.getElementById('productCategoryHub').style.setProperty('display', 'none', 'important');
    
    // Setup the title, icon, and colors for the selected category header view
    const config = categoryThemeRegistry[categoryName] || categoryThemeRegistry["UNCATEGORIZED"];
    const titleHeader = document.getElementById('viewerCategoryTitle');
    const iconHeaderBox = document.getElementById('viewerCategoryIconBox');
    
    if (titleHeader) titleHeader.innerText = `${categoryName} Store Matrix`;
    if (iconHeaderBox) {
        iconHeaderBox.innerHTML = `<i class="${config.icon}"></i>`;
        iconHeaderBox.style.background = config.bg;
        iconHeaderBox.style.color = config.color;
    }

    // Reveal the item data table view panel container
    document.getElementById('subPanelCategoryViewer').style.display = 'block';
    document.getElementById('inventorySearch').value = ""; // Clear out search input string fields
    
    renderTable();
}

function backToCategoryHub() {
    globalActiveCategoryName = "";
    document.getElementById('subPanelCategoryViewer').style.display = 'none';
    document.getElementById('productCategoryHub').style.setProperty('display', 'grid', 'important');
    renderTable();
}

function compileFilteredCategoryItems(itemsArray) {
    const tbody = document.getElementById('inventoryBody');
    if (!tbody) return;

    const isTopCategory = globalActiveCategoryName.includes("TOP SELLERS") || globalActiveCategoryName.includes("FAVORITES");
    if (isTopCategory) {
        itemsArray.sort((a, b) => (productRankMap[a.prod_name] || 999) - (productRankMap[b.prod_name] || 999));
    } else {
        itemsArray.sort((a, b) => a.prod_name.localeCompare(b.prod_name));
    }

    if (itemsArray.length === 0) {
        const emptyMsg = isTopCategory 
            ? 'No sales recorded yet. Top selling items will appear here automatically as purchases are processed at checkout.'
            : 'No active items assigned here.';
        tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding:30px; color:#94a3b8;">${emptyMsg}</td></tr>`;
        return;
    }

    tbody.innerHTML = itemsArray.map(p => {
        const isTop = topSellingProductNames.has(p.prod_name);
        const rank = productRankMap[p.prod_name];
        const soldQty = productSalesVolumeMap[p.prod_name] || 0;
        const starBadge = isTop
            ? `<span style="display:inline-flex; align-items:center; justify-content:center; gap:4px; background:#fef9e7; border:1px solid #fde047; padding:2px 7px; border-radius:12px; color:#b45309; font-size:0.75rem; font-weight:800; cursor:help;" title="⭐ Rank #${rank} Top Seller (${soldQty} sold across transactions)"><i class="fa-solid fa-star" style="color:#eab308;"></i> #${rank}</span>`
            : `<span style="display:inline-flex; align-items:center; justify-content:center; color:#cbd5e1; font-size:0.95rem; cursor:help;" title="${soldQty > 0 ? `${soldQty} units sold (Rank #${rank || 'N/A'})` : 'No sales recorded yet'}"><i class="fa-regular fa-star"></i></span>`;

        return `
            <tr>
                <td><img src="${p.img_Url}" class="prod-img-sm" style="width:45px; height:45px; object-fit:contain; background:white; border:1px solid #e2e8f0; border-radius:8px;"></td>
                <td style="font-weight:700; color:#1e293b;">${p.prod_name}</td>
                <td style="color:#64748b; font-weight:500;">₱${parseFloat(p.orig_price).toFixed(2)}</td>
                <td style="color:#64748b; font-weight:500;">₱${parseFloat(p.price_capital).toFixed(2)}</td>
                <td style="font-weight:800; color:#0f172a;">₱${(parseFloat(p.orig_price) + parseFloat(p.price_capital)).toFixed(2)}</td>
                <td style="text-align:center;">
                    <span class="stock-badge ${p.stock_Qty <= 5 ? 'stock-low' : 'stock-high'}" onclick="openBatchViewerModal(event, ${p.prod_id})" style="cursor:pointer;" title="Click to view delivery batches & expiration breakdown">
                        ${p.stock_Qty} <i class="fa-solid fa-layer-group" style="font-size:0.65rem; margin-left:3px; opacity:0.8;"></i>
                    </span>
                </td>
                <td style="text-align:center;">${starBadge}</td>
                <td style="text-align:right;">
                    <button class="action-btn" type="button" onclick="openStockInModal(event, ${p.prod_id})" style="color:#10b981; margin-right:6px;" title="Stock In / Add Delivery Batch">
                        <i class="fa-solid fa-plus"></i>
                    </button>
                    <button class="action-btn" type="button" onclick="openModal(event, ${p.prod_id})" style="color:#64748b; margin-right:6px;" title="Edit Product Details">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="action-btn" type="button" onclick="archiveProduct(${p.prod_id})" style="color: #f59e0b;" title="Archive Product">
                        <i class="fa-solid fa-box-archive"></i>
                    </button>
                </td>
            </tr>
        `;
    }).join('');
}

// Handles typing inside the search input box inside an open category panel
function filterActiveCategoryItems(query) {
    let pool = cachedProductsList.filter(p => (p.is_archived === 0 || p.is_archived === null));
    
    if (globalActiveCategoryName.includes("TOP SELLERS") || globalActiveCategoryName.includes("FAVORITES")) {
        pool = pool.filter(p => topSellingProductNames.has(p.prod_name))
                   .sort((a, b) => (productRankMap[a.prod_name] || 999) - (productRankMap[b.prod_name] || 999));
    } else {
        pool = pool.filter(p => (p.prod_category ? p.prod_category.toUpperCase().trim() : 'UNCATEGORIZED') === globalActiveCategoryName);
    }

    if (query && query.trim() !== "") {
        pool = pool.filter(p => p.prod_name.toLowerCase().includes(query.toLowerCase().trim()));
    }

    compileFilteredCategoryItems(pool);
}

async function archiveProduct(id) {
    if (confirm("Are you sure you want to archive this product? It will be hidden from the active inventory.")) {
        const res = await fetch(`http://localhost:3000/api/archive-product/${id}`, { method: 'PUT' });
        if (res.ok) {
            refreshProductsUI();
        }
    }
}

// --- 3. THE ACCURATE GRAPH LOGIC ---
function updateChartRange(range) {
    currentRange = range;
    document.querySelectorAll('.range-btn').forEach(btn => {
        btn.classList.toggle('active', btn.innerText.toLowerCase() === range);
    });
    const picker = document.getElementById('chartBaseDate');
    const selectedDate = picker.value ? new Date(picker.value) : new Date();
    initChart(selectedDate);
}

async function initChart() {
    const canvas = document.getElementById('salesChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const existingChart = Chart.getChart("salesChart"); 
    if (existingChart) { existingChart.destroy(); }

    const startInput = document.getElementById('chartStartDate');
    const endInput = document.getElementById('chartEndDate');
    if (!startInput || !endInput) return;

    const today = new Date();
    if (!endInput.value) {
        endInput.value = today.toLocaleDateString('sv-SE');
    }
    if (!startInput.value) {
        const d = new Date();
        d.setDate(today.getDate() - 14);
        startInput.value = d.toLocaleDateString('sv-SE');
    }

    const startDate = new Date(startInput.value);
    const endDate = new Date(endInput.value);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    try {
        const response = await fetch('http://localhost:3000/api/sales');
        const liveSales = await response.json();
        let labels = [];
        let dataPoints = [];

        const isSingleDay = startInput.value === endInput.value;

        if (isSingleDay) {
            labels = ['8AM', '10AM', '12PM', '2PM', '4PM', '6PM', '8PM', '10PM'];
            dataPoints = [0, 0, 0, 0, 0, 0, 0, 0];
            const targetDateStr = startInput.value;

            liveSales.forEach(sale => {
                const saleDateLocal = new Date(sale.sale_date).toLocaleDateString('sv-SE');
                if (saleDateLocal === targetDateStr) {
                    const saleHour = new Date(sale.sale_date).getHours();
                    const amt = parseFloat(sale.total_amount) || 0;
                    if (saleHour < 10) dataPoints[0] += amt;
                    else if (saleHour < 12) dataPoints[1] += amt;
                    else if (saleHour < 14) dataPoints[2] += amt;
                    else if (saleHour < 16) dataPoints[3] += amt;
                    else if (saleHour < 18) dataPoints[4] += amt;
                    else if (saleHour < 20) dataPoints[5] += amt;
                    else if (saleHour < 22) dataPoints[6] += amt;
                    else dataPoints[7] += amt;
                }
            });
        } else {
            let curr = new Date(startDate);
            while (curr <= endDate) {
                const dStr = curr.toLocaleDateString('sv-SE');
                const label = curr.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                labels.push(label);

                const sum = liveSales.filter(s => {
                    const sd = new Date(s.sale_date).toLocaleDateString('sv-SE');
                    return sd === dStr;
                }).reduce((a, b) => a + (parseFloat(b.total_amount) || 0), 0);

                dataPoints.push(sum);
                curr.setDate(curr.getDate() + 1);
            }
        }

        new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Revenue',
                    data: dataPoints,
                    borderColor: '#ff7675',
                    backgroundColor: 'rgba(255, 118, 117, 0.2)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: labels.length > 31 ? 0 : 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, ticks: { callback: v => '₱' + v.toLocaleString() } },
                    x: { ticks: { callback: function(val, index) { return labels.length > 20 ? (index % Math.ceil(labels.length / 10) === 0 ? this.getLabelForValue(val) : '') : this.getLabelForValue(val); } } }
                }
            }
        });
    } catch (err) { console.error("Chart load failed:", err); }
}

// --- 4. MASTER COMPACT STATISTICS ENGINE ---
async function loadStatsEngine() {
    const startInput = document.getElementById('statsStartDate');
    const endInput = document.getElementById('statsEndDate');
    if (!startInput || !endInput) return;

    const today = new Date();
    if (!endInput.value) {
        endInput.value = today.toLocaleDateString('sv-SE');
    }
    if (!startInput.value) {
        const d = new Date();
        d.setDate(today.getDate() - 30);
        startInput.value = d.toLocaleDateString('sv-SE');
    }

    const startDate = new Date(startInput.value);
    const endDate = new Date(endInput.value);
    startDate.setHours(0, 0, 0, 0);
    endDate.setHours(23, 59, 59, 999);

    try {
        const [salesRes, prodRes] = await Promise.all([
            fetch('http://localhost:3000/api/sales'),
            fetch('http://localhost:3000/api/products')
        ]);
        const allSales = await salesRes.json();
        const dbProducts = await prodRes.json();

        // A. Filter Sales by Date Range
        const filteredSales = allSales.filter(sale => {
            const saleDate = new Date(sale.sale_date);
            return saleDate >= startDate && saleDate <= endDate;
        });

        // B. Compute Primary Metrics Card Indicators
        const revenue = filteredSales.reduce((sum, s) => sum + parseFloat(s.total_amount || 0), 0);
        const profit = filteredSales.reduce((sum, s) => sum + parseFloat(s.total_profit || 0), 0);
        
        let totalUnits = 0;
        filteredSales.forEach(s => {
            try {
                const items = typeof s.items_json === 'string' ? JSON.parse(s.items_json || '[]') : s.items_json;
                if (Array.isArray(items)) {
                    items.forEach(i => {
                        if (i.name !== 'Debt Payment' && !i.isCollection) {
                            totalUnits += (parseInt(i.qty) || 0);
                        }
                    });
                }
            } catch(e){}
        });
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

        document.getElementById('salesReport').innerText = `₱${revenue.toFixed(2)}`;
        document.getElementById('profitReport').innerText = `₱${profit.toFixed(2)}`;
        document.getElementById('totalVolumeReport').innerText = `${totalUnits} units`;
        document.getElementById('marginReport').innerText = `${margin.toFixed(2)}%`;

        // C. Update Top Items and Consolidated Item Sold Records
        renderTopItems(filteredSales);
        renderEnhancedStats(filteredSales, dbProducts);

    } catch (err) { console.error("Analytics failure:", err); }
}

function renderTopItems(filteredSales) {
    const list = document.getElementById('topItemsList');
    if (!list) return;
    list.innerHTML = '<li class="top-item header"><span>Rank & Item Name</span><span>Total Sold</span></li>';
    
    const map = {};
    filteredSales.forEach(s => {
        try {
            const items = typeof s.items_json === 'string' ? JSON.parse(s.items_json || '[]') : s.items_json;
            if (Array.isArray(items)) {
                items.forEach(i => { 
                    if (i.name === 'Debt Payment') return;
                    if (i.isCollection === true) return;
                    
                    map[i.name] = (map[i.name] || 0) + (parseInt(i.qty) || 0); 
                });
            }
        } catch(e){}
    });

    const rankedItems = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (rankedItems.length === 0) {
        list.innerHTML += '<li class="top-item" style="justify-content:center; color:#94a3b8; padding:20px;">No sales records found for this period.</li>';
        return;
    }

    rankedItems.forEach(([name, qty], idx) => {
        let medal = idx === 0 ? "🥇 " : idx === 1 ? "🥈 " : idx === 2 ? "🥉 " : "🔹 ";
        list.innerHTML += `
            <li class="top-item">
                <span><strong>${medal}#${idx+1}</strong> ${name}</span>
                <strong>${qty} Sold</strong>
            </li>`;
    });
}

function renderEnhancedStats(filteredSales, dbProducts) {
    const container = document.getElementById('categoryPerformanceAccordion');
    const searchTerm = document.getElementById('statTrackerSearch')?.value.toLowerCase() || "";
    if (!container) return;

    const categoryMap = {};

    dbProducts.forEach(prod => {
        const catName = prod.prod_category ? prod.prod_category.toUpperCase() : 'UNCATEGORIZED';
        const matchesSearch = !searchTerm || 
                              prod.prod_name.toLowerCase().includes(searchTerm) || 
                              catName.toLowerCase().includes(searchTerm);

        if (!matchesSearch) return;

        if (!categoryMap[catName]) {
            categoryMap[catName] = { totalQty: 0, totalRev: 0, items: [] };
        }

        const itemPerformance = { 
            name: prod.prod_name, 
            totalItemSales: 0,
            totalItemProfit: 0,
            eras: {} 
        };

        filteredSales.forEach(sale => {
            let items = [];
            try { items = typeof sale.items_json === 'string' ? JSON.parse(sale.items_json || '[]') : sale.items_json; } catch(e){ return; }
            if (!Array.isArray(items)) return;

            items.forEach(item => {
                if (item.name === prod.prod_name) {
                    if (item.isCollection === true || item.name === 'Debt Payment') return;

                    const price = parseFloat(item.price) || (parseFloat(prod.orig_price || 0) + parseFloat(prod.price_capital || 0));
                    const qty = parseInt(item.qty) || 0;
                    const cost = parseFloat(item.cost) || parseFloat(prod.orig_price) || 0;

                    if (!itemPerformance.eras[price]) { 
                        itemPerformance.eras[price] = { qty: 0, rev: 0 }; 
                    }
                    itemPerformance.eras[price].qty += qty;
                    itemPerformance.eras[price].rev += (price * qty);

                    itemPerformance.totalItemSales += (price * qty);
                    itemPerformance.totalItemProfit += ((price - cost) * qty);

                    categoryMap[catName].totalQty += qty;
                    categoryMap[catName].totalRev += (price * qty);
                }
            });
        });

        itemPerformance.hasSales = Object.keys(itemPerformance.eras).length > 0;
        categoryMap[catName].items.push(itemPerformance);
    });

    const sortedCategories = Object.keys(categoryMap).sort();

    container.innerHTML = sortedCategories.map(catName => {
        const catData = categoryMap[catName];
        if (catData.items.length === 0) return '';

        catData.items.sort((a, b) => a.name.localeCompare(b.name));

        return `
            <div class="category-stat-group" style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 14px; margin-bottom: 20px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.02);">
                
                <!-- Folder Header Row -->
                <div class="category-stat-header" onclick="this.nextElementSibling.classList.toggle('collapsed-stats')" style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; background: #ffffff; cursor: pointer; border-bottom: 1px solid #e2e8f0; font-weight: bold;">
                    <span style="font-size: 1.1rem; display: flex; align-items: center; gap: 10px; color: #1d2b38;">
                        <i class="fa-solid fa-folder-open" style="color: #ff7675;"></i> ${catName}
                    </span>
                    <div style="display: flex; gap: 15px; font-size: 0.9rem;">
                        <span style="color: #64748b; background: #f1f5f9; padding: 6px 12px; border-radius: 8px; font-weight: 700;">Total Sold: ${catData.totalQty}</span>
                        <span style="color: #10b981; background: #ecfdf5; padding: 6px 12px; border-radius: 8px; border: 1px solid #d1fae5; font-weight: 700;">Total Sales: ₱${catData.totalRev.toFixed(2)}</span>
                    </div>
                </div>
                
                <!-- Expanded Ledger Records Wrapper -->
                <div class="category-stat-body ${searchTerm ? '' : 'collapsed-stats'}">
                    ${catData.items.map(item => {
                        const itemTotalQty = Object.values(item.eras).reduce((sum, era) => sum + era.qty, 0);
                        const itemTotalRevenue = Object.values(item.eras).reduce((sum, era) => sum + era.rev, 0);
                        const totalProfitVal = item.hasSales ? item.totalItemProfit : 0;

                        return `
                            <!-- Record-Keeping Box Card -->
                            <div class="ledger-record-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 15px 20px; display: flex; flex-direction: column; gap: 0; box-shadow: 0 2px 4px rgba(0,0,0,0.02); margin-bottom: 10px;">

                                <!-- Product Info and Consolidated Metrics Symmetrical Row -->
                                <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 15px;">
                                    <div style="display: flex; align-items: center; gap: 12px;">
                                        <div style="background: #f1f5f9; color: #1d2b38; width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; border: 1px solid #e2e8f0;">
                                            <i class="fa-solid fa-box"></i>
                                        </div>
                                        <span style="font-size: 1.2rem; font-weight: 800; color: #1e293b; letter-spacing: -0.3px;">${item.name}</span>
                                    </div>
                                    <div style="display: flex; gap: 15px; font-size: 0.95rem; align-items: center; flex-wrap: wrap;">
                                        <span style="color: #475569;">Total Sold: <strong style="color: #0f172a; font-size: 1.05rem;">${itemTotalQty} pcs</strong></span>
                                        <span style="color: #64748b;">•</span>
                                        <span style="color: #475569;">Total Sales: <strong style="color: #1d2b38; font-size: 1.05rem;">₱${itemTotalRevenue.toFixed(2)}</strong></span>
                                        <span style="color: #64748b;">•</span>
                                        <span style="color: #475569;">Total Profit: <strong style="color: #10b981; font-size: 1.05rem;">₱${totalProfitVal.toFixed(2)}</strong></span>
                                    </div>
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>`;
    }).join('') || '<div style="text-align:center; padding:30px; color:#94a3b8;">No results matched search fields.</div>';
}

async function updateOverview() {
    try {
        if (cachedProductsList.length === 0) {
            await loadProductsCache();
        }
        let liveProducts = cachedProductsList;
        
        // Exclude archived products from the overview stats
        liveProducts = liveProducts.filter(p => p.is_archived === 0 || p.is_archived === null || !p.is_archived);
        
        const now = new Date();
        const thirtyDays = new Date(); 
        thirtyDays.setDate(now.getDate() + 30);
        
        const lowStockItems = liveProducts.filter(p => p.stock_Qty <= 5);
        const expiringItems = liveProducts.filter(p => {
            if (!p.expiry_Date) return false;
            const exp = new Date(p.expiry_Date);
            return exp <= thirtyDays && exp >= now;
        });

        const expiredItems = liveProducts.filter(p => {
            if (!p.expiry_Date) return false;
            const exp = new Date(p.expiry_Date);
            return exp <= now;
        });

        // Use safe selectors for all elements
        const totalProductsEl = document.getElementById('totalProducts');
        if (totalProductsEl) totalProductsEl.innerText = liveProducts.length;

        const totalStockEl = document.getElementById('totalStock');
        if (totalStockEl) totalStockEl.innerText = liveProducts.reduce((s, p) => s + (parseInt(p.stock_Qty) || 0), 0);

        const lowStockEl = document.getElementById('lowStockCount');
        if (lowStockEl) lowStockEl.innerText = lowStockItems.length;

        const rList = document.getElementById('restockList');
        if (rList) {
            rList.innerHTML = lowStockItems.length > 0 
                ? lowStockItems.map(p => `<li><span>${p.prod_name}</span> <span style="background:#fee2e2; color:#ef4444; padding: 4px 8px; border-radius: 6px; font-size:0.75rem; font-weight:700;">Only ${p.stock_Qty} left</span></li>`).join('')
                : '<li style="border-left-color: #10b981; color:#15803d; background: #f0fdf4;">All items well stocked! ✅</li>';
        }

        const eList = document.getElementById('expiryList');
        if (eList) {
            eList.innerHTML = expiringItems.length > 0
                ? expiringItems.map(p => `<li><span>${p.prod_name}</span> <span style="background:#fffbeb; color:#d97706; padding: 4px 8px; border-radius: 6px; font-size:0.75rem; font-weight:700;">Exp: ${new Date(p.expiry_Date).toLocaleDateString()}</span></li>`).join('')
                : '<li style="border-left-color: #10b981; color:#15803d; background: #f0fdf4;">No items expiring soon. 🥂</li>';
        }

        const expiredListEl = document.getElementById('expiredList');
        if (expiredListEl) {
            expiredListEl.innerHTML = expiredItems.length > 0
                ? expiredItems.map(p => `<li><span>${p.prod_name}</span> <span style="background:#fee2e2; color:#b91c1c; padding: 4px 8px; border-radius: 6px; font-size:0.75rem; font-weight:700;">Expired</span></li>`).join('')
                : '<li style="border-left-color: #10b981; color:#15803d; background: #f0fdf4;">No expired products! 🎉</li>';
        }
    } catch (error) { 
        console.error("Error updating overview:", error); 
    }
}

// --- Unified Form submission placeholders, ledger views, user configurations preserved verbatim ---
function resetDaySales() {
    const masterDate = document.getElementById('statsMasterDate')?.value;
    if (!masterDate) return alert("Select a base date first.");
    if (confirm(`Delete ALL records for ${masterDate}?`)) {
        let allSales = JSON.parse(localStorage.getItem('weljo_sales')) || [];
        localStorage.setItem('weljo_sales', JSON.stringify(allSales.filter(s => s.date !== masterDate)));
        alert(`Cleared data for ${masterDate}.`);
        loadStatsEngine();
        initChart();
    }
}
function closeModal() { const pm = document.getElementById('productModal'); if(pm) pm.style.display = 'none'; editId = null; }
function filterHistoryByDate(d) { renderTransactionHistory(d); }
function resetHistoryFilter() { document.getElementById('historyFilterDate').value = ""; renderTransactionHistory(); }

async function renderTransactionHistory(filterDate = null) {
    const container = document.getElementById('transactionHistory');
    if (!container) return;
    try {
        const response = await fetch('http://localhost:3000/api/sales');
        let sales = await response.json();
        sales.sort((a, b) => b.sale_id - a.sale_id);
        
        if (filterDate) {
            sales = sales.filter(s => {
                const datePart = s.sale_date.split(' ')[0].split('T')[0]; 
                const dbDateClean = new Date(s.sale_date).toLocaleDateString('sv-SE');
                return dbDateClean === filterDate || datePart === filterDate;
            });
        }
        
        container.innerHTML = sales.map(sale => {
            let items = []; 
            try { items = typeof sale.items_json === 'string' ? JSON.parse(sale.items_json) : sale.items_json; } catch(e){}
            
            const isDebtCollection = items.some(i => i.name === 'Debt Payment' || i.isCollection === true);
            const timeStr = new Date(sale.sale_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            
            const badgeHtml = isDebtCollection 
                ? `<span class="status-pill pill-payment"><i class="fa-solid fa-hand-holding-dollar"></i> Collection</span>`
                : `<span class="status-pill pill-sale"><i class="fa-solid fa-basket-shopping"></i> Counter Sale</span>`;

            return `
            <div class="expanded-record-card receipt-card">
                <!-- Top Header Metadata Row -->
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <div style="display: flex; flex-direction: column; gap: 2px;">
                        <strong style="font-size: 1.05rem; color: #0f172a; font-weight: 800;">RECEIPT #${sale.sale_id}</strong>
                        <span style="color: #64748b; font-size: 0.78rem; font-weight: 600;"><i class="fa-regular fa-clock"></i> ${new Date(sale.sale_date).toLocaleDateString()} at ${timeStr}</span>
                    </div>
                    ${badgeHtml}
                </div>
                
                <!-- Automatically Visible Product List -->
                <div class="item-list-box">
                    <div style="font-size: 0.72rem; color: #64748b; font-weight: 700; text-transform: uppercase; padding: 4px 0 6px 0; border-bottom: 1px solid #e2e8f0; margin-bottom: 4px; letter-spacing: 0.5px;">Dispatched Items Breakdown:</div>
                    ${items.map(i => {
                        const priceStr = i.price ? ` @ ₱${parseFloat(i.price).toFixed(2)}` : '';
                        return `
                            <div class="item-detail-row">
                                <span style="font-weight: 600; color: #334155;">${i.name}${priceStr}</span>
                                <span style="font-weight: 700; color: #475569; font-size: 0.8rem; background: #ffffff; padding: 2px 8px; border-radius: 4px; border: 1px solid #e2e8f0;">qty: ${i.qty}</span>
                            </div>
                        `;
                    }).join('')}
                </div>
                
                <!-- Bottom Financial Summary Aggregates Footer Row -->
                <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 4px;">
                    <span style="font-size: 0.95rem; font-weight: 600; color: #475569;">Total Amount: <strong style="color: #0f172a; font-size: 1.15rem; font-weight: 900;">₱${parseFloat(sale.total_amount).toFixed(2)}</strong></span>
                    <span style="background: #ecfdf5; color: #10b981; font-weight: 800; padding: 4px 10px; border-radius: 6px; font-size: 0.85rem; border: 1px solid #a7f3d0;"><i class="fa-solid fa-chart-line"></i> Net Profit: ₱${parseFloat(sale.total_profit).toFixed(2)}</span>
                </div>
            </div>`;
        }).join('') || '<div style="text-align:center; padding:40px; color:#94a3b8;"><i class="fa-solid fa-folder-open" style="display:block; font-size:2rem; margin-bottom:10px;"></i> No records found.</div>';
    } catch (error) { container.innerHTML = '<div style="color:red; text-align:center; padding:20px;">Error parsing history streams.</div>'; }
}

async function renderPriceLog(filterDate = null, searchTerm = "") {
    const container = document.getElementById('priceChangeLog');
    if (!container) return;
    try {
        const response = await fetch('http://localhost:3000/api/price-logs');
        let logs = await response.json();
        container.innerHTML = "";
        
        // 1. Apply primary input search matching criteria filters up front
        if (filterDate) { logs = logs.filter(l => l.change_date.split('T')[0] === filterDate); }
        if (searchTerm) { logs = logs.filter(l => l.prod_name.toLowerCase().includes(searchTerm.toLowerCase())); }
        
        if (logs.length === 0) { 
            container.innerHTML = '<div style="text-align:center; padding:40px; color:#94a3b8;"><i class="fa-solid fa-magnifying-glass" style="display:block; font-size:2rem; margin-bottom:10px;"></i> No modifications match filter criteria.</div>'; 
            return; 
        }
        
        // 2. 💡 THE MAGIC ENGINE: Group raw log row entries by product name dynamically
        const groupedLogs = logs.reduce((acc, log) => {
            const name = log.prod_name.toUpperCase();
            if (!acc[name]) {
                acc[name] = [];
            }
            acc[name].push(log);
            return acc;
        }, {});

        // 3. Render exactly ONE container box per product with a clean internal spreadsheet timeline
        container.innerHTML = Object.entries(groupedLogs).map(([productName, productEntries]) => {
            // Sort internal records chronologically so the newest change sits at the very top of the table
            productEntries.sort((a, b) => new Date(b.change_date) - new Date(a.change_date));

            return `
            <div class="expanded-record-card log-card" style="gap: 10px;">
                <!-- Product Card Header Title Row -->
                <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 2px solid #f1f5f9; padding-bottom: 8px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <div style="background: #fff5f5; color: #ff7675; width: 32px; height: 32px; border-radius: 6px; display: flex; align-items: center; justify-content: center; font-size: 0.85rem;"><i class="fa-solid fa-tag"></i></div>
                        <strong style="font-size: 1.1rem; color: #0f172a; text-transform: uppercase; letter-spacing: -0.3px;">${productName}</strong>
                    </div>
                    <span style="font-size: 0.75rem; color: #64748b; background: #f1f5f9; padding: 4px 10px; border-radius: 6px; font-weight: 700;">Total Shifts: ${productEntries.length} Event(s)</span>
                </div>
                
                <!-- Internal Audit Table Timeline Sheets Block -->
                <table class="price-audit-table">
                    <thead>
                        <tr>
                            <th style="width: 35%;">Date & Time Changed</th>
                            <th style="text-align: center; width: 20%;">Old Price</th>
                            <th style="width: 5%; text-align: center;"></th>
                            <th style="text-align: center; width: 20%;">New Price</th>
                            <th style="text-align: right; width: 20%;">Adjustment Delta</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${productEntries.map(entry => {
                            const entryDate = new Date(entry.change_date);
                            const timeStr = entryDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                            const delta = parseFloat(entry.new_price) - parseFloat(entry.old_price);
                            
                            // Contextual coloring for price jumps vs price cuts
                            const deltaColor = delta >= 0 ? 'color: #10b981; font-weight: 700;' : 'color: #ef4444; font-weight: 700;';
                            const deltaSign = delta >= 0 ? '+' : '';

                            return `
                            <tr>
                                <td style="font-weight: 600; color: #475569;">
                                    <i class="fa-regular fa-calendar" style="font-size: 0.78rem; margin-right: 4px;"></i> ${entryDate.toLocaleDateString()} 
                                    <span style="font-size: 0.75rem; color: #94a3b8; font-weight: 500; margin-left: 5px;">${timeStr}</span>
                                </td>
                                <td style="text-align: center;"><span class="vector-badge badge-old">₱${parseFloat(entry.old_price).toFixed(2)}</span></td>
                                <td style="text-align: center; color: #94a3b8; font-size: 0.75rem;"><i class="fa-solid fa-arrow-right"></i></td>
                                <td style="text-align: center;"><span class="vector-badge badge-new">₱${parseFloat(entry.new_price).toFixed(2)}</span></td>
                                <td style="text-align: right; ${deltaColor}">${deltaSign}₱${delta.toFixed(2)}</td>
                            </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
            `;
        }).join('');
    } catch (e) { container.innerHTML = '<div style="color:red; text-align:center; padding:20px;">Error parsing history streams.</div>'; }
}
// --- CORE UTILITY ELEMENT INTERACTION ANIMATION INTERCEPTOR ---
function toggleHistoryOption(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    
    // Toggle the targeted element
    el.classList.toggle('expanded');
}

function toggleFav(id) {
    alert("⭐ Top Sellers / Favorites are automatically ranked and awarded by the system based on customer purchase history.");
}

document.getElementById('folderForm')?.addEventListener('submit', async (e) => {
    e.preventDefault(); // Blocks browser redirection loops

    // Extract raw input data fields from the modal registry elements
    const fullname = document.getElementById('newCustomerName').value.trim();
    const contact = document.getElementById('newCustomerContact').value.trim();
    const address = document.getElementById('newCustomerAddress').value.trim();

    const folderPayload = {
        fullname: fullname,
        contact: contact,
        address: address
    };

    try {
        const res = await fetch('http://localhost:3000/api/create-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(folderPayload)
        });
        const result = await res.json();

        if (res.ok) {
            alert("Customer Credit Folder created successfully! 📁");
            closeFolderModal(); // Shuts down the visual popup overlay container window
            
            // Re-render folder profiles dynamically based on the current tab context window frame
            if (typeof renderCustomerFolders === 'function') {
                renderCustomerFolders();
            }
        } else {
            alert("System Error: " + (result.error || "Unable to write profile record."));
        }
    } catch (error) {
        console.error("Folder creation failed:", error);
        alert("Action failed. Double check that your Node.js backend server is running!");
    }
});

let isUtangSubmitting = false;

// --- NEW WORKER: SUBMIT CREDIT TRANSACTION NOTE TO LEDGER ---
document.getElementById('utangForm')?.addEventListener('submit', async (e) => {
    e.preventDefault(); // Prevents browser reload bugs
    if (isUtangSubmitting) return;

    if (!selectedUtangItems || selectedUtangItems.length === 0) {
        alert("Please add at least one product to the list first.");
        return;
    }

    // Compute final transaction aggregates
    let totalAmount = 0;
    let totalProfit = 0;

    selectedUtangItems.forEach(item => {
        totalAmount += (item.price * item.qty);
        // Calculate true markup profit: (Retail Sale Price - Wholesale Capital Cost) * Quantity
        totalProfit += ((item.price - item.cost) * item.qty);
    });

    const userEmail = localStorage.getItem('currentUser') || '';
    const utangPayload = {
        customer_name: activeFolderCustomerName,
        items_list: JSON.stringify(selectedUtangItems),
        amount: totalAmount,
        profit: totalProfit
    };

    const submitBtn = e.target.querySelector('button[type="submit"]');
    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.dataset.originalText = submitBtn.innerText;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    }
    isUtangSubmitting = true;

    try {
        const res = await fetch('http://localhost:3000/api/save-utang', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'x-user-email': userEmail
            },
            body: JSON.stringify(utangPayload)
        });
        const result = await res.json();

        if (res.ok) {
            alert(result.message || "Note successfully posted to ledger! 📝");
            
            // Reset state variables and close modal safely
            selectedUtangItems = [];
            closeUtangModal();
            
            // Instantly refresh the custom ledger history data logs on screen
            if (typeof renderSpecificLedger === 'function') {
                renderSpecificLedger(activeFolderCustomerName);
            }
        } else {
            alert(result.error || "Unable to save transaction record.");
        }
    } catch (error) {
        console.error("Credit transaction failed:", error);
        alert("Action failed. Ensure your Node.js backend server is running!");
    } finally {
        isUtangSubmitting = false;
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.innerText = submitBtn.dataset.originalText || "Save to Ledger";
        }
    }
});

// --- WORKER: UPDATE CUSTOMER CREDIT LIMIT CEILING ---
document.getElementById('creditLimitForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!activeFolderCustomerName) return;

    const input = document.getElementById('newLimitAmountInput');
    const newLimit = parseFloat(input?.value);

    if (isNaN(newLimit) || newLimit < 0) {
        alert("Validation Error: Please enter a valid non-negative amount.");
        return;
    }
    if (newLimit > 2000.00) {
        alert("Validation Error: Credit limit cannot exceed the maximum store ceiling of ₱2,000.00.");
        return;
    }

    try {
        const userEmail = localStorage.getItem('currentUser') || '';
        const res = await fetch('http://localhost:3000/api/update-customer-limit', {
            method: 'PUT',
            headers: { 
                'Content-Type': 'application/json',
                'x-user-email': userEmail
            },
            body: JSON.stringify({
                fullname: activeFolderCustomerName,
                credit_limit: newLimit
            })
        });
        const result = await res.json();
        if (res.ok) {
            alert(result.message || "Credit limit updated successfully! 🎉");
            closeCreditLimitModal();
            renderSpecificLedger(activeFolderCustomerName);
        } else {
            alert("System Error: " + (result.error || "Unable to update credit limit."));
        }
    } catch (error) {
        console.error("Credit limit update failed:", error);
        alert("Action failed. Ensure your Node.js backend server is running!");
    }
});

// Global initialization window listeners
window.onload = () => {
    if (typeof refreshProductsUI === 'function') refreshProductsUI();
    if (typeof renderCustomerFolders === 'function') renderCustomerFolders();
    if (typeof initChart === 'function') initChart(); 
    if (typeof renderTransactionHistory === 'function') renderTransactionHistory();
    if (typeof renderUserList === 'function') {
        renderUserList();
        // Quick sync 2.5 seconds after load once heartbeat registers
        setTimeout(renderUserList, 2500);
    }
    if (typeof setupEmailAutoGeneration === 'function') setupEmailAutoGeneration();
    if (typeof startHeartbeat === 'function') startHeartbeat();
    
    // Periodically update staff online statuses in the background (every 4 seconds for responsive real-time status updates)
    setInterval(() => {
        if (typeof renderUserList === 'function') renderUserList();
    }, 4000);

    console.log("Window loaded, initializing...");
    
  
    
    const chartStart = document.getElementById('chartStartDate');
    const chartEnd = document.getElementById('chartEndDate');
    const today = new Date();
    if (chartEnd && !chartEnd.value) chartEnd.value = today.toLocaleDateString('sv-SE');
    if (chartStart && !chartStart.value) {
        const d = new Date();
        d.setDate(today.getDate() - 14);
        chartStart.value = d.toLocaleDateString('sv-SE');
    }

    const statsStart = document.getElementById('statsStartDate');
    const statsEnd = document.getElementById('statsEndDate');
    if (statsEnd && !statsEnd.value) statsEnd.value = today.toLocaleDateString('sv-SE');
    if (statsStart && !statsStart.value) {
        const d = new Date();
        d.setDate(today.getDate() - 30);
        statsStart.value = d.toLocaleDateString('sv-SE');
    }

    const tick = () => { const ct = document.getElementById('currentTime'); if(ct) ct.innerText = new Date().toLocaleString(); };
    tick(); setInterval(tick, 1000);
    showSection('dashboard-overview');
};

let selectedUtangItems = [];
async function openUtangModal() {
    const modal = document.getElementById('utangModal');
    const nameGroup = document.getElementById('customerNameGroup');
    const nameDisplay = document.getElementById('folderNameDisplay');
    const nameInput = document.getElementById('utangCustomer');
    if (typeof activeFolderCustomerName !== 'undefined' && activeFolderCustomerName) {
        if (nameGroup) nameGroup.style.display = 'none';
        if (nameDisplay) { nameDisplay.style.display = 'block'; document.getElementById('targetCustomerName').innerText = activeFolderCustomerName; }
        if (nameInput) nameInput.value = activeFolderCustomerName;
    }
    if (modal) modal.style.display = 'flex';
}
function closeUtangModal() { const m = document.getElementById('utangModal'); if(m) m.style.display = 'none'; document.getElementById('utangForm').reset(); }
async function searchProducts(query) {
    const dropdown = document.getElementById('searchResults');
    if (!dropdown) return;
    if (!query || query.trim() === "") { dropdown.style.display = 'none'; return; }
    try {
        if (cachedProductsList.length === 0) {
            await loadProductsCache();
        }
        const products = cachedProductsList.length > 0 ? cachedProductsList : await (await fetch('http://localhost:3000/api/products')).json();
        const filtered = products.filter(p => p.prod_name && p.prod_name.toLowerCase().includes(query.toLowerCase()) && !p.is_archived);
        if (filtered.length > 0) {
            dropdown.innerHTML = filtered.map(p => {
                const price = parseFloat(p.orig_price || 0) + parseFloat(p.price_capital || 0);
                return `<div class="search-item" onclick="addProdToUtangById(${p.prod_id})"><span>${p.prod_name}</span><strong>₱${price.toFixed(2)}</strong></div>`;
            }).join('');
            dropdown.style.display = 'block';
        } else { 
            dropdown.style.display = 'none'; 
        }
    } catch(e){
        console.error("searchProducts error:", e);
    }
}

async function addProdToUtangById(prodId) {
    if (cachedProductsList.length === 0) {
        await loadProductsCache();
    }
    const p = cachedProductsList.find(item => item.prod_id === prodId || item.id === prodId);
    if (!p) return;
    const price = parseFloat(p.orig_price || 0) + parseFloat(p.price_capital || 0);
    const prodObj = {
        id: p.prod_id || p.id,
        name: p.prod_name,
        price: price,
        cost: parseFloat(p.orig_price || 0)
    };
    addProdToUtang(prodObj);
}

function addProdToUtang(p) {
    if (!p) return;
    const existing = selectedUtangItems.find(item => item.id === p.id);
    if (existing) { 
        existing.qty++; 
    } else { 
        selectedUtangItems.push({...p, qty: 1}); 
    }
    const itemSearch = document.getElementById('itemSearch');
    if (itemSearch) itemSearch.value = '';
    const searchResults = document.getElementById('searchResults');
    if (searchResults) searchResults.style.display = 'none';
    refreshUtangUI();
}
function refreshUtangUI() {
    const list = document.getElementById('selectedItemsList');
    let total = 0;
    list.innerHTML = selectedUtangItems.map((item, index) => {
        const subtotal = item.price * item.qty; total += subtotal;
        return `<div class="utang-item-row"><span>${item.name}</span><div class="qty-controls"><input type="number" value="${item.qty}" min="1" onchange="updateUtangQty(${index}, this.value)"><button type="button" onclick="removeUtangItem(${index})">×</button></div><span>₱${subtotal.toFixed(2)}</span></div>`;
    }).join('');
    document.getElementById('utangDisplayTotal').innerText = `₱${total.toFixed(2)}`;
}
function updateUtangQty(i, v) { selectedUtangItems[i].qty = parseInt(v) || 1; refreshUtangUI(); }
function removeUtangItem(i) { selectedUtangItems.splice(i, 1); refreshUtangUI(); }

function openFolderModal() { const m = document.getElementById('folderModal'); if(m) m.style.display = 'flex'; }
function closeFolderModal() { const m = document.getElementById('folderModal'); if(m) m.style.display = 'none'; document.getElementById('folderForm').reset(); }
function viewCustomerDetails(id, n) { 
    activeFolderCustomerName = n; 
    document.getElementById('customerFolderList').style.display = 'none'; 
    const tb = document.getElementById('ledgerSearchToolbar'); 
    if(tb) tb.style.display = 'none'; 
    const kpi = document.getElementById('ledgerKpiGrid');
    if(kpi) kpi.style.display = 'none';
    
    // Hide folder tab action buttons (Active Debts, Archived Folders, Create Folder) when inside
    const folderActionBtns = document.getElementById('utangFolderActionButtons');
    if(folderActionBtns) folderActionBtns.style.display = 'none';
    
    // Show breadcrumb trail
    const breadcrumb = document.getElementById('ledgerBreadcrumbTrail');
    const breadcrumbName = document.getElementById('breadcrumbCustomerName');
    if(breadcrumb && breadcrumbName) {
        breadcrumbName.innerText = n;
        breadcrumb.style.display = 'inline';
    }

    const currentTitle = document.getElementById('currentFolderName');
    if(currentTitle) currentTitle.innerText = n; 

    document.getElementById('specificCustomerView').style.display = 'block'; 
    renderSpecificLedger(n); 
}

function backToFolders() { 
    activeFolderCustomerName = ''; 
    document.getElementById('specificCustomerView').style.display = 'none'; 
    
    // Restore outer folder action buttons
    const folderActionBtns = document.getElementById('utangFolderActionButtons');
    if(folderActionBtns) folderActionBtns.style.display = 'flex';
    
    // Hide breadcrumb trail
    const breadcrumb = document.getElementById('ledgerBreadcrumbTrail');
    if(breadcrumb) breadcrumb.style.display = 'none';

    const tb = document.getElementById('ledgerSearchToolbar'); 
    if(tb) tb.style.display = 'flex'; 
    const kpi = document.getElementById('ledgerKpiGrid');
    if(kpi && (typeof currentFolderViewTab === 'undefined' || currentFolderViewTab === 'ACTIVE')) {
        kpi.style.display = 'grid';
    }
    document.getElementById('customerFolderList').style.display = 'grid'; 
    renderCustomerFolders(); 
}

function switchFolderTab(t) {
    currentFolderViewTab = t;
    activeFolderCustomerName = "";
    const specificView = document.getElementById("specificCustomerView");
    if (specificView) specificView.style.display = "none";
    
    // Restore outer folder action buttons
    const folderActionBtns = document.getElementById('utangFolderActionButtons');
    if(folderActionBtns) folderActionBtns.style.display = 'flex';
    
    // Hide breadcrumb trail
    const breadcrumb = document.getElementById('ledgerBreadcrumbTrail');
    if(breadcrumb) breadcrumb.style.display = 'none';

    const tb = document.getElementById("ledgerSearchToolbar");
    if (tb) tb.style.display = "flex";
    const kpi = document.getElementById("ledgerKpiGrid");
    if (kpi) kpi.style.display = (t === "ACTIVE") ? "grid" : "none";
    const searchInput = document.getElementById("searchCreditCustomer");
    if (searchInput) searchInput.value = "";
    const gridContainer = document.getElementById("customerFolderList");
    if (gridContainer) gridContainer.style.display = "grid";
    renderCustomerFolders();
}

function fillFullPayment() {
    const debtText = document.getElementById('customerDebtTotal')?.innerText.replace(/[₱,]/g, '').trim();
    const currentDebt = parseFloat(debtText) || 0;
    if (currentDebt > 0) {
        const input = document.getElementById('ledgerPaymentInput');
        if (input) {
            input.value = currentDebt.toFixed(2);
            input.focus();
        }
    }
}

let isLedgerPaymentProcessing = false;

async function submitLedgerPayment() {
    if (isLedgerPaymentProcessing) return;

    const paymentBox = document.getElementById('ledgerPaymentInput');
    const cashValue = parseFloat(paymentBox?.value);
    if (isNaN(cashValue) || cashValue <= 0) {
        return alert("Validation Error: Please specify a valid payment amount.");
    }

    const currentDebtText = document.getElementById('customerDebtTotal')?.innerText.replace(/[₱,]/g, '').trim();
    const currentDebt = parseFloat(currentDebtText) || 0;
    if (currentDebt <= 0) {
        return alert("This customer has no outstanding debt to settle.");
    }
    if (cashValue > currentDebt) {
        return alert(`Validation Error: Payment amount (₱${cashValue.toFixed(2)}) cannot exceed the total outstanding debt of ₱${currentDebt.toFixed(2)}.`);
    }

    const payBtns = document.querySelectorAll('.proceed-payment-btn, .full-pay-btn, .terminal-submit-pay-btn');
    payBtns.forEach(b => {
        b.disabled = true;
        b.dataset.originalHtml = b.innerHTML;
        b.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Processing...';
    });

    isLedgerPaymentProcessing = true;

    try {
        const userEmail = localStorage.getItem('currentUser') || '';
        const res = await fetch('http://localhost:3000/api/post-ledger-payment', { 
            method: 'POST', 
            headers: { 
                'Content-Type': 'application/json',
                'x-user-email': userEmail
            }, 
            body: JSON.stringify({ 
                customer_name: activeFolderCustomerName, 
                payment_amount: cashValue 
            }) 
        });
        const result = await res.json();
        if (res.ok) { 
            if (paymentBox) paymentBox.value = ""; 
            renderSpecificLedger(activeFolderCustomerName); 
        } else {
            alert("Payment Failed: " + (result.error || "Unable to record payment."));
        }
    } catch(e) {
        console.error("Payment submission error:", e);
        alert("Network Error: Unable to reach backend server. Please verify your connection.");
    } finally {
        isLedgerPaymentProcessing = false;
        payBtns.forEach(b => {
            b.disabled = false;
            b.innerHTML = b.dataset.originalHtml || '<i class="fa-solid fa-circle-check"></i> Proceed Payment';
        });
    }
}

function editCreditLimit() {
    if (!activeFolderCustomerName) return;
    const nameSpan = document.getElementById('limitModalCustomerName');
    if (nameSpan) nameSpan.innerText = activeFolderCustomerName;

    const currentText = document.getElementById('customerCreditLimit')?.innerText.replace(/[₱,]/g, '').trim() || "2000";
    const currentVal = parseFloat(currentText) || 2000.00;
    
    const input = document.getElementById('newLimitAmountInput');
    if (input) input.value = currentVal.toFixed(2);

    const modal = document.getElementById('creditLimitModal');
    if (modal) modal.style.display = 'flex';
}

function closeCreditLimitModal() {
    const modal = document.getElementById('creditLimitModal');
    if (modal) modal.style.display = 'none';
}

function showAlert(t, m) { alert(`${t}: ${m}`); }
function toggleCategory(catId) { const rows = document.querySelectorAll(`.cat-row-${catId}`); rows.forEach(r => r.style.display = r.style.display === 'none' ? 'table-row' : 'none'); }
function closeArchiveModal(event) {
    if (event) {
        event.stopPropagation(); // Stops the click from hitting the background
    }
    document.getElementById('archiveModal').style.display = 'none';
}

// 🟢 FIXED: Replaces line 1099 to open the modal AND load database items
async function openArchiveModal(event) {
    if (event) event.stopPropagation(); // Prevents bubbling to parent containers
    
    const modal = document.getElementById('archiveModal');
    const container = document.getElementById('archivedListContainer');
    if (!modal || !container) return;

    modal.style.display = 'flex';
    container.innerHTML = '<p style="text-align:center; padding:15px; color:#64748b; font-weight: 600;"><i class="fa-solid fa-spinner fa-spin"></i> Loading archives...</p>';

    try {
        const response = await fetch('http://localhost:3000/api/products');
        const products = await response.json();
        
        // Filter out items that are marked as archived
        const archivedItems = products.filter(p => p.is_archived === 1);

        if (archivedItems.length === 0) {
            container.innerHTML = '<p style="text-align:center; padding:20px; color:#94a3b8; font-weight:600;">No archived items found.</p>';
            return;
        }

        // Render rows dynamically into the container
        container.innerHTML = archivedItems.map(p => `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 15px; border-bottom: 1px solid #e2e8f0; background: #ffffff;">
                <div style="display: flex; align-items: center; gap: 12px;">
                    <img src="${p.img_Url}" style="width: 35px; height: 35px; object-fit: contain; border-radius: 4px; border: 1px solid #e2e8f0;">
                    <div>
                        <strong style="color: #1e293b; font-size: 0.9rem; display: block;">${p.prod_name}</strong>
                        <span style="font-size: 0.75rem; color: #64748b; text-transform: uppercase; font-weight: bold;">${p.prod_category || 'food'}</span>
                    </div>
                </div>
                <button onclick="restoreProductFromArchive(${p.prod_id})" 
                        style="background: #10b981; color: white; border: none; padding: 6px 12px; border-radius: 6px; font-size: 0.8rem; font-weight: bold; cursor: pointer; display: flex; align-items: center; gap: 4px;">
                    <i class="fa-solid fa-rotate-left"></i> Restore
                </button>
            </div>
        `).join('');

    } catch (error) {
        container.innerHTML = '<p style="text-align:center; padding:15px; color:#ef4444; font-weight:600;">Failed to load archive data.</p>';
    }
}

// 🟢 FIXED: Interactive Restore Controller API Link Handler
async function restoreProductFromArchive(id) {
    if (!confirm("Restore this product back to your active inventory sheets?")) return;
    try {
        const res = await fetch(`http://localhost:3000/api/restore-product/${id}`, { method: 'PUT' });
        if (res.ok) {
            alert("Product restored successfully! 🎉");
            openArchiveModal(); // Instantly updates and refreshes modal view items sheet
            refreshProductsUI();      // Instantly updates background category cards count totals
        }
    } catch (err) {
        console.error(err);
    }
}

let cachedCustomerFolders = [];

async function renderCustomerFolders() {
    const container = document.getElementById("customerFolderList");
    if (!container) return;

    try {
        if (typeof currentFolderViewTab === "undefined") {
            window.currentFolderViewTab = "ACTIVE";
        }

        // Toggle active button tab styling
        const btnActive = document.getElementById("btnViewActiveFolders");
        const btnArchived = document.getElementById("btnViewArchivedFolders");
        if (btnActive && btnArchived) {
            if (currentFolderViewTab === "ACTIVE") {
                btnActive.classList.add("active");
                btnActive.style.background = "#1d2b38";
                btnActive.style.color = "white";
                btnArchived.classList.remove("active");
                btnArchived.style.background = "white";
                btnArchived.style.color = "#1e293b";
            } else {
                btnArchived.classList.add("active");
                btnArchived.style.background = "#1d2b38";
                btnArchived.style.color = "white";
                btnActive.classList.remove("active");
                btnActive.style.background = "white";
                btnActive.style.color = "#1e293b";
            }
        }

        const endpoint = currentFolderViewTab === "ACTIVE" ? "/api/get-customers" : "/api/get-archived-customers";
        
        // Fetch customers and complete transaction ledger in parallel
        const [custRes, utangRes] = await Promise.all([
            fetch(`http://localhost:3000${endpoint}`),
            fetch('http://localhost:3000/api/get-all-utang')
        ]);

        const rawCustomers = await custRes.json();
        const allUtang = await utangRes.json();

        // Build quick lookup map of transactions per customer (case-insensitive)
        const utangByCustomer = {};
        if (Array.isArray(allUtang)) {
            allUtang.forEach(tx => {
                const nameKey = (tx.customer_name || "").trim().toLowerCase();
                if (!utangByCustomer[nameKey]) {
                    utangByCustomer[nameKey] = [];
                }
                utangByCustomer[nameKey].push(tx);
            });
        }

        // Compute metrics for each customer
        cachedCustomerFolders = (rawCustomers || []).map(c => {
            const nameKey = (c.fullname || "").trim().toLowerCase();
            const txList = utangByCustomer[nameKey] || [];
            
            let debtsSum = 0;
            let paymentsSum = 0;
            let lastTxDate = null;

            txList.forEach(tx => {
                const amt = parseFloat(tx.amount) || 0;
                const isPayment = tx.items_list && tx.items_list.includes("Debt Payment");
                if (isPayment) {
                    paymentsSum += amt;
                } else {
                    debtsSum += amt;
                }
                if (tx.date_borrowed && (!lastTxDate || new Date(tx.date_borrowed) > new Date(lastTxDate))) {
                    lastTxDate = tx.date_borrowed;
                }
            });

            const totalDebt = Math.max(0, debtsSum - paymentsSum);
            const limit = (c.credit_limit !== undefined && c.credit_limit !== null) ? parseFloat(c.credit_limit) : 2000.00;
            const utilPct = limit > 0 ? (totalDebt / limit) * 100 : 0;
            const availCredit = Math.max(0, limit - totalDebt);

            return {
                ...c,
                totalDebt: totalDebt,
                debtsSum: debtsSum,
                paymentsSum: paymentsSum,
                credit_limit_num: limit,
                utilPct: utilPct,
                availCredit: availCredit,
                txCount: txList.length,
                lastTxDate: lastTxDate
            };
        });

        // Update Executive KPI Metrics Grid
        const kpiGrid = document.getElementById("ledgerKpiGrid");
        if (kpiGrid) {
            if (currentFolderViewTab === "ARCHIVED") {
                kpiGrid.style.display = "none";
            } else {
                kpiGrid.style.display = "grid";

                let grandReceivables = 0;
                let activeDebtorsCount = 0;
                let highRiskCount = 0;
                let totalCreditLine = 0;

                cachedCustomerFolders.forEach(c => {
                    grandReceivables += c.totalDebt;
                    if (c.totalDebt > 0) activeDebtorsCount++;
                    if (c.utilPct >= 80) highRiskCount++;
                });

                const kpiReceivablesEl = document.getElementById("kpiTotalReceivables");
                if (kpiReceivablesEl) kpiReceivablesEl.innerText = `₱${grandReceivables.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

                const kpiDebtorsEl = document.getElementById("kpiActiveDebtors");
                if (kpiDebtorsEl) kpiDebtorsEl.innerText = `${activeDebtorsCount} Debtor${activeDebtorsCount === 1 ? '' : 's'}`;

                const kpiDebtorsSub = document.getElementById("kpiActiveDebtorsSub");
                if (kpiDebtorsSub) kpiDebtorsSub.innerText = `Out of ${cachedCustomerFolders.length} total customer${cachedCustomerFolders.length === 1 ? '' : 's'}`;

                const kpiRiskEl = document.getElementById("kpiHighRiskDebtors");
                if (kpiRiskEl) kpiRiskEl.innerText = `${highRiskCount} Account${highRiskCount === 1 ? '' : 's'}`;
            }
        }

        // Apply current filter & sort
        const searchInput = document.getElementById("searchCreditCustomer");
        const query = searchInput ? searchInput.value.trim().toLowerCase() : "";
        filterCustomerFolders(query);

    } catch (err) {
        console.error("Failed to render folders:", err);
    }
}

function clearCreditSearch() {
    const input = document.getElementById("searchCreditCustomer");
    if (input) {
        input.value = "";
        filterCustomerFolders("");
    }
}

function filterCustomerFolders(query = "") {
    const container = document.getElementById("customerFolderList");
    if (!container) return;

    const cleanQuery = (query || "").trim().toLowerCase();
    const isArchived = typeof currentFolderViewTab !== "undefined" && currentFolderViewTab === "ARCHIVED";

    // Toggle clear search button visibility
    const clearBtn = document.getElementById("clearCreditSearchBtn");
    if (clearBtn) {
        clearBtn.style.display = cleanQuery ? "block" : "none";
    }

    let filtered = [...(cachedCustomerFolders || [])];
    if (cleanQuery) {
        filtered = filtered.filter(c => {
            const name = (c.fullname || "").toLowerCase();
            const phone = (c.contact_number || "").toLowerCase();
            const address = (c.address || "").toLowerCase();
            return name.includes(cleanQuery) || phone.includes(cleanQuery) || address.includes(cleanQuery);
        });
    }

    // Apply Sort Mode
    const sortSelect = document.getElementById("sortCreditFolders");
    const sortMode = sortSelect ? sortSelect.value : "debt-desc";

    filtered.sort((a, b) => {
        const debtA = a.totalDebt || 0;
        const debtB = b.totalDebt || 0;
        const nameA = a.fullname || "";
        const nameB = b.fullname || "";

        if (sortMode === "debt-desc") return debtB - debtA;
        if (sortMode === "debt-asc") return debtA - debtB;
        if (sortMode === "name-asc") return nameA.localeCompare(nameB);
        if (sortMode === "name-desc") return nameB.localeCompare(nameA);
        if (sortMode === "recent") {
            const dateA = a.lastTxDate ? new Date(a.lastTxDate).getTime() : 0;
            const dateB = b.lastTxDate ? new Date(b.lastTxDate).getTime() : 0;
            return dateB - dateA;
        }
        return debtB - debtA;
    });

    if (filtered.length === 0) {
        const emptyMsg = cleanQuery 
            ? `No ledger folders match "${query}".`
            : (isArchived ? "No archived folders found." : "No active ledger folders found.");
        container.innerHTML = `
            <div style="color: #94a3b8; padding: 45px 20px; grid-column: 1/-1; text-align: center; background: white; border-radius: 16px; border: 1px dashed #cbd5e1;">
                <i class="fa-solid fa-folder-open" style="display:block; font-size:2.2rem; margin-bottom:12px; color: #cbd5e1;"></i>
                <span style="font-size: 1rem; color: #64748b; font-weight: 600;">${emptyMsg}</span>
            </div>`;
        return;
    }

    container.innerHTML = filtered.map(c => {
        const totalDebt = c.totalDebt || 0;
        const creditLimit = c.credit_limit_num || 2000.00;
        const utilPct = c.utilPct || 0;
        const availCredit = c.availCredit !== undefined ? c.availCredit : Math.max(0, creditLimit - totalDebt);
        const txCount = c.txCount || 0;

        let statusPillHtml = '';
        let balanceColor = '#ffffff';
        let meterColor = '#10b981';
        let availColor = '#10b981';

        if (isArchived) {
            statusPillHtml = `<span class="folder-status-pill pill-archived"><i class="fa-solid fa-box-archive"></i> Archived</span>`;
            balanceColor = '#94a3b8';
            meterColor = '#64748b';
            availColor = '#94a3b8';
        } else if (totalDebt === 0) {
            statusPillHtml = `<span class="folder-status-pill pill-settled"><i class="fa-solid fa-circle-check"></i> Settled (₱0)</span>`;
            balanceColor = '#10b981';
            meterColor = '#10b981';
            availColor = '#10b981';
        } else if (utilPct >= 100) {
            statusPillHtml = `<span class="folder-status-pill pill-danger"><i class="fa-solid fa-triangle-exclamation"></i> Over Limit</span>`;
            balanceColor = '#ff7675';
            meterColor = '#ef4444';
            availColor = '#ef4444';
        } else if (utilPct >= 80) {
            statusPillHtml = `<span class="folder-status-pill pill-warning"><i class="fa-solid fa-triangle-exclamation"></i> Near Limit (${utilPct.toFixed(0)}%)</span>`;
            balanceColor = '#f59e0b';
            meterColor = '#f59e0b';
            availColor = '#f59e0b';
        } else {
            statusPillHtml = `<span class="folder-status-pill pill-good"><i class="fa-solid fa-shield-halved"></i> Good Standing</span>`;
            balanceColor = '#ffffff';
            meterColor = '#10b981';
            availColor = '#10b981';
        }

        const folderBackground = isArchived 
            ? "background: linear-gradient(135deg, #334155, #1e293b); box-shadow: 0 12px 28px rgba(30, 41, 59, 0.25);" 
            : "background: linear-gradient(135deg, #2c274d, #111021);";
            
        const tabBackground = isArchived ? "background: #334155;" : "background: #17123f;";
        const safeFullname = (c.fullname || "").replace(/'/g, "\\'");

        return `
        <div class="customer-folder-card" style="${folderBackground}" onclick="viewCustomerDetails(${c.customer_id}, '${safeFullname}')">
            <!-- Folder Tab Lip -->
            <div class="customer-folder-tab-lip" style="${tabBackground}">
                ${statusPillHtml}
            </div>
            
            <!-- Peeking Paper Notepad -->
            <div class="folder-paper">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span class="folder-label-name" title="${c.fullname}">${c.fullname}</span>
                    <span class="folder-id-badge">#${c.customer_id}</span>
                </div>
                <div class="paper-lines"></div>
            </div>
            
            <!-- Folder Content -->
            <div class="folder-content">
                <!-- Outstanding Balance Box -->
                <div class="folder-balance-block">
                    <span class="folder-balance-label">Outstanding Debt</span>
                    <span class="folder-balance-amount" style="color: ${balanceColor};">₱${totalDebt.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>

                <!-- Credit Limit Utilization Meter -->
                <div class="folder-utilization-box">
                    <div class="utilization-header">
                        <span>Limit: <strong>₱${creditLimit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                        <span style="color: ${meterColor}; font-weight: 800;">${utilPct.toFixed(1)}%</span>
                    </div>
                    <div class="utilization-track">
                        <div class="utilization-bar" style="width: ${Math.min(100, Math.max(0, utilPct))}%; background: ${meterColor};"></div>
                    </div>
                    <div class="utilization-footer">
                        <span>Available: <strong style="color: ${availColor};">₱${availCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></span>
                        <span>${txCount} record(s)</span>
                    </div>
                </div>

                <!-- Contact Details -->
                <div class="folder-details">
                    <span title="Contact Number"><i class="fa-solid fa-phone"></i> ${c.contact_number || "N/A"}</span>
                    <span title="Address"><i class="fa-solid fa-location-dot"></i> ${c.address || "N/A"}</span>
                </div>
                
                <!-- Bottom Action Row -->
                <div class="folder-action-row">
                    ${isArchived ? `
                        <button onclick="restoreArchivedFolder(event, ${c.customer_id})" class="folder-restore-btn" title="Restore customer folder to active ledger">
                            <i class="fa-solid fa-rotate-left"></i> Restore Folder
                        </button>
                    ` : `
                        <span class="folder-open-cue">Open Ledger <i class="fa-solid fa-arrow-right"></i></span>
                    `}
                </div>
            </div>
        </div>`;
    }).join("");
}

// --- CREDIT LEDGER: ITEM TRANSACTION LIST table ---
async function renderSpecificLedger(customerName) {
    const tableBody = document.getElementById('specificUtangTableBody');
    if (!tableBody) return;

    try {
        // 1. Fetch customer record to get credit limit and contact details
        let customerLimit = 2000.00;
        let customerObj = null;
        try {
            const custEndpoint = (typeof currentFolderViewTab !== 'undefined' && currentFolderViewTab === 'ARCHIVED') 
                ? '/api/get-archived-customers' 
                : '/api/get-customers';
            const custRes = await fetch(`http://localhost:3000${custEndpoint}`);
            const custList = await custRes.json();
            customerObj = custList.find(c => (c.fullname || '').toLowerCase() === customerName.toLowerCase());
            if (customerObj && customerObj.credit_limit !== undefined && customerObj.credit_limit !== null) {
                customerLimit = parseFloat(customerObj.credit_limit);
            }
        } catch (e) {
            console.warn("Could not fetch customer details:", e);
        }

        // Populate Dossier Header Info
        const nameTitleEl = document.getElementById('currentFolderName');
        if (nameTitleEl) nameTitleEl.innerText = customerName;

        const initials = customerName.split(' ')
            .filter(Boolean)
            .slice(0, 2)
            .map(w => w[0].toUpperCase())
            .join('') || 'C';
        const avatarEl = document.getElementById('dossierAvatar');
        if (avatarEl) avatarEl.innerText = initials;

        if (customerObj) {
            const phoneEl = document.getElementById('dossierPhone');
            if (phoneEl) phoneEl.innerText = customerObj.contact_number || 'N/A';
            const addrEl = document.getElementById('dossierAddress');
            if (addrEl) addrEl.innerText = customerObj.address || 'N/A';
            const idBadgeEl = document.getElementById('dossierIdBadge');
            if (idBadgeEl) idBadgeEl.innerHTML = `<i class="fa-solid fa-hashtag"></i> ID #${customerObj.customer_id}`;
        }

        // Fetch Transactions List
        const res = await fetch(`http://localhost:3000/api/utang-list-by-name?name=${encodeURIComponent(customerName)}`);
        const transactionList = await res.json();

        let totalOutstandingDebt = 0;
        let totalAmountBorrowed = 0;
        let totalProfitBorrowed = 0;

        // Update Record Count Badge
        const countBadge = document.getElementById('statementCountBadge');
        if (countBadge) {
            countBadge.innerText = `${(transactionList || []).length} Transaction${(transactionList || []).length === 1 ? '' : 's'}`;
        }

        if (!transactionList || transactionList.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="3" style="padding: 40px; text-align: center; color: #94a3b8;"><i class="fa-solid fa-receipt" style="display:block; font-size:2rem; margin-bottom:10px; color:#cbd5e1;"></i> No credit transactions on file for this account.</td></tr>';
            
            const totalContainer = document.getElementById('customerDebtTotal');
            if (totalContainer) {
                totalContainer.innerText = "₱0.00";
                totalContainer.style.color = "#10b981";
            }
            const oldLabel = document.getElementById('ledgerAccruedProfitLabel');
            if (oldLabel) oldLabel.remove();

            const creditLimitEl = document.getElementById('customerCreditLimit');
            const availableCreditEl = document.getElementById('customerAvailableCredit');
            const btnEditLimit = document.getElementById('btnEditCreditLimit');

            if (creditLimitEl) {
                creditLimitEl.innerText = `₱${customerLimit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            }
            if (availableCreditEl) {
                availableCreditEl.innerText = `₱${customerLimit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                availableCreditEl.style.color = "#10b981";
            }
            if (btnEditLimit) {
                btnEditLimit.style.display = (typeof currentFolderViewTab !== 'undefined' && currentFolderViewTab === 'ARCHIVED') ? 'none' : 'inline-flex';
            }

            const utilBar = document.getElementById('terminalUtilBar');
            if (utilBar) {
                utilBar.style.width = '0%';
                utilBar.style.background = '#10b981';
            }

            const statusPill = document.getElementById('dossierStatusPill');
            if (statusPill) {
                statusPill.className = 'folder-status-pill pill-settled';
                statusPill.innerHTML = '<i class="fa-solid fa-circle-check"></i> Settled (₱0)';
            }

            const trackingTerminal = document.getElementById('paymentInputTerminal');
            const inputsWrapper = document.getElementById('paymentInputsWrapper');
            const settledNotice = document.getElementById('paymentSettledNotice');
            if (inputsWrapper) inputsWrapper.style.display = 'none';
            if (settledNotice) {
                settledNotice.innerHTML = `
                    <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 15px; border-radius: 12px; text-align: center; color: #065f46; font-weight: 700; font-size: 0.92rem; width: 100%;">
                        <i class="fa-solid fa-circle-check"></i> Account is in Good Standing (No Debt)
                    </div>`;
                settledNotice.style.display = 'block';
            }
            if (trackingTerminal) {
                trackingTerminal.style.display = 'flex';
                trackingTerminal.style.flexDirection = 'column';
            }
            return;
        }

        // --- STEP 1: CHRONOLOGICAL RUNNING BALANCES POOL FOR STYLING OVERRIDES ---
        let debts = transactionList.filter(tx => !tx.items_list.includes("Debt Payment")).reverse();
        let payments = transactionList.filter(tx => tx.items_list.includes("Debt Payment")).reverse();
        let totalPastPayments = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);

        debts.forEach(debt => {
            let amt = parseFloat(debt.amount);
            if (totalPastPayments >= amt) {
                totalPastPayments -= amt;
                debt.isRowFullyPaid = true;
            } else {
                totalPastPayments = 0;
                debt.isRowFullyPaid = false;
            }
        });

        debts.reverse();

        // --- STEP 2: RENDER STATEMENT ROWS ---
        tableBody.innerHTML = transactionList.map(tx => {
            const txAmt = parseFloat(tx.amount);
            const txProfit = parseFloat(tx.profit) || 0;
            const isPayment = tx.items_list.includes("Debt Payment");

            if (isPayment) {
                totalOutstandingDebt -= txAmt;
            } else {
                totalOutstandingDebt += txAmt;
                totalAmountBorrowed += txAmt;
                totalProfitBorrowed += txProfit;
            }

            const matchingDebtObj = !isPayment ? debts.find(d => d.utang_id === tx.utang_id) : null;
            const isRowSettled = matchingDebtObj ? matchingDebtObj.isRowFullyPaid : false;

            let rowStyle = isRowSettled ? 'opacity: 0.5; background-color: #fafbfc;' : '';
            let descriptionHtml = "";
            let amountHtml = "";
            
            if (isPayment) {
                descriptionHtml = `
                    <div style="display: flex; align-items: center; gap: 8px;">
                        <span style="background: #ecfdf5; color: #065f46; border: 1px solid #a7f3d0; padding: 3px 8px; border-radius: 6px; font-size: 0.74rem; font-weight: 800; display: inline-flex; align-items: center; gap: 5px;">
                            <i class="fa-solid fa-circle-check"></i> CASH PAYMENT
                        </span>
                        <span style="color: #475569; font-size: 0.88rem; font-weight: 500;">Cash collection payment received</span>
                    </div>`;
                amountHtml = `<strong style="color: #10b981; font-size: 1.05rem;">-₱${txAmt.toFixed(2)}</strong>`;
            } else {
                try {
                    const parsedItems = JSON.parse(tx.items_list);
                    descriptionHtml = parsedItems.map(i => `
                        <span style="display: inline-flex; align-items: center; gap: 5px; background: #f8fafc; border: 1px solid #e2e8f0; padding: 2px 8px; border-radius: 5px; margin: 2px; font-size: 0.86rem; font-weight: 600; color: #1e293b;">
                            ${i.name} <strong style="color: #64748b; font-size: 0.76rem; background: #e2e8f0; padding: 1px 5px; border-radius: 3px;">×${i.qty}</strong>
                        </span>
                    `).join('');
                } catch(e) { 
                    descriptionHtml = `<span style="color: #1e293b; font-weight: 600;">${tx.items_list}</span>`; 
                }
                
                if (isRowSettled) {
                    descriptionHtml = `
                        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                            <span style="text-decoration: line-through; color: #94a3b8;">${descriptionHtml}</span>
                            <span style="background: #f1f5f9; color: #64748b; border: 1px solid #e2e8f0; font-size: 0.68rem; font-weight: 800; padding: 2px 6px; border-radius: 4px;">
                                <i class="fa-solid fa-check"></i> SETTLED
                            </span>
                        </div>`;
                    amountHtml = `<span style="color: #94a3b8; text-decoration: line-through; font-weight: 700;">₱${txAmt.toFixed(2)}</span>`;
                } else {
                    amountHtml = `<strong style="color: #e11d48; font-size: 1.05rem;">₱${txAmt.toFixed(2)}</strong>`;
                }
            }

            const txDate = new Date(tx.date_borrowed);
            const dateFormatted = txDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

            return `
                <tr style="border-bottom: 1px solid #f1f5f9; ${rowStyle}">
                    <td style="padding: 13px 18px; color: #64748b; font-size: 0.85rem; font-weight: 500; white-space: nowrap;">
                        <i class="fa-regular fa-calendar" style="margin-right: 6px; color: #94a3b8;"></i> ${dateFormatted}
                    </td>
                    <td style="padding: 13px 18px;">${descriptionHtml}</td>
                    <td style="padding: 13px 18px; text-align: right; white-space: nowrap;">${amountHtml}</td>
                </tr>`;
        }).join('');

        // --- STEP 3: UPDATE TERMINAL & PROGRESS BAR ---
        const effectiveDebt = Math.max(0, totalOutstandingDebt);
        const availableCredit = Math.max(0, customerLimit - effectiveDebt);
        const usedPct = customerLimit > 0 ? (effectiveDebt / customerLimit) * 100 : 0;

        // Total Debt in Terminal
        const totalContainer = document.getElementById('customerDebtTotal');
        if (totalContainer) {
            totalContainer.innerText = `₱${effectiveDebt.toFixed(2)}`;
            totalContainer.style.color = effectiveDebt > 0 ? "#be123c" : "#10b981";
            
            const oldLabel = document.getElementById('ledgerAccruedProfitLabel');
            if (oldLabel) oldLabel.remove();
        }

        // Update Credit Limit & Available Credit
        const creditLimitEl = document.getElementById('customerCreditLimit');
        const availableCreditEl = document.getElementById('customerAvailableCredit');
        const btnEditLimit = document.getElementById('btnEditCreditLimit');

        if (creditLimitEl) {
            creditLimitEl.innerText = `₱${customerLimit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        }
        if (availableCreditEl) {
            availableCreditEl.innerText = `₱${availableCredit.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
            if (availableCredit <= 0) {
                availableCreditEl.style.color = "#ef4444";
            } else if (availableCredit < (customerLimit * 0.25)) {
                availableCreditEl.style.color = "#f59e0b";
            } else {
                availableCreditEl.style.color = "#10b981";
            }
        }
        if (btnEditLimit) {
            btnEditLimit.style.display = (typeof currentFolderViewTab !== 'undefined' && currentFolderViewTab === 'ARCHIVED') ? 'none' : 'inline-flex';
        }

        // Update Credit Utilization Progress Fill
        const utilBar = document.getElementById('terminalUtilBar');
        if (utilBar) {
            utilBar.style.width = `${Math.min(100, Math.max(0, usedPct))}%`;
            utilBar.style.background = usedPct >= 100 ? '#ef4444' : (usedPct >= 80 ? '#f59e0b' : '#10b981');
        }

        // Update Dossier Status Pill
        const statusPill = document.getElementById('dossierStatusPill');
        if (statusPill) {
            if (typeof currentFolderViewTab !== 'undefined' && currentFolderViewTab === 'ARCHIVED') {
                statusPill.className = 'folder-status-pill pill-archived';
                statusPill.innerHTML = '<i class="fa-solid fa-box-archive"></i> Archived';
            } else if (effectiveDebt === 0) {
                statusPill.className = 'folder-status-pill pill-settled';
                statusPill.innerHTML = '<i class="fa-solid fa-circle-check"></i> Settled (₱0)';
            } else if (usedPct >= 100) {
                statusPill.className = 'folder-status-pill pill-danger';
                statusPill.innerHTML = '<i class="fa-solid fa-circle-exclamation"></i> Over Limit';
            } else if (usedPct >= 80) {
                statusPill.className = 'folder-status-pill pill-warning';
                statusPill.innerHTML = `<i class="fa-solid fa-triangle-exclamation"></i> Near Limit (${usedPct.toFixed(0)}%)`;
            } else {
                statusPill.className = 'folder-status-pill pill-good';
                statusPill.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Good Standing';
            }
        }

        // Update Quick Pay Full Balance Button
        const quickPayBtn = document.getElementById('btnQuickPayFull');
        const quickPayDisplay = document.getElementById('quickPayAmountDisplay');
        if (quickPayBtn) {
            quickPayBtn.style.display = effectiveDebt > 0 ? 'flex' : 'none';
            if (quickPayDisplay) {
                quickPayDisplay.innerText = `₱${effectiveDebt.toFixed(2)}`;
            }
        }

        // Payment Terminal State
        const trackingTerminal = document.getElementById('paymentInputTerminal');
        const inputsWrapper = document.getElementById('paymentInputsWrapper');
        const settledNotice = document.getElementById('paymentSettledNotice');

        if (trackingTerminal) {
            trackingTerminal.style.display = 'flex';
            trackingTerminal.style.flexDirection = 'column';

            if (typeof currentFolderViewTab !== 'undefined' && currentFolderViewTab === 'ARCHIVED') {
                if (inputsWrapper) inputsWrapper.style.display = 'none';
                if (settledNotice) {
                    settledNotice.innerHTML = `
                        <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 15px; border-radius: 12px; text-align: center; color: #065f46; font-weight: 700; font-size: 0.95rem; width: 100%;">
                            <i class="fa-solid fa-circle-check"></i> The Debt is Fully Paid
                        </div>`;
                    settledNotice.style.display = 'block';
                }
            } else if (effectiveDebt <= 0) {
                if (inputsWrapper) inputsWrapper.style.display = 'none';
                if (settledNotice) {
                    settledNotice.innerHTML = `
                        <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 15px; border-radius: 12px; text-align: center; color: #065f46; font-weight: 700; font-size: 0.92rem; width: 100%;">
                            <i class="fa-solid fa-circle-check"></i> Account is in Good Standing (No Debt)
                        </div>`;
                    settledNotice.style.display = 'block';
                }
            } else {
                if (inputsWrapper) {
                    inputsWrapper.style.display = 'flex';
                    inputsWrapper.style.flexDirection = 'column';
                }
                if (settledNotice) {
                    settledNotice.style.display = 'none';
                }
            }
        }

    } catch (err) {
        console.error("Ledger rendering broken:", err);
    }
}


// --- FOLDER LINK ACTION INTERCEPTOR ---
// Triggered when an archived restore item signature request hits button states
async function restoreArchivedFolder(event, customerId) {
    if (event) event.stopPropagation(); // Prevents layout modal bubble triggers
    if (!confirm("Restore this settled customer profile folder back to active status?")) return;
    try {
        const res = await fetch(`http://localhost:3000/api/restore-customer-folder/${customerId}`, { method: 'PUT' });
        if (res.ok) {
            alert("Folder restored smoothly!");
            renderCustomerFolders();
        }
    } catch (err) { 
        console.error(err); 
    }
}

// --- HISTORY INTERFACE PANEL CONTROLLERS ---

function openHistorySubSection(type) {
    // 1. COMPLETELY HIDE the primary menu choice cards so they leave the screen layout
    const mainHubMenu = document.getElementById('historyHubMenu');
    if (mainHubMenu) {
        mainHubMenu.style.setProperty('display', 'none', 'important');
    }
    
    // 2. Clear view state fields and load selected ledger tables
    if (type === 'transactions') {
        document.getElementById('subPanelPriceLogs').style.display = 'none';
        document.getElementById('subPanelTransactions').style.display = 'block';
        renderTransactionHistory();
    } else if (type === 'pricelogs') {
        document.getElementById('subPanelTransactions').style.display = 'none';
        document.getElementById('subPanelSubPanelPriceLogs' ? 'subPanelPriceLogs' : 'subPanelPriceLogs').style.display = 'block';
        renderPriceLog();
    }
}

function backToHistoryHub() {
    // 1. COMPLETELY HIDE both itemized historical transaction and price data sheets
    document.getElementById('subPanelTransactions').style.display = 'none';
    document.getElementById('subPanelPriceLogs').style.display = 'none';
    
    // 2. RESTORE the grid view context for your option cards cleanly
    const mainHubMenu = document.getElementById('historyHubMenu');
    if (mainHubMenu) {
        mainHubMenu.style.setProperty('display', 'grid', 'important');
    }
}


// Image to Base64 for local file import
function handleProfilePreview(input) {
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        reader.onload = (e) => {
            document.getElementById('userProfilePreview').src = e.target.result;
            document.getElementById('hiddenProfilePic').value = e.target.result;
        };
        reader.readAsDataURL(input.files[0]);
    }
}

async function renderUserList() {
    const container = document.getElementById('userListContainer');
    try {
        const response = await fetch('http://localhost:3000/api/users');
        let users = await response.json();
        
        const showInactive = document.getElementById('showInactiveStaff')?.checked || false;
        const currentLoggedInUser = (localStorage.getItem('currentUser') || '').toLowerCase();
        
        // Count active admins in the whole list
        const activeAdminsCount = users.filter(usr => (usr.role || '').toLowerCase() === 'admin' && usr.account_state !== 'INACTIVE' && usr.account_state !== 'BANNED').length;

        // Filter users based on active status
        if (!showInactive) {
            users = users.filter(u => u.account_state !== 'INACTIVE' && u.account_state !== 'BANNED');
        }
        
        // Define a list of soft, professional colors
        const colors = ['#eff6ff', '#f0fdf4', '#fff7ed', '#f5f3ff', '#fef2f2', '#f0f9ff'];
        
        container.innerHTML = users.map((u, index) => {
            const bgColor = colors[index % colors.length];
            const isInactive = u.account_state === 'INACTIVE' || u.account_state === 'BANNED';
            const isOnline = u.is_online === true || u.is_online === 1;
            const isSelf = (u.email || '').toLowerCase() === currentLoggedInUser;
            const isSoleAdmin = (u.role || '').toLowerCase() === 'admin' && activeAdminsCount <= 1;
            const isProtected = isSelf || (isSoleAdmin && !isInactive);
            
            // Safe JSON stringification to prevent quote breaking in onclick
            const safeUserJSON = JSON.stringify(u).replace(/'/g, "&#39;");

            const selfTagHtml = isSelf 
                ? `<span style="font-size: 0.72rem; color: #2563eb; font-weight: 800; background: #dbeafe; padding: 2px 7px; border-radius: 6px; margin-left: 4px;">You</span>` 
                : '';

            const deactivationButtonHtml = isProtected
                ? `<span style="background: #f1f5f9; color: #64748b; border: 1px solid #cbd5e1; padding: 6px 10px; border-radius: 8px; font-weight: 700; font-size: 0.75rem; display: flex; align-items: center; gap: 5px; cursor: default;" title="${isSelf ? 'Your active account is protected from self-deactivation' : 'Sole active Administrator is protected'}"><i class="fa-solid fa-shield-halved" style="color: #3b82f6;"></i> Protected</span>`
                : `<button onclick="deactivateUser(${u.id}, '${u.account_state}')" class="cancel-btn" style="background: ${isInactive ? '#10b981' : '#ef4444'}; color: white; border: none; padding: 6px 10px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; font-size: 0.8rem;">
                        ${isInactive ? 'Reactivate' : 'Deactivate'}
                   </button>`;
            
            return `
            <div class="employee-card" style="background-color: ${bgColor} !important; border: 1px solid ${isInactive ? '#fca5a5' : '#cbd5e1'}; position: relative; opacity: ${isInactive ? 0.75 : 1}; padding: 20px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; text-align: center;">
                <!-- Status Badge -->
                <span class="status-badge" style="position: absolute; top: 12px; right: 12px; font-size: 0.75rem; font-weight: 800; padding: 4px 10px; border-radius: 6px; text-transform: uppercase; background: ${isInactive ? '#fee2e2' : '#dcfce7'}; color: ${isInactive ? '#ef4444' : '#15803d'}; border: 1px solid ${isInactive ? '#fecaca' : '#bbf7d0'};">
                    ${isInactive ? 'Inactive' : 'Active'}
                </span>

                <div style="width:60px; height:60px; border-radius:50%; background:white; display:flex; align-items:center; justify-content:center; margin-bottom:10px; box-shadow: 0 2px 4px rgba(0,0,0,0.03);">
                    <i class="fa-solid fa-user" style="font-size: 25px; color: ${isInactive ? '#94a3b8' : '#64748b'};"></i>
                </div>
                <h4 style="margin: 5px 0 2px 0; font-weight: 700; color: #1e293b; display: flex; align-items: center; justify-content: center; gap: 6px; flex-wrap: wrap;">
                    <span style="width: 10px; height: 10px; border-radius: 50%; display: inline-block; background: ${isOnline ? '#10b981' : '#94a3b8'}; box-shadow: ${isOnline ? '0 0 8px #10b981' : 'none'};" title="${isOnline ? 'Online' : 'Offline'}"></span>
                    <span>${u.first_name} ${u.last_name}</span>
                    ${selfTagHtml}
                </h4>
                <p style="color: #64748b; font-size: 0.85rem; margin-bottom: 15px; font-weight: 500;">${u.role}</p>
                
                <div style="display: flex; gap: 6px; width: 100%; justify-content: center; align-items: center; flex-wrap: wrap;">
                    <button onclick='openEditModal(${safeUserJSON})' class="cancel-btn" style="background:white; border: 1px solid #cbd5e1; padding: 6px 10px; border-radius: 8px; cursor: pointer; transition: 0.2s;" title="Edit Details">
                        <i class="fa-solid fa-pen" style="color: #64748b;"></i>
                    </button>
                    <button onclick="openActivityLogsModal('${u.email}')" class="cancel-btn" style="background:white; border: 1px solid #cbd5e1; padding: 6px 10px; border-radius: 8px; cursor: pointer; transition: 0.2s;" title="View Activity Logs">
                        <i class="fa-solid fa-clock-rotate-left" style="color: #4f46e5;"></i>
                    </button>
                    ${deactivationButtonHtml}
                </div>
            </div>
            `;
        }).join('');
    } catch (err) {
        console.error("Error rendering user list:", err);
    }
}

let existingUsers = [];

async function openEditModal(user) {
    document.getElementById('editUserId').value = user.id;
    document.getElementById('editEmail').value = user.email;
    document.getElementById('editFname').value = user.first_name;
    document.getElementById('editMi').value = user.middle_initial || '';
    document.getElementById('editLname').value = user.last_name;
    document.getElementById('editContact').value = user.contact_number;
    document.getElementById('editAddress').value = user.address;
    document.getElementById('editRole').value = user.role;
    document.getElementById('editUserModal').style.display = 'flex';
    
    try {
        const response = await fetch('http://localhost:3000/api/users');
        existingUsers = await response.json();
    } catch (e) {
        console.error("Failed to load existing users for email check:", e);
    }
}

// Validation Helper Function
function validateUserInputs(email, fname, mi, lname, contact, address) {
    const trimmedEmail = (email || '').trim();
    const trimmedFname = (fname || '').trim();
    const trimmedLname = (lname || '').trim();
    const trimmedMi = (mi || '').trim();
    const trimmedContact = (contact || '').trim();
    const trimmedAddress = (address || '').trim();

    if (!trimmedEmail || !trimmedFname || !trimmedLname || !trimmedContact || !trimmedAddress) {
        alert("Validation Error: All fields except Middle Initial are required!");
        return false;
    }

    const emailRegex = /^[a-z0-9._%+-]+@weljo\.com$/i;
    if (!emailRegex.test(trimmedEmail)) {
        alert("Security Restriction: Staff accounts must use the official corporate email domain (@weljo.com)!");
        return false;
    }

    const nameRegex = /^[A-Za-z\s\-]{2,50}$/;
    if (!nameRegex.test(trimmedFname)) {
        alert("Validation Error: First Name must contain only letters, spaces, or hyphens (2 to 50 characters)!");
        return false;
    }
    if (!nameRegex.test(trimmedLname)) {
        alert("Validation Error: Last Name must contain only letters, spaces, or hyphens (2 to 50 characters)!");
        return false;
    }

    if (trimmedMi) {
        const miRegex = /^[A-Za-z]{1,2}$/;
        if (!miRegex.test(trimmedMi)) {
            alert("Validation Error: Middle Initial must contain only 1 or 2 letters!");
            return false;
        }
    }

    // Strict Philippine Mobile Number: must start with 09 and be exactly 11 digits
    const contactRegex = /^09\d{9}$/;
    if (!contactRegex.test(trimmedContact)) {
        alert("Validation Error: Contact number must be a valid 11-digit Philippine mobile number starting with 09 (e.g., 09123456789)!");
        return false;
    }

    if (trimmedAddress.length < 3 || trimmedAddress.length > 150) {
        alert("Validation Error: Address must be between 3 and 150 characters!");
        return false;
    }

    return true;
}

document.getElementById('editUserForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = document.getElementById('editUserId').value;
    const email = document.getElementById('editEmail').value;
    const fname = document.getElementById('editFname').value;
    const mi = document.getElementById('editMi').value;
    const lname = document.getElementById('editLname').value;
    const contact = document.getElementById('editContact').value;
    const address = document.getElementById('editAddress').value;
    const role = document.getElementById('editRole').value;
    const currentLoggedInUser = localStorage.getItem('currentUser') || '';

    if (!validateUserInputs(email, fname, mi, lname, contact, address)) return;

    // Fresh check on existing users for self-demotion & last admin protection
    let freshUsers = [];
    try {
        const r = await fetch('http://localhost:3000/api/users');
        freshUsers = await r.json();
    } catch (e) {}

    const targetUser = freshUsers.find(u => String(u.id) === String(id));
    if (targetUser) {
        // Trapping 1: If current logged-in user is demoting themselves from Admin to Cashier
        if (targetUser.email.toLowerCase() === currentLoggedInUser.toLowerCase() && targetUser.role.toLowerCase() === 'admin' && role.toLowerCase() !== 'admin') {
            return alert("Security Protection: You cannot demote your own account from Admin to Cashier!");
        }

        // Trapping 2: If demoting the last active Admin
        if (targetUser.role.toLowerCase() === 'admin' && role.toLowerCase() !== 'admin') {
            const activeAdmins = freshUsers.filter(u => u.role.toLowerCase() === 'admin' && u.account_state !== 'INACTIVE' && u.account_state !== 'BANNED');
            if (activeAdmins.length <= 1) {
                return alert("Security Protection: Cannot demote the last remaining active Admin in the system!");
            }
        }
    }

    const userData = { email, fname, mi, lname, contact, address, role };

    const res = await fetch(`http://localhost:3000/api/update-user/${id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(userData)
    });
    
    const data = await res.json();
    if (res.ok) {
        alert("User details updated successfully!");
        closeModalByName('editUserModal');
        renderUserList();
    } else {
        alert("Failed to update user: " + (data.error || "Server error"));
    }
});

async function deactivateUser(id, currentStatus) {
    const isInactive = currentStatus === 'INACTIVE' || currentStatus === 'BANNED';
    const newStatus = isInactive ? 'ACTIVE' : 'INACTIVE';
    const currentLoggedInUser = localStorage.getItem('currentUser') || '';

    // Fetch fresh users to verify roles & active counts
    let freshUsers = [];
    try {
        const r = await fetch('http://localhost:3000/api/users');
        freshUsers = await r.json();
    } catch (e) {}

    const targetUser = freshUsers.find(u => String(u.id) === String(id));
    if (!targetUser) return alert("User not found.");

    if (!isInactive) {
        // Trapping 1: Prevent self-deactivation
        if (targetUser.email.toLowerCase() === currentLoggedInUser.toLowerCase()) {
            return alert("Security Protection: You cannot deactivate your own logged-in admin account!");
        }

        // Trapping 2: Prevent deactivating the last active admin
        if (targetUser.role.toLowerCase() === 'admin') {
            const activeAdmins = freshUsers.filter(u => u.role.toLowerCase() === 'admin' && u.account_state !== 'INACTIVE' && u.account_state !== 'BANNED');
            if (activeAdmins.length <= 1) {
                return alert("Security Protection: Cannot deactivate the last remaining active Admin in the system!");
            }
        }

        if (!confirm(`Are you sure you want to deactivate ${targetUser.first_name} ${targetUser.last_name}? They will lose login access, but all their transaction history logs will remain safely intact.`)) {
            return;
        }
    }
    
    const res = await fetch(`http://localhost:3000/api/update-user-status/${id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ status: newStatus })
    });
    const data = await res.json();
    if (!res.ok) {
        alert("Operation failed: " + (data.error || "Server error"));
    }
    renderUserList();
}

async function openUserModal() {
    document.getElementById('userModal').style.display = 'flex';
    try {
        const response = await fetch('http://localhost:3000/api/users');
        existingUsers = await response.json();
    } catch (e) {
        console.error("Failed to load existing users for email check:", e);
    }
}

document.getElementById('userForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('uEmail').value;
    const fname = document.getElementById('uFname').value;
    const mi = document.getElementById('uMi').value;
    const lname = document.getElementById('uLname').value;
    const contact = document.getElementById('uContact').value;
    const address = document.getElementById('uAddress').value;
    const pass = document.getElementById('uPass').value;
    const confirmPass = document.getElementById('uConfirmPass').value;
    const role = document.getElementById('uRole').value;

    if (!validateUserInputs(email, fname, mi, lname, contact, address)) return;

    if (pass !== confirmPass) return alert("Security Error: Passwords do not match!");

    // Password strength check (at least 8 characters, containing both letters and numbers)
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,64}$/;
    if (!passwordRegex.test(pass)) {
        return alert("Security Requirement: Password must be at least 8 characters long and contain both letters and numbers!");
    }

    const userData = { email, fname, mi, lname, contact, address, password: pass, role };

    const res = await fetch('http://localhost:3000/api/add-user', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(userData)
    });

    const data = await res.json();
    if (res.ok) {
        alert("User created successfully!");
        closeModalByName('userModal');
        document.getElementById('userForm').reset();
        renderUserList();
    } else {
        if (data.error && data.error.includes("unique")) {
            alert("Error: This email address is already registered!");
        } else {
            alert("Failed to create user: " + (data.error || "Server error"));
        }
    }
});

// --- AUTO-GENERATE SYSTEM EMAILS ---
function setupEmailAutoGeneration() {
    const uFname = document.getElementById('uFname');
    const uLname = document.getElementById('uLname');
    const uEmail = document.getElementById('uEmail');

    const generateEmail = () => {
        const fn = uFname.value.toLowerCase().replace(/[^a-z0-9]/g, '');
        const ln = uLname.value.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (fn || ln) {
            let baseEmail = `${fn}${fn && ln ? '.' : ''}${ln}`;
            let emailCandidate = `${baseEmail}@weljo.com`;
            let counter = 1;
            
            while (existingUsers.some(u => u.email.toLowerCase() === emailCandidate.toLowerCase())) {
                emailCandidate = `${baseEmail}${counter}@weljo.com`;
                counter++;
            }
            uEmail.value = emailCandidate;
        } else {
            uEmail.value = '';
        }
    };

    uFname?.addEventListener('input', generateEmail);
    uLname?.addEventListener('input', generateEmail);

    const editFname = document.getElementById('editFname');
    const editLname = document.getElementById('editLname');
    const editEmail = document.getElementById('editEmail');

    const generateEditEmail = () => {
        const fn = editFname.value.toLowerCase().replace(/[^a-z0-9]/g, '');
        const ln = editLname.value.toLowerCase().replace(/[^a-z0-9]/g, '');
        if (fn || ln) {
            let baseEmail = `${fn}${fn && ln ? '.' : ''}${ln}`;
            let emailCandidate = `${baseEmail}@weljo.com`;
            let counter = 1;
            const currentUserId = document.getElementById('editUserId')?.value;
            
            while (existingUsers.some(u => u.email.toLowerCase() === emailCandidate.toLowerCase() && String(u.id) !== String(currentUserId))) {
                emailCandidate = `${baseEmail}${counter}@weljo.com`;
                counter++;
            }
            editEmail.value = emailCandidate;
        } else {
            editEmail.value = '';
        }
    };

    editFname?.addEventListener('input', generateEditEmail);
    editLname?.addEventListener('input', generateEditEmail);
}

// Track internal navigation vs true window exit
document.addEventListener('click', (e) => {
    const target = e.target.closest('a, button');
    if (target) {
        sessionStorage.setItem('nav_internal', '1');
        setTimeout(() => sessionStorage.removeItem('nav_internal'), 2000);
    }
});

const sendExitBeacon = () => {
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
};

window.addEventListener('pagehide', sendExitBeacon);
window.addEventListener('beforeunload', sendExitBeacon);

document.addEventListener('visibilitychange', () => {
    const email = localStorage.getItem('currentUser');
    if (!email) return;
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';

    if (document.visibilityState === 'hidden') {
        sendExitBeacon();
    } else if (document.visibilityState === 'visible') {
        const pingUrl = isLocal ? 'http://localhost:3000/api/users/heartbeat' : 'https://thesis-semifinal.onrender.com/api/users/heartbeat';
        fetch(pingUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-user-email': email },
            body: JSON.stringify({ email })
        }).catch(() => {});
    }
});

function startHeartbeat() {
    const email = localStorage.getItem('currentUser');
    if (!email) return;
    
    const ping = () => {
        if (document.visibilityState === 'hidden') return;
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
    setInterval(ping, 10000);
}

// --- STAFF ACTIVITY LOG INTERFACE ---

async function openActivityLogsModal(preselectedEmail = "") {
    const modal = document.getElementById('activityLogsModal');
    if (!modal) return;
    modal.style.display = 'flex';
    
    // Populate the staff list filter dropdown
    const select = document.getElementById('logFilterEmail');
    if (select) {
        try {
            const response = await fetch('http://localhost:3000/api/users');
            const users = await response.json();
            
            // Keep only the first "All Staff" option, clear the rest
            select.innerHTML = '<option value="">All Staff Members</option>';
            users.forEach(u => {
                select.innerHTML += `<option value="${u.email}">${u.first_name} ${u.last_name} (${u.email})</option>`;
            });
            
            if (preselectedEmail) {
                select.value = preselectedEmail;
            }
        } catch (err) {
            console.error("Failed to populate logs staff filter:", err);
        }
    }
    
    fetchAndRenderActivityLogs();
}

function closeActivityLogsModal() {
    const modal = document.getElementById('activityLogsModal');
    if (modal) modal.style.display = 'none';
}

function resetActivityLogFilters() {
    const emailSelect = document.getElementById('logFilterEmail');
    const actionSelect = document.getElementById('logFilterAction');
    const dateInput = document.getElementById('logFilterDate');
    
    if (emailSelect) emailSelect.value = "";
    if (actionSelect) actionSelect.value = "";
    if (dateInput) dateInput.value = "";
    
    fetchAndRenderActivityLogs();
}

async function fetchAndRenderActivityLogs() {
    const tbody = document.getElementById('activityLogsTableBody');
    if (!tbody) return;
    
    const email = document.getElementById('logFilterEmail')?.value || "";
    const action = document.getElementById('logFilterAction')?.value || "";
    const date = document.getElementById('logFilterDate')?.value || "";
    
    tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 30px; color: #64748b;"><i class="fa-solid fa-spinner fa-spin"></i> Filtering activity logs...</td></tr>';
    
    try {
        const url = `http://localhost:3000/api/activity-logs?email=${encodeURIComponent(email)}&category=${encodeURIComponent(action)}&date=${encodeURIComponent(date)}`;
        const response = await fetch(url);
        const logs = await response.json();
        
        if (logs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 30px; color: #94a3b8; font-weight: 500;">No activity logs found matching the filter criteria.</td></tr>';
            return;
        }
        
        tbody.innerHTML = logs.map(l => {
            const logDate = new Date(l.timestamp);
            const formattedTime = isNaN(logDate.getTime()) ? l.timestamp : logDate.toLocaleString('en-US', {
                timeZone: 'Asia/Manila',
                year: 'numeric',
                month: 'numeric',
                day: 'numeric',
                hour: 'numeric',
                minute: '2-digit',
                second: '2-digit',
                hour12: true
            });
            
            // Stylize action names with color badges
            let actionBadgeStyle = 'background: #f1f5f9; color: #475569;';
            const act = l.action.toLowerCase();
            if (act.includes('login')) {
                actionBadgeStyle = 'background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0;';
            } else if (act.includes('logout')) {
                actionBadgeStyle = 'background: #f3f4f6; color: #4b5563; border: 1px solid #e5e7eb;';
            } else if (act.includes('sale') || act.includes('payment')) {
                actionBadgeStyle = 'background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd;';
            } else if (act.includes('archive') || act.includes('deactivate')) {
                actionBadgeStyle = 'background: #fffbeb; color: #b45309; border: 1px solid #fde68a;';
            } else if (act.includes('product') || act.includes('staff')) {
                actionBadgeStyle = 'background: #f5f3ff; color: #6d28d9; border: 1px solid #ddd6fe;';
            }
            
            return `
            <tr style="border-bottom: 1px solid #f1f5f9;">
                <td style="padding: 12px 15px; color: #64748b; font-weight: 500;">${formattedTime}</td>
                <td style="padding: 12px 15px; font-weight: 700; color: #1e293b;">${l.user_email}</td>
                <td style="padding: 12px 15px;">
                    <span style="display: inline-block; font-size: 0.75rem; font-weight: 800; padding: 4px 8px; border-radius: 6px; text-transform: uppercase; ${actionBadgeStyle}">
                        ${l.action}
                    </span>
                </td>
                <td style="padding: 12px 15px; color: #475569; font-weight: 500;">${l.details}</td>
            </tr>
            `;
        }).join('');
        
    } catch (err) {
        console.error("Failed to fetch activity logs:", err);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; padding: 30px; color: #ef4444; font-weight: 600;">Failed to load activity logs from server.</td></tr>';
    }
}

// --- 7. SALES REPORT GENERATOR & PDF EXPORTER ---
let currentReportPeriod = 'day';

function setReportPeriod(period) {
    currentReportPeriod = period;
    document.querySelectorAll('#reports-section .range-btn').forEach(btn => {
        btn.classList.remove('active');
        btn.style.background = 'transparent';
        btn.style.color = '#64748b';
    });

    const activeBtn = document.getElementById(`btnReport${period.charAt(0).toUpperCase() + period.slice(1)}`);
    if (activeBtn) {
        activeBtn.classList.add('active');
        activeBtn.style.background = '#1d2b38';
        activeBtn.style.color = 'white';
    }

    generateReportEngine();
}

// Global State for Reports Type Selector
let currentReportType = 'cash';

function populateReportCategoryDropdown(categories) {
    const select = document.getElementById('reportCategoryFilter');
    if (!select) return;
    const currentVal = select.value || 'ALL';

    let html = '<option value="ALL">All Categories</option>';
    const sortedCats = Array.from(categories).sort((a, b) => a.localeCompare(b));
    sortedCats.forEach(cat => {
        html += `<option value="${cat}">${cat}</option>`;
    });
    select.innerHTML = html;
    if (currentVal && Array.from(select.options).some(o => o.value === currentVal)) {
        select.value = currentVal;
    }
}

let cachedReportCreditors = [];

async function populateReportCustomerDropdown() {
    const hiddenInput = document.getElementById('reportCustomerFilter');
    const searchInput = document.getElementById('reportCustomerSearchInput');
    const clearBtn = document.getElementById('btnClearReportCustomer');
    if (!hiddenInput) return;

    try {
        let customerNames = new Set();
        let allUtangList = [];

        // 1. Fetch from active customers
        try {
            const activeRes = await fetch('http://localhost:3000/api/get-customers');
            if (activeRes.ok) {
                const activeList = await activeRes.json();
                if (Array.isArray(activeList)) {
                    activeList.forEach(c => { if (c.fullname) customerNames.add(c.fullname.trim()); });
                }
            }
        } catch(e) {}

        // 2. Fetch from archived customers
        try {
            const archRes = await fetch('http://localhost:3000/api/get-archived-customers');
            if (archRes.ok) {
                const archList = await archRes.json();
                if (Array.isArray(archList)) {
                    archList.forEach(c => { if (c.fullname) customerNames.add(c.fullname.trim()); });
                }
            }
        } catch(e) {}

        // 3. Fallback to customer-folders if available
        try {
            const folderRes = await fetch('http://localhost:3000/api/customer-folders');
            if (folderRes.ok) {
                const folderList = await folderRes.json();
                if (Array.isArray(folderList)) {
                    folderList.forEach(c => { if (c.fullname) customerNames.add(c.fullname.trim()); });
                }
            }
        } catch(e) {}

        // 4. Fetch utang transactions to compute remaining balances accurately
        try {
            const utangRes = await fetch('http://localhost:3000/api/get-all-utang');
            if (utangRes.ok) {
                const utangList = await utangRes.json();
                if (Array.isArray(utangList)) {
                    allUtangList = utangList;
                    allUtangList.forEach(u => { if (u.customer_name) customerNames.add(u.customer_name.trim()); });
                }
            }
        } catch(e) {}

        // Calculate active remaining balance for every customer
        const customerBalances = {};
        customerNames.forEach(name => { customerBalances[name] = 0; });

        allUtangList.forEach(u => {
            if (!u.customer_name) return;
            const name = u.customer_name.trim();
            if (customerBalances[name] === undefined) customerBalances[name] = 0;
            const isPayment = (u.items_list || '').includes("Debt Payment");
            const amt = parseFloat(u.amount) || 0;
            if (isPayment) {
                customerBalances[name] -= amt;
            } else {
                customerBalances[name] += amt;
            }
        });

        // Partition into Active Debtors (balance > 0) vs Settled Accounts (balance <= 0)
        const activeDebtors = [];
        const settledAccounts = [];

        customerNames.forEach(name => {
            const bal = Math.max(0, customerBalances[name] || 0);
            if (bal > 0) {
                activeDebtors.push({ name, balance: bal });
            } else {
                settledAccounts.push({ name, balance: 0 });
            }
        });

        activeDebtors.sort((a, b) => a.name.localeCompare(b.name));
        settledAccounts.sort((a, b) => a.name.localeCompare(b.name));

        cachedReportCreditors = [...activeDebtors, ...settledAccounts];

        // Sync input display
        const currentVal = hiddenInput.value || 'ALL';
        if (searchInput) {
            if (currentVal === 'ALL') {
                searchInput.value = 'All Creditors (Storewide)';
                if (clearBtn) clearBtn.style.display = 'none';
            } else {
                searchInput.value = currentVal;
                if (clearBtn) clearBtn.style.display = 'block';
            }
        }
    } catch (err) {
        console.error("Failed to load customer list for reports:", err);
    }
}

function showCreditorSuggestions(filterText = '') {
    const box = document.getElementById('reportCustomerSuggestions');
    if (!box) return;

    const query = (filterText || '').trim().toLowerCase();
    let matches = [];

    if (!query || query === 'all' || query.includes('storewide')) {
        // Show up to 8 top creditors
        matches = cachedReportCreditors.slice(0, 8);
    } else {
        matches = cachedReportCreditors.filter(c => c.name.toLowerCase().includes(query));
    }

    let html = `
        <div class="creditor-suggest-item" onclick="selectCreditorReport('ALL')" style="padding: 9px 12px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #e2e8f0; background: #f8fafc; font-weight: 700; color: #1e293b;">
            <span><i class="fa-solid fa-users" style="color: #64748b; margin-right: 6px;"></i> All Creditors (Storewide)</span>
            <span style="font-size: 0.72rem; color: #64748b; font-weight: 600;">Storewide</span>
        </div>
    `;

    if (matches.length === 0) {
        html += `<div style="padding: 14px 12px; color: #94a3b8; font-size: 0.8rem; text-align: center; font-style: italic;">No creditor found matching "${filterText}"</div>`;
    } else {
        matches.forEach(c => {
            const isDebt = c.balance > 0;
            const badge = isDebt 
                ? `<span style="color: #be123c; font-weight: 700; font-size: 0.72rem; background: #fff1f2; padding: 2px 6px; border-radius: 4px; border: 1px solid #fecdd3;">₱${c.balance.toFixed(2)} debt</span>`
                : `<span style="color: #059669; font-weight: 700; font-size: 0.72rem; background: #ecfdf5; padding: 2px 6px; border-radius: 4px; border: 1px solid #a7f3d0;">Settled</span>`;
            
            const safeName = c.name.replace(/'/g, "\\'");
            html += `
                <div class="creditor-suggest-item" onclick="selectCreditorReport('${safeName}')" style="padding: 8px 12px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid #f1f5f9; transition: background 0.15s;">
                    <span style="font-weight: 600; color: #1e293b; font-size: 0.82rem;">${c.name}</span>
                    ${badge}
                </div>
            `;
        });
    }

    box.innerHTML = html;
    box.style.display = 'block';
}

function onCreditorSearchInput(val) {
    showCreditorSuggestions(val);
}

function selectCreditorReport(name) {
    const hiddenInput = document.getElementById('reportCustomerFilter');
    const searchInput = document.getElementById('reportCustomerSearchInput');
    const clearBtn = document.getElementById('btnClearReportCustomer');
    const box = document.getElementById('reportCustomerSuggestions');

    if (hiddenInput) hiddenInput.value = name;
    if (searchInput) {
        searchInput.value = name === 'ALL' ? 'All Creditors (Storewide)' : name;
    }
    if (clearBtn) {
        clearBtn.style.display = name === 'ALL' ? 'none' : 'block';
    }
    if (box) {
        box.style.display = 'none';
    }

    generateReportEngine();
}

function resetReportCustomerToAll() {
    selectCreditorReport('ALL');
}

function hideCreditorSuggestions() {
    const box = document.getElementById('reportCustomerSuggestions');
    if (box) box.style.display = 'none';

    const hiddenInput = document.getElementById('reportCustomerFilter');
    const searchInput = document.getElementById('reportCustomerSearchInput');
    if (hiddenInput && searchInput) {
        searchInput.value = hiddenInput.value === 'ALL' ? 'All Creditors (Storewide)' : hiddenInput.value;
    }
}

// Close creditor suggestion box when clicking outside
document.addEventListener('click', (e) => {
    const wrapper = document.getElementById('reportCustomerSelectWrapper');
    if (wrapper && !wrapper.contains(e.target)) {
        const box = document.getElementById('reportCustomerSuggestions');
        if (box && box.style.display !== 'none') {
            hideCreditorSuggestions();
        }
    }
});

function setReportType(type) {
    currentReportType = type;

    // Update active button styles
    const btnCash = document.getElementById('btnReportCash');
    const btnCollections = document.getElementById('btnReportCollections');

    if (btnCash) {
        btnCash.style.background = type === 'cash' ? '#1d2b38' : 'transparent';
        btnCash.style.color = type === 'cash' ? 'white' : '#475569';
    }
    if (btnCollections) {
        btnCollections.style.background = type === 'collections' ? '#1d2b38' : 'transparent';
        btnCollections.style.color = type === 'collections' ? 'white' : '#475569';
    }

    // Toggle category vs creditor selector visibility
    const catWrapper = document.getElementById('reportCategorySelectWrapper');
    const custWrapper = document.getElementById('reportCustomerSelectWrapper');

    if (catWrapper) {
        catWrapper.style.display = type === 'cash' ? 'flex' : 'none';
    }
    if (custWrapper) {
        custWrapper.style.display = type === 'collections' ? 'flex' : 'none';
    }

    if (type === 'collections') {
        populateReportCustomerDropdown();
    }

    generateReportEngine();
}

function toggleReportCategoryCollapse(catSafeId) {
    const rows = document.querySelectorAll(`.report-cat-item-${catSafeId}`);
    const chevron = document.getElementById(`cat-chevron-${catSafeId}`);
    if (!rows || rows.length === 0) return;

    const isHidden = rows[0].style.display === 'none';
    rows.forEach(r => {
        r.style.display = isHidden ? 'table-row' : 'none';
    });
    if (chevron) {
        chevron.style.transform = isHidden ? 'rotate(0deg)' : 'rotate(-90deg)';
    }
}

async function generateReportEngine() {
    const startInput = document.getElementById('reportStartDate');
    const endInput = document.getElementById('reportEndDate');
    const tableBody = document.getElementById('reportTableBody');
    const tableHeader = document.getElementById('reportTableHeader');
    if (!startInput || !endInput || !tableBody || !tableHeader) return;

    const today = new Date();
    if (!startInput.value) {
        startInput.value = today.toLocaleDateString('sv-SE');
    }
    if (!endInput.value) {
        endInput.value = today.toLocaleDateString('sv-SE');
    }

    const startDate = new Date(startInput.value);
    const endDate = new Date(endInput.value);
    startDate.setHours(0,0,0,0);
    endDate.setHours(23,59,59,999);

    // Update document generated date/time
    document.getElementById('reportGenTime').innerText = new Date().toLocaleString();
    document.getElementById('reportOperatorEmail').innerText = localStorage.getItem('currentUser') || 'system@weljo.com';

    // Format Period Header Text
    let rangeText = "";
    const startFormatted = startDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
    const endFormatted = endDate.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });

    if (startInput.value === endInput.value) {
        rangeText = startFormatted;
    } else {
        rangeText = `${startFormatted} - ${endFormatted}`;
    }
    document.getElementById('reportPeriodText').innerText = rangeText;

    tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 30px; color: #64748b;"><i class="fa-solid fa-spinner fa-spin"></i> Generating report sheets...</td></tr>';

    try {
        // --- 1. DIRECT SALES (CASH) REPORT TYPE: ORGANIZED BY CATEGORY & TOGGLEABLE ---
        if (currentReportType === 'cash') {
            const selectedCategory = document.getElementById('reportCategoryFilter')?.value || 'ALL';

            const docTitle = document.getElementById('reportDocumentTitle');
            const docSubtitle = document.getElementById('reportDocumentSubtitle');
            if (docTitle) {
                docTitle.innerText = "Sales Performance Report";
            }
            if (docSubtitle) {
                if (selectedCategory !== 'ALL') {
                    docSubtitle.style.display = 'block';
                    docSubtitle.innerHTML = `<span style="color: #64748b; font-size: 0.78rem; font-weight: 600; text-transform: uppercase;">Category:</span> <strong style="color: #0f172a; font-size: 0.9rem;">${selectedCategory}</strong>`;
                } else {
                    docSubtitle.style.display = 'none';
                    docSubtitle.innerHTML = '';
                }
            }

            tableHeader.innerHTML = `
                <th style="padding: 10px 8px; width: 42%;">ITEM NAME</th>
                <th style="padding: 10px 8px; width: 14%; text-align: center;">ITEMS SOLD</th>
                <th style="padding: 10px 8px; width: 14%; text-align: right;">UNIT PRICE</th>
                <th style="padding: 10px 8px; width: 15%; text-align: right;">TOTAL SALES</th>
                <th style="padding: 10px 8px; width: 15%; text-align: right;">TOTAL PROFIT</th>
            `;

            document.getElementById('reportMetric1Label').innerText = "Total Items Sold";
            document.getElementById('reportMetric2Label').innerText = "Total Sales";
            document.getElementById('reportMetric3Label').innerText = "Total Profit";
            document.getElementById('reportMetric4Label').innerText = "Profit Margin";
            document.getElementById('reportTotalProfit').style.color = "#10b981";
            document.getElementById('reportTotalMargin').style.color = "#f59e0b";

            const [salesRes, prodRes] = await Promise.all([
                fetch('http://localhost:3000/api/sales'),
                fetch('http://localhost:3000/api/products')
            ]);
            const allSales = (salesRes.ok ? await salesRes.json() : []) || [];
            const dbProducts = (prodRes.ok ? await prodRes.json() : []) || [];

            // Extract all categories in database to populate category dropdown
            const categorySet = new Set();
            dbProducts.forEach(p => {
                if (p.prod_category) categorySet.add(p.prod_category.trim().toUpperCase());
            });

            const filteredSales = (Array.isArray(allSales) ? allSales : []).filter(sale => {
                const saleDate = new Date(sale.sale_date);
                return saleDate >= startDate && saleDate <= endDate;
            }).sort((a, b) => new Date(a.sale_date) - new Date(b.sale_date));

            // Group sales by Category -> Product Name -> Price Tiers
            const categoryMap = {};

            filteredSales.forEach(sale => {
                let items = [];
                try {
                    items = typeof sale.items_json === 'string' ? JSON.parse(sale.items_json) : sale.items_json;
                } catch(e){ return; }
                if (!items || !Array.isArray(items)) return;

                items.forEach(i => {
                    if (i.name === 'Debt Payment' || i.isCollection === true) return;
                    const name = i.name;
                    const qty = parseInt(i.qty) || 0;
                    const price = parseFloat(i.price) || 0;
                    const cost = parseFloat(i.cost) || 0;

                    // Match product to retrieve its category
                    const prodMatch = dbProducts.find(p => p.prod_name === name);
                    const rawCat = (prodMatch?.prod_category || 'General').trim();
                    const catKey = rawCat ? rawCat.toUpperCase() : 'GENERAL';
                    categorySet.add(catKey);

                    if (!categoryMap[catKey]) {
                        const theme = categoryThemeRegistry[catKey] || { icon: "fa-solid fa-boxes-stacked" };
                        categoryMap[catKey] = {
                            name: catKey,
                            icon: theme.icon || "fa-solid fa-boxes-stacked",
                            totalQty: 0,
                            totalGross: 0,
                            totalProfit: 0,
                            items: {}
                        };
                    }

                    const catObj = categoryMap[catKey];
                    if (!catObj.items[name]) {
                        catObj.items[name] = {
                            qty: 0,
                            gross: 0,
                            profit: 0,
                            priceTiers: {}
                        };
                    }

                    const itemObj = catObj.items[name];
                    const tierKey = price.toFixed(2);
                    if (!itemObj.priceTiers[tierKey]) {
                        itemObj.priceTiers[tierKey] = {
                            price: price,
                            qty: 0,
                            gross: 0,
                            profit: 0,
                            firstDate: sale.sale_date
                        };
                    }

                    const tierObj = itemObj.priceTiers[tierKey];
                    tierObj.qty += qty;
                    tierObj.gross += (qty * price);
                    tierObj.profit += (qty * (price - cost));

                    itemObj.qty += qty;
                    itemObj.gross += (qty * price);
                    itemObj.profit += (qty * (price - cost));

                    catObj.totalQty += qty;
                    catObj.totalGross += (qty * price);
                    catObj.totalProfit += (qty * (price - cost));
                });
            });

            // Populate category filter dropdown
            populateReportCategoryDropdown(categorySet);

            // Filter categories to render based on user selection
            let categoriesToRender = Object.values(categoryMap);
            if (selectedCategory !== 'ALL') {
                categoriesToRender = categoriesToRender.filter(c => c.name === selectedCategory);
            }
            categoriesToRender.sort((a, b) => a.name.localeCompare(b.name));

            let tableHtml = '';
            let grandTotalQty = 0;
            let grandTotalGross = 0;
            let grandTotalProfit = 0;

            categoriesToRender.forEach(cat => {
                grandTotalQty += cat.totalQty;
                grandTotalGross += cat.totalGross;
                grandTotalProfit += cat.totalProfit;

                const catSafeId = cat.name.replace(/[^a-zA-Z0-9]/g, '_');

                // Category Section Header Row with click-to-toggle
                tableHtml += `
                    <tr class="report-cat-header-row" onclick="toggleReportCategoryCollapse('${catSafeId}')" style="background: #f1f5f9; border-top: 2px solid #cbd5e1; border-bottom: 2px solid #cbd5e1; page-break-after: avoid; cursor: pointer; user-select: none;" title="Click to collapse / expand items">
                        <td colspan="5" style="padding: 10px 12px;">
                            <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
                                <span style="font-weight: 800; color: #0f172a; font-size: 0.92rem; text-transform: uppercase; letter-spacing: 0.5px; display: flex; align-items: center; gap: 8px;">
                                    <i id="cat-chevron-${catSafeId}" class="fa-solid fa-chevron-down" style="color: #64748b; font-size: 0.75rem; transition: transform 0.2s;"></i>
                                    <i class="${cat.icon}" style="color: #64748b;"></i> ${cat.name}
                                    <span class="no-print" style="font-size: 0.72rem; color: #94a3b8; font-weight: 600;">(Click to toggle)</span>
                                </span>
                                <span style="font-size: 0.8rem; color: #475569; font-weight: 700;">
                                    Subtotal: ${cat.totalQty} items &nbsp;•&nbsp; Sales: <strong style="color: #0f172a;">₱${cat.totalGross.toFixed(2)}</strong> &nbsp;•&nbsp; Profit: <strong style="color: #10b981;">₱${cat.totalProfit.toFixed(2)}</strong>
                                </span>
                            </div>
                        </td>
                    </tr>
                `;

                // Sorted products in this category
                const sortedItems = Object.entries(cat.items).sort((a, b) => a[0].localeCompare(b[0]));
                sortedItems.forEach(([name, data]) => {
                    const tiers = Object.values(data.priceTiers).sort((a, b) => {
                        if (a.firstDate && b.firstDate) {
                            const diff = new Date(a.firstDate) - new Date(b.firstDate);
                            if (diff !== 0) return diff;
                        }
                        return a.price - b.price;
                    });

                    if (tiers.length <= 1) {
                        const singleTier = tiers[0] || { price: 0 };
                        tableHtml += `
                            <tr class="report-cat-item-${catSafeId}" style="border-bottom: 1px solid #f1f5f9;">
                                <td style="padding: 9px 8px 9px 28px; color: #1e293b; font-weight: 600;">
                                    <span style="color: #94a3b8; margin-right: 6px;">•</span> ${name}
                                </td>
                                <td style="padding: 9px 8px; text-align: center; color: #334155; font-weight: 700;">${data.qty} pcs</td>
                                <td style="padding: 9px 8px; text-align: right; color: #64748b;">₱${singleTier.price.toFixed(2)}</td>
                                <td style="padding: 9px 8px; text-align: right; font-weight: 800; color: #0f172a;">₱${data.gross.toFixed(2)}</td>
                                <td style="padding: 9px 8px; text-align: right; font-weight: 800; color: #10b981;">₱${data.profit.toFixed(2)}</td>
                            </tr>
                        `;
                    } else {
                        // Multi-tier price adjusted item
                        const minP = Math.min(...tiers.map(t => t.price));
                        const maxP = Math.max(...tiers.map(t => t.price));

                        tableHtml += `
                            <tr class="report-cat-item-${catSafeId}" style="border-bottom: 1px dashed #cbd5e1; background: #fafbfc;">
                                <td style="padding: 9px 8px 9px 28px; font-weight: 700; color: #0f172a;">
                                    <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                                        <span>• ${name}</span>
                                        <span style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.68rem; font-weight: 700; background: #fef3c7; color: #b45309; padding: 1px 6px; border-radius: 4px; border: 1px solid #fde68a;">
                                            Price Adjusted (${tiers.length} rates)
                                        </span>
                                    </div>
                                </td>
                                <td style="padding: 9px 8px; text-align: center; font-weight: 800; color: #0f172a;">${data.qty} pcs</td>
                                <td style="padding: 9px 8px; text-align: right; font-weight: 700; color: #64748b; font-size: 0.8rem;">
                                    ₱${minP.toFixed(2)} – ₱${maxP.toFixed(2)}
                                </td>
                                <td style="padding: 9px 8px; text-align: right; font-weight: 800; color: #0f172a;">₱${data.gross.toFixed(2)}</td>
                                <td style="padding: 9px 8px; text-align: right; font-weight: 800; color: #10b981;">₱${data.profit.toFixed(2)}</td>
                            </tr>
                        `;

                        tiers.forEach((tier, idx) => {
                            const isLastTier = idx === tiers.length - 1;
                            tableHtml += `
                                <tr class="report-cat-item-${catSafeId}" style="border-bottom: ${isLastTier ? '1px solid #f1f5f9' : '1px dashed #f8fafc'}; background: #f8fafc;">
                                    <td style="padding: 5px 8px 5px 48px; color: #64748b; font-size: 0.8rem;">
                                        ↳ Sold @ <strong>₱${tier.price.toFixed(2)}</strong>
                                    </td>
                                    <td style="padding: 5px 8px; text-align: center; font-size: 0.8rem; color: #64748b;">${tier.qty} pcs</td>
                                    <td style="padding: 5px 8px; text-align: right; font-size: 0.8rem; color: #64748b;">₱${tier.price.toFixed(2)}</td>
                                    <td style="padding: 5px 8px; text-align: right; font-size: 0.8rem; font-weight: 700; color: #334155;">₱${tier.gross.toFixed(2)}</td>
                                    <td style="padding: 5px 8px; text-align: right; font-size: 0.8rem; font-weight: 700; color: #059669;">₱${tier.profit.toFixed(2)}</td>
                                </tr>
                            `;
                        });
                    }
                });
            });

            if (tableHtml === '') {
                const emptyMsg = selectedCategory !== 'ALL'
                    ? `No sales recorded for "${selectedCategory}" within this period.`
                    : "No sales recorded for this period.";
                tableHtml = `<tr><td colspan="5" style="text-align: center; padding: 40px; color: #94a3b8; font-style: italic;"><i class="fa-solid fa-receipt" style="display:block; font-size:1.8rem; margin-bottom:10px;"></i> ${emptyMsg}</td></tr>`;
            }
            tableBody.innerHTML = tableHtml;

            document.getElementById('reportTotalQty').innerText = `${grandTotalQty} items`;
            document.getElementById('reportTotalGross').innerText = `₱${grandTotalGross.toFixed(2)}`;
            document.getElementById('reportTotalProfit').innerText = `₱${grandTotalProfit.toFixed(2)}`;
            const margin = grandTotalGross > 0 ? (grandTotalProfit / grandTotalGross) * 100 : 0;
            document.getElementById('reportTotalMargin').innerText = `${margin.toFixed(2)}%`;
        }

        // --- 2. CASH COLLECTIONS REPORT TYPE (WITH CREDITOR REMAINING BALANCE & FILTER) ---
        else if (currentReportType === 'collections') {
            const selectedCreditor = document.getElementById('reportCustomerFilter')?.value || 'ALL';
            const isIndividual = selectedCreditor !== 'ALL';

            const docTitle = document.getElementById('reportDocumentTitle');
            const docSubtitle = document.getElementById('reportDocumentSubtitle');
            if (docTitle) {
                docTitle.innerText = isIndividual 
                    ? "Statement of Account" 
                    : "Cash Collections Report";
            }
            if (docSubtitle) {
                if (isIndividual) {
                    docSubtitle.style.display = 'block';
                    docSubtitle.innerHTML = `<span style="color: #64748b; font-size: 0.78rem; font-weight: 600; text-transform: uppercase;">Customer:</span> <strong style="color: #0f172a; font-size: 0.92rem;">${selectedCreditor}</strong>`;
                } else {
                    docSubtitle.style.display = 'none';
                    docSubtitle.innerHTML = '';
                }
            }

            // Immediately set table headers for collections so they are never left as sales headers
            if (isIndividual) {
                tableHeader.innerHTML = `
                    <th style="padding: 10px 6px; width: 16%;">DATE PAID</th>
                    <th style="padding: 10px 6px; width: 36%;">ITEMS SETTLED</th>
                    <th style="padding: 10px 6px; width: 16%; text-align: right;">CASH PAID</th>
                    <th style="padding: 10px 6px; width: 16%; text-align: right;">REMAINING DEBT</th>
                    <th style="padding: 10px 6px; width: 16%; text-align: right;">PROFIT</th>
                `;
            } else {
                tableHeader.innerHTML = `
                    <th style="padding: 10px 6px; width: 14%;">DATE PAID</th>
                    <th style="padding: 10px 6px; width: 20%;">CUSTOMER NAME</th>
                    <th style="padding: 10px 6px; width: 26%;">ITEMS SETTLED</th>
                    <th style="padding: 10px 6px; width: 13%; text-align: right;">CASH PAID</th>
                    <th style="padding: 10px 6px; width: 15%; text-align: right;">REMAINING DEBT</th>
                    <th style="padding: 10px 6px; width: 12%; text-align: right;">PROFIT</th>
                `;
            }

            // Safe fetch of utang records
            const utangRes = await fetch('http://localhost:3000/api/get-all-utang');
            if (!utangRes.ok) throw new Error("Server returned status " + utangRes.status);
            const allUtangData = await utangRes.json();
            const allUtang = Array.isArray(allUtangData) ? allUtangData : [];

            // Safe fetch of customer folders (tries customer-folders, then get-customers fallback)
            let allFolders = [];
            try {
                const foldersRes = await fetch('http://localhost:3000/api/customer-folders');
                if (foldersRes.ok) {
                    allFolders = await foldersRes.json();
                } else {
                    const fallbackRes = await fetch('http://localhost:3000/api/get-customers');
                    if (fallbackRes.ok) allFolders = await fallbackRes.json();
                }
            } catch(e) {
                console.warn("Customer folders fetch fallback:", e);
            }

            // Build map of customer current balances & credit limits
            const customerBalanceMap = {};
            const customerLimitMap = {};

            if (Array.isArray(allFolders)) {
                allFolders.forEach(f => {
                    customerLimitMap[f.fullname] = parseFloat(f.credit_limit) || 2000.00;
                });
            }

            const allCustomerNames = [...new Set(allUtang.map(u => u.customer_name).filter(Boolean))];
            allCustomerNames.forEach(cust => {
                const custTx = allUtang.filter(u => u.customer_name === cust);
                const totalDebts = custTx.filter(u => !(u.items_list || '').includes("Debt Payment")).reduce((s, d) => s + (parseFloat(d.amount) || 0), 0);
                const totalPayments = custTx.filter(u => (u.items_list || '').includes("Debt Payment")).reduce((s, p) => s + (parseFloat(p.amount) || 0), 0);
                customerBalanceMap[cust] = Math.max(0, totalDebts - totalPayments);
            });

            // Calculate storewide active outstanding receivables
            const storewideActiveDebt = Object.values(customerBalanceMap).reduce((sum, b) => sum + b, 0);

            // FIFO settlement calculation for descriptions
            const paymentSettlements = {};
            allCustomerNames.forEach(cust => {
                const custTx = allUtang.filter(u => u.customer_name === cust).reverse();
                const debts = custTx.filter(u => !(u.items_list || '').includes("Debt Payment"));
                const payments = custTx.filter(u => (u.items_list || '').includes("Debt Payment"));

                let debtQueue = debts.map(d => {
                    let items = [];
                    try { items = JSON.parse(d.items_list); } catch(e) {}
                    return {
                        utang_id: d.utang_id,
                        amount: parseFloat(d.amount) || 0,
                        items: Array.isArray(items) ? items : [{ name: d.items_list, qty: 1 }],
                        remainingUnpaid: parseFloat(d.amount) || 0
                    };
                });

                payments.forEach(pay => {
                    let payAmt = parseFloat(pay.amount) || 0;
                    let settled = [];

                    for (let d of debtQueue) {
                        if (payAmt <= 0) break;
                        if (d.remainingUnpaid <= 0) continue;

                        let covered = 0;
                        if (payAmt >= d.remainingUnpaid) {
                            covered = d.remainingUnpaid;
                            payAmt -= d.remainingUnpaid;
                            d.remainingUnpaid = 0;
                        } else {
                            covered = payAmt;
                            d.remainingUnpaid -= payAmt;
                            payAmt = 0;
                        }

                        if (covered > 0) {
                            const ratio = d.amount > 0 ? (covered / d.amount) : 0;
                            d.items.forEach(item => {
                                let q = Math.round((item.qty || 1) * ratio);
                                if (q === 0 && ratio > 0) q = 1;
                                settled.push(`${q}x ${item.name || item}`);
                            });
                        }
                    }

                    paymentSettlements[pay.utang_id] = settled.length > 0 ? settled.join(', ') : 'Debt Balance Settlement';
                });
            });

            // Filter payments in date period
            let periodPayments = allUtang.filter(tx => {
                if (!(tx.items_list || '').includes("Debt Payment")) return false;
                const d = new Date(tx.date_borrowed);
                return d >= startDate && d <= endDate;
            });

            // Apply Creditor Filter if specific creditor chosen
            if (isIndividual) {
                periodPayments = periodPayments.filter(tx => tx.customer_name === selectedCreditor);
            }

            let tableHtml = '';
            let totalCollected = 0;
            let totalProfitRealized = 0;

            periodPayments.forEach(tx => {
                const amt = parseFloat(tx.amount) || 0;
                const prof = parseFloat(tx.profit) || 0;
                totalCollected += amt;
                totalProfitRealized += prof;

                const custBal = customerBalanceMap[tx.customer_name] || 0;
                const balancePill = custBal <= 0
                    ? `<span style="color: #059669; font-weight: 700; background: #ecfdf5; padding: 2px 7px; border-radius: 4px; font-size: 0.78rem;">₱0.00 (Settled)</span>`
                    : `<strong style="color: #be123c;">₱${custBal.toFixed(2)}</strong>`;

                if (isIndividual) {
                    tableHtml += `
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 11px 6px; color: #475569;">${new Date(tx.date_borrowed).toLocaleDateString()}</td>
                            <td style="padding: 11px 6px; color: #475569; font-size: 0.8rem;">${paymentSettlements[tx.utang_id] || 'Debt Balance Settlement'}</td>
                            <td style="padding: 11px 6px; text-align: right; font-weight: 800; color: #0f172a;">₱${amt.toFixed(2)}</td>
                            <td style="padding: 11px 6px; text-align: right;">${balancePill}</td>
                            <td style="padding: 11px 6px; text-align: right; font-weight: 800; color: #10b981;">₱${prof.toFixed(2)}</td>
                        </tr>
                    `;
                } else {
                    tableHtml += `
                        <tr style="border-bottom: 1px solid #e2e8f0;">
                            <td style="padding: 11px 6px; color: #475569;">${new Date(tx.date_borrowed).toLocaleDateString()}</td>
                            <td style="padding: 11px 6px; font-weight: 700; color: #1e293b;">${tx.customer_name}</td>
                            <td style="padding: 11px 6px; color: #475569; font-size: 0.8rem;">${paymentSettlements[tx.utang_id] || 'Debt Balance Settlement'}</td>
                            <td style="padding: 11px 6px; text-align: right; font-weight: 800; color: #0f172a;">₱${amt.toFixed(2)}</td>
                            <td style="padding: 11px 6px; text-align: right;">${balancePill}</td>
                            <td style="padding: 11px 6px; text-align: right; font-weight: 800; color: #10b981;">₱${prof.toFixed(2)}</td>
                        </tr>
                    `;
                }
            });

            if (tableHtml === '') {
                const emptyMsg = isIndividual 
                    ? `No payment records found for "${selectedCreditor}" within this period.`
                    : "No cash collections recorded for this period.";
                tableHtml = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: #94a3b8; font-style: italic;"><i class="fa-solid fa-receipt" style="display:block; font-size:1.8rem; margin-bottom:10px;"></i> ${emptyMsg}</td></tr>`;
            }
            tableBody.innerHTML = tableHtml;

            // Summary Cards Footer
            if (isIndividual) {
                const singleCustBalance = customerBalanceMap[selectedCreditor] || 0;
                const singleCustLimit = customerLimitMap[selectedCreditor] || 2000.00;

                document.getElementById('reportMetric1Label').innerText = "Payments Recorded";
                document.getElementById('reportMetric2Label').innerText = "Total Cash Paid";
                document.getElementById('reportMetric3Label').innerText = "Remaining Debt";
                document.getElementById('reportMetric4Label').innerText = "Credit Limit";

                document.getElementById('reportTotalQty').innerText = `${periodPayments.length} payments`;
                document.getElementById('reportTotalGross').innerText = `₱${totalCollected.toFixed(2)}`;
                
                const debtEl = document.getElementById('reportTotalProfit');
                debtEl.innerText = singleCustBalance <= 0 ? "₱0.00 (Settled)" : `₱${singleCustBalance.toFixed(2)}`;
                debtEl.style.color = singleCustBalance > 0 ? "#be123c" : "#10b981";

                const limitEl = document.getElementById('reportTotalMargin');
                limitEl.innerText = `₱${singleCustLimit.toFixed(2)}`;
                limitEl.style.color = "#2563eb";
            } else {
                document.getElementById('reportMetric1Label').innerText = "Payments Received";
                document.getElementById('reportMetric2Label').innerText = "Total Cash Collected";
                document.getElementById('reportMetric3Label').innerText = "Profit Realized";
                document.getElementById('reportMetric4Label').innerText = "Active Store Receivables";

                document.getElementById('reportTotalQty').innerText = `${periodPayments.length} payments`;
                document.getElementById('reportTotalGross').innerText = `₱${totalCollected.toFixed(2)}`;
                
                const profEl = document.getElementById('reportTotalProfit');
                profEl.innerText = `₱${totalProfitRealized.toFixed(2)}`;
                profEl.style.color = "#10b981";

                const receivablesEl = document.getElementById('reportTotalMargin');
                receivablesEl.innerText = `₱${storewideActiveDebt.toFixed(2)}`;
                receivablesEl.style.color = "#be123c";
            }
        }

    } catch (err) {
        console.error("Report generation failed:", err);
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 30px; color: #ef4444; font-weight: 600;">Failed to fetch transactional streams from database.</td></tr>';
    }
}


// ==========================================================================
// STOCK IN / DELIVERY BATCH & FEFO INVENTORY TRACKING CONTROLLERS
// ==========================================================================

let activeStockInProduct = null;

async function openStockInModal(event, prodId) {
    if (event) event.stopPropagation();
    try {
        const res = await fetch('http://localhost:3000/api/products');
        const products = await res.json();
        const p = products.find(item => item.prod_id === prodId);
        if (!p) return alert("Product not found.");

        activeStockInProduct = p;
        const prodIdInput = document.getElementById('stockInProdId');
        if (prodIdInput) prodIdInput.value = p.prod_id;

        const prodNameEl = document.getElementById('stockInProdName');
        if (prodNameEl) prodNameEl.innerText = p.prod_name;

        const curStockEl = document.getElementById('stockInCurrentStock');
        if (curStockEl) curStockEl.innerText = p.stock_Qty || 0;

        const prodImgEl = document.getElementById('stockInProdImg');
        if (prodImgEl) prodImgEl.src = p.img_Url || 'https://via.placeholder.com/150';

        const qtyInput = document.getElementById('stockInQty');
        if (qtyInput) qtyInput.value = '';

        const expInput = document.getElementById('stockInExpiry');
        if (expInput) expInput.value = '';

        const noteInput = document.getElementById('stockInNote');
        if (noteInput) noteInput.value = '';

        const previewEl = document.getElementById('stockInPreviewTotal');
        if (previewEl) previewEl.innerText = `${p.stock_Qty || 0} units`;

        const modal = document.getElementById('stockInModal');
        if (modal) {
            modal.style.display = 'flex';
            setTimeout(() => document.getElementById('stockInQty')?.focus(), 100);
        }
    } catch (err) {
        console.error("Open Stock In Modal Error:", err);
        alert("Failed to load product details for Stock In.");
    }
}

function closeStockInModal() {
    const modal = document.getElementById('stockInModal');
    if (modal) modal.style.display = 'none';
    activeStockInProduct = null;
}

function previewStockInTotal() {
    if (!activeStockInProduct) return;
    const current = parseInt(activeStockInProduct.stock_Qty) || 0;
    const addVal = parseInt(document.getElementById('stockInQty')?.value) || 0;
    const total = current + Math.max(0, addVal);
    const previewEl = document.getElementById('stockInPreviewTotal');
    if (previewEl) {
        previewEl.innerText = `${total} units (+${Math.max(0, addVal)})`;
    }
}

async function submitStockIn(event) {
    if (event) event.preventDefault();
    const prodId = parseInt(document.getElementById('stockInProdId')?.value);
    const qty = parseInt(document.getElementById('stockInQty')?.value);
    const expiryDate = document.getElementById('stockInExpiry')?.value;
    const note = document.getElementById('stockInNote')?.value;

    if (!prodId || isNaN(qty) || qty <= 0) {
        return alert("Validation Error: Please enter a valid quantity to stock in.");
    }

    const btn = document.getElementById('btnSubmitStockIn');
    if (btn) {
        btn.disabled = true;
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Saving...';
    }

    try {
        const userEmail = localStorage.getItem('currentUser') || 'admin@weljo.com';
        const res = await fetch('http://localhost:3000/api/stock-in', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-user-email': userEmail
            },
            body: JSON.stringify({
                prod_id: prodId,
                qty: qty,
                expiry_date: expiryDate || null,
                supplier_note: note || ''
            })
        });

        const data = await res.json();
        if (res.ok) {
            alert(data.message || "Stock added successfully!");
            closeStockInModal();
            refreshProductsUI();
            
            // Also refresh batch viewer if it was open
            const batchModal = document.getElementById('batchViewerModal');
            if (batchModal && batchModal.style.display === 'flex' && activeBatchViewerProdId === prodId) {
                openBatchViewerModal(null, prodId);
            }
        } else {
            alert("Error: " + (data.error || "Failed to stock in product."));
        }
    } catch (err) {
        console.error("Stock in submit error:", err);
        alert("Network error: Unable to connect to server.");
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<i class="fa-solid fa-circle-check"></i> Add to Inventory';
        }
    }
}

// --- BATCH INSPECTION VIEWER MODAL LOGIC ---
let activeBatchViewerProdId = null;

async function openBatchViewerModal(event, prodId) {
    if (event) event.stopPropagation();
    activeBatchViewerProdId = prodId;

    try {
        const resProd = await fetch('http://localhost:3000/api/products');
        const products = await resProd.json();
        const p = products.find(item => item.prod_id === prodId);
        if (!p) return alert("Product not found.");

        const nameEl = document.getElementById('batchViewerProdName');
        if (nameEl) nameEl.innerText = p.prod_name;

        const stockEl = document.getElementById('batchViewerTotalStock');
        if (stockEl) stockEl.innerText = `${p.stock_Qty} units`;

        const resBatches = await fetch(`http://localhost:3000/api/product-batches/${prodId}`);
        const batches = await resBatches.json();

        const tbody = document.getElementById('batchViewerTableBody');
        if (!tbody) return;

        if (!batches || batches.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align: center; padding: 24px; color: #94a3b8;">No delivery batches recorded yet for this product.</td></tr>`;
        } else {
            const now = new Date();
            tbody.innerHTML = batches.map(b => {
                let expiryStatus = '';
                if (!b.expiry_date) {
                    expiryStatus = '<span style="background: #f1f5f9; color: #64748b; padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 0.76rem;">Non-perishable</span>';
                } else {
                    const exp = new Date(b.expiry_date);
                    const diffDays = Math.ceil((exp - now) / (1000 * 60 * 60 * 24));
                    const dateFormatted = exp.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });

                    if (diffDays <= 0) {
                        expiryStatus = `<span style="background: #fee2e2; color: #dc2626; padding: 3px 8px; border-radius: 6px; font-weight: 800; font-size: 0.76rem;" title="Expired!">${dateFormatted} (Expired)</span>`;
                    } else if (diffDays <= 30) {
                        expiryStatus = `<span style="background: #fef3c7; color: #b45309; padding: 3px 8px; border-radius: 6px; font-weight: 800; font-size: 0.76rem;" title="Expiring soon!">${dateFormatted} (${diffDays}d left)</span>`;
                    } else {
                        expiryStatus = `<span style="background: #ecfdf5; color: #059669; padding: 3px 8px; border-radius: 6px; font-weight: 700; font-size: 0.76rem;">${dateFormatted}</span>`;
                    }
                }

                const receivedFormatted = b.received_date ? new Date(b.received_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Opening';
                const isDepleted = b.batch_qty <= 0;

                return `
                    <tr style="${isDepleted ? 'opacity: 0.5; background: #f8fafc;' : ''}; border-bottom: 1px solid #f1f5f9;">
                        <td style="padding: 10px 12px; font-weight: 700; color: #1e293b;">
                            Batch #${b.batch_id}
                            <span style="display: block; font-size: 0.72rem; color: #94a3b8; font-weight: 500;">Rcvd: ${receivedFormatted}</span>
                        </td>
                        <td style="padding: 10px 12px; text-align: center;">
                            <strong style="color: ${isDepleted ? '#94a3b8' : '#0f172a'}; font-size: 0.95rem;">${b.batch_qty}</strong>
                            <span style="font-size: 0.72rem; color: #94a3b8; display: block;">of ${b.initial_qty}</span>
                        </td>
                        <td style="padding: 10px 12px;">${expiryStatus}</td>
                        <td style="padding: 10px 12px; color: #64748b; font-size: 0.78rem;">${b.supplier_note || '—'}</td>
                    </tr>
                `;
            }).join('');
        }

        const quickStockInBtn = document.getElementById('btnQuickStockInFromViewer');
        if (quickStockInBtn) {
            quickStockInBtn.onclick = () => {
                closeBatchViewerModal();
                openStockInModal(null, prodId);
            };
        }

        const modal = document.getElementById('batchViewerModal');
        if (modal) modal.style.display = 'flex';
    } catch (err) {
        console.error("Open Batch Viewer Error:", err);
        alert("Failed to load batch records.");
    }
}

function closeBatchViewerModal() {
    const modal = document.getElementById('batchViewerModal');
    if (modal) modal.style.display = 'none';
    activeBatchViewerProdId = null;
}


// ==========================================================================
// 5-MINUTE MANAGEMENT SESSION INACTIVITY AUTO-LOGOUT
// ==========================================================================
const INACTIVITY_TOTAL_LIMIT_MS = 5 * 60 * 1000; // 5 minutes (300,000 ms)
const INACTIVITY_WARNING_OFFSET_MS = 30 * 1000;  // Warn 30 seconds before logout (270,000 ms)
const WARNING_TRIGGER_MS = INACTIVITY_TOTAL_LIMIT_MS - INACTIVITY_WARNING_OFFSET_MS;

let inactivityWarningTimer = null;
let inactivityCountdownInterval = null;
let inactivityRemainingSeconds = 30;

function resetInactivityTimer() {
    // If the warning modal is currently shown, user activity (like moving mouse or clicking button) will keep session alive
    const warningModal = document.getElementById('inactivityWarningModal');
    if (warningModal && warningModal.style.display === 'flex') {
        return;
    }

    // Clear existing timers
    if (inactivityWarningTimer) {
        clearTimeout(inactivityWarningTimer);
    }
    if (inactivityCountdownInterval) {
        clearInterval(inactivityCountdownInterval);
    }

    // Set new timer to trigger warning at 4m 30s
    inactivityWarningTimer = setTimeout(showInactivityWarning, WARNING_TRIGGER_MS);
}

function showInactivityWarning() {
    inactivityRemainingSeconds = 30;
    const modal = document.getElementById('inactivityWarningModal');
    const display = document.getElementById('inactivityCountdownDisplay');
    if (display) display.innerText = '30s';
    if (modal) modal.style.display = 'flex';

    if (inactivityCountdownInterval) clearInterval(inactivityCountdownInterval);
    inactivityCountdownInterval = setInterval(() => {
        inactivityRemainingSeconds--;
        if (display) display.innerText = `${inactivityRemainingSeconds}s`;

        if (inactivityRemainingSeconds <= 0) {
            clearInterval(inactivityCountdownInterval);
            performManagementAutoLogout();
        }
    }, 1000);
}

function keepSessionAlive() {
    const modal = document.getElementById('inactivityWarningModal');
    if (modal) modal.style.display = 'none';

    if (inactivityCountdownInterval) {
        clearInterval(inactivityCountdownInterval);
    }

    // Restart fresh 5-minute cycle
    if (inactivityWarningTimer) clearTimeout(inactivityWarningTimer);
    inactivityWarningTimer = setTimeout(showInactivityWarning, WARNING_TRIGGER_MS);
}

async function performManagementAutoLogout() {
    if (inactivityWarningTimer) clearTimeout(inactivityWarningTimer);
    if (inactivityCountdownInterval) clearInterval(inactivityCountdownInterval);

    const userEmail = localStorage.getItem('currentUser');
    if (userEmail) {
        try {
            await fetch('http://localhost:3000/api/logout', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-user-email': userEmail
                },
                body: JSON.stringify({ email: userEmail, reason: 'inactivity_timeout' })
            });
        } catch (err) {
            console.error("Auto logout API notify error:", err);
        }
    }

    // Store inactivity reason flag for login page notice
    sessionStorage.setItem('logoutReason', 'inactivity');

    // Clear session credentials
    localStorage.removeItem('currentUser');
    localStorage.removeItem('userRole');

    // Redirect to login page
    window.location.href = 'login.html';
}

// Bind activity listeners specifically for the Management Panel
function initInactivityDetector() {
    const activityEvents = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click'];
    
    // Debounced listener to avoid high CPU on continuous mouse movements
    let lastActivityCall = 0;
    const handleUserActivity = () => {
        const now = Date.now();
        if (now - lastActivityCall > 1000) { // check at most once per second
            lastActivityCall = now;
            resetInactivityTimer();
        }
    };

    activityEvents.forEach(evt => {
        window.addEventListener(evt, handleUserActivity, { passive: true });
    });

    // Start initial timer
    resetInactivityTimer();
}

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initInactivityDetector);
} else {
    initInactivityDetector();
}
