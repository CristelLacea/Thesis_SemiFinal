// --- INITIALIZATION ---
// Override window.fetch to automatically attach current user email and override endpoint URLs for cloud routing
const originalFetch = window.fetch;
window.fetch = function (url, options = {}) {
    const isLocal = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    const remoteBackendUrl = 'https://weljo-backend.onrender.com'; // TODO: Update with your Render URL
    
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
    
    // Trigger specific logic per tab
    if (id === 'dashboard-overview') { updateOverview(); initChart(); }
    if (id === 'inventory-section') { 
        console.log("Navigating to Inventory, rendering table...");
        backToCategoryHub();}
    if (id === 'statistics-section') {
        const input = document.getElementById('statsMasterDate');
        if (input && !input.value) {
            input.valueAsDate = new Date();
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
        // 🟢 Trigger both logs and users
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
            document.getElementById('prodStock').value = p.stock_Qty;
            document.getElementById('prodImg').value = p.img_Url;
            document.getElementById('prodFav').checked = p.Favorite === 1;
            if(p.expiry_Date) {
                document.getElementById('prodExpiry').value = p.expiry_Date.split('T')[0];
            }
            autoCalcSalePrice();
            modal.querySelector('h3').innerText = "Edit Product";
        }
    } else {
        editId = null;
        document.getElementById('productForm').reset();
        document.getElementById('autoSalePrice').innerText = "₱0.00";
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

    const productData = {
        barcode: barcodeInput || null,
        name: name,
        category: category,
        orig_price: newOrigPrice,
        price_capital: newCapital,
        stock: parseInt(document.getElementById('prodStock').value) || 0,
        expiry: document.getElementById('prodExpiry').value || null,
        img: document.getElementById('prodImg').value || 'https://via.placeholder.com/150',
        fav: document.getElementById('prodFav').checked ? 1 : 0
    };

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

async function loadProductsCache() {
    try {
        const response = await fetch('http://localhost:3000/api/products');
        cachedProductsList = await response.json();
    } catch (error) {
        console.error("Error loading products cache:", error);
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

        // Group active items by category name
        const grouped = activeProducts.reduce((acc, p) => {
            if (p.Favorite === 1) {
                if (!acc['⭐ FAVORITES']) acc['⭐ FAVORITES'] = [];
                acc['⭐ FAVORITES'].push(p);
            }
            
            let cat = p.prod_category ? p.prod_category.toUpperCase().trim() : 'UNCATEGORIZED';
            if (!acc[cat]) acc[cat] = [];
            acc[cat].push(p);
            return acc;
        }, {});

        // Sort category names alphabetically, keeping favorites at position index 0
        const sortedCategories = Object.keys(grouped).sort((a, b) => {
            if (a.includes('FAVORITES')) return -1;
            if (b.includes('FAVORITES')) return 1;
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

    // Sort items alphabetically by product name
    itemsArray.sort((a, b) => a.prod_name.localeCompare(b.prod_name));

    if (itemsArray.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align:center; padding:30px; color:#94a3b8;">No active items assigned here.</td></tr>';
        return;
    }

    tbody.innerHTML = itemsArray.map(p => `
        <tr>
            <td><img src="${p.img_Url}" class="prod-img-sm" style="width:45px; height:45px; object-fit:contain; background:white; border:1px solid #e2e8f0; border-radius:8px;"></td>
            <td style="font-weight:700; color:#1e293b;">${p.prod_name}</td>
            <td style="color:#64748b; font-weight:500;">₱${parseFloat(p.orig_price).toFixed(2)}</td>
            <td style="color:#64748b; font-weight:500;">₱${parseFloat(p.price_capital).toFixed(2)}</td>
            <td style="font-weight:800; color:#0f172a;">₱${(parseFloat(p.orig_price) + parseFloat(p.price_capital)).toFixed(2)}</td>
            <td style="text-align:center;"><span class="stock-badge ${p.stock_Qty <= 5 ? 'stock-low' : 'stock-high'}">${p.stock_Qty}</span></td>
            <td style="text-align:center;"><i class="${p.Favorite ? 'fa-solid' : 'fa-regular'} fa-star" style="color: #f1c40f; cursor:pointer; font-size:1.05rem;" onclick="toggleFav(${p.prod_id})"></i></td>
            <td style="text-align:right;">
                <button class="action-btn" type="button" onclick="openModal(event, ${p.prod_id})" style="color:#64748b; margin-right:8px;">
                <i class="fa-solid fa-pen"></i>
            </button>
            <button class="action-btn" type="button" onclick="archiveProduct(${p.prod_id})" style="color: #f59e0b;">
                <i class="fa-solid fa-box-archive"></i>
            </button>
        </td>
    </tr>`).join('');
}

// Handles typing inside the search input box inside an open category panel
function filterActiveCategoryItems(query) {
    let pool = cachedProductsList.filter(p => (p.is_archived === 0 || p.is_archived === null));
    
    if (globalActiveCategoryName === "⭐ FAVORITES") {
        pool = pool.filter(p => p.Favorite === 1);
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

async function initChart(baseDate = new Date()) {
    const canvas = document.getElementById('salesChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const existingChart = Chart.getChart("salesChart"); 
    if (existingChart) { existingChart.destroy(); }

    try {
        const response = await fetch('http://localhost:3000/api/sales');
        const liveSales = await response.json();
        let labels = [];
        let dataPoints = [];
        const now = new Date(baseDate);
        const todayStr = now.toLocaleDateString('sv-SE');

        if (currentRange === 'today') {
            labels = ['8AM', '10AM', '12PM', '2PM', '4PM', '6PM', '8PM', '10PM'];
            dataPoints = [0, 0, 0, 0, 0, 0, 0, 0];
            liveSales.forEach(sale => {
                const saleDateLocal = new Date(sale.sale_date).toLocaleDateString('sv-SE');
                if (saleDateLocal === todayStr) {
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
        } else if (currentRange === 'weekly') {
            for (let i = 6; i >= 0; i--) {
                const d = new Date(now); 
                d.setDate(now.getDate() - i);
                const dStr = d.toLocaleDateString('sv-SE');
                labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }) + " (" + (d.getMonth()+1) + "/" + d.getDate() + ")");
                const sum = liveSales.filter(s => new Date(s.sale_date).toLocaleDateString('sv-SE') === dStr).reduce((a, b) => a + (parseFloat(b.total_amount) || 0), 0);
                dataPoints.push(sum);
            }
        } else if (currentRange === 'monthly') {
            const viewYear = now.getFullYear();
            const viewMonth = now.getMonth();
            const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
            const isCurrentMonth = viewYear === new Date().getFullYear() && viewMonth === new Date().getMonth();
            const lastDayToDraw = isCurrentMonth ? new Date().getDate() : daysInMonth;

            for (let i = 1; i <= lastDayToDraw; i++) {
                const dStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
                const tempDate = new Date(viewYear, viewMonth, i);
                labels.push(tempDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }));
                const sum = liveSales.filter(s => new Date(s.sale_date).toLocaleDateString('sv-SE') === dStr).reduce((a, b) => a + (parseFloat(b.total_amount) || 0), 0);
                dataPoints.push(sum);
            }
        } else if (currentRange === 'yearly') {
            for (let i = 11; i >= 0; i--) {
                const d = new Date();
                d.setMonth(now.getMonth() - i);
                const m = d.getMonth();
                const y = d.getFullYear();
                labels.push(d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' })); 
                const sum = liveSales.filter(s => {
                    const sd = new Date(s.sale_date);
                    return sd.getMonth() === m && sd.getFullYear() === y;
                }).reduce((a, b) => a + (parseFloat(b.total_amount) || 0), 0);
                dataPoints.push(sum);
            }
        }

        myChart = new Chart(ctx, {
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
                    pointRadius: currentRange === 'monthly' ? 0 : 3
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, ticks: { callback: v => '₱' + v.toLocaleString() } },
                    x: { ticks: { callback: function(val, index) { return currentRange === 'monthly' ? (index % 5 === 0 ? this.getLabelForValue(val) : '') : this.getLabelForValue(val); } } }
                }
            }
        });
    } catch (err) { console.error("Chart load failed:", err); }
}

function handleChartDateChange(dateValue) {
    if (!dateValue) return;
    initChart(new Date(dateValue));
}

// --- 4. MASTER COMPACT STATISTICS ENGINE ---
function setStatPeriod(period) {
    currentStatPeriod = period;
    document.querySelectorAll('.range-btn').forEach(btn => {
        btn.style.background = 'transparent';
        btn.style.color = '#64748b';
    });
    
    const activeBtnMap = { 'day': 'btnStatsDay', 'week': 'btnStatsWeek', 'month': 'btnStatsMonth', 'year': 'btnStatsYear' };
    const activeBtn = document.getElementById(activeBtnMap[period]);
    if (activeBtn) {
        activeBtn.style.background = '#1d2b38';
        activeBtn.style.color = 'white';
    }
    loadStatsEngine();
}

async function loadStatsEngine() {
    const masterDateInput = document.getElementById('statsMasterDate');
    if (!masterDateInput || !masterDateInput.value) return;
    const baseDate = new Date(masterDateInput.value);

    try {
        const [salesRes, prodRes] = await Promise.all([
            fetch('http://localhost:3000/api/sales'),
            fetch('http://localhost:3000/api/products')
        ]);
        const allSales = await salesRes.json();
        const dbProducts = await prodRes.json();

        // A. Process Date Filters
        const filteredSales = allSales.filter(sale => {
            const saleDate = new Date(sale.sale_date);
            if (currentStatPeriod === 'day') {
                return saleDate.toLocaleDateString('sv-SE') === masterDateInput.value;
            } else if (currentStatPeriod === 'week') {
                const diffTime = Math.abs(baseDate - saleDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                return diffDays <= 7;
            } else if (currentStatPeriod === 'month') {
                return saleDate.getMonth() === baseDate.getMonth() && saleDate.getFullYear() === baseDate.getFullYear();
            } else if (currentStatPeriod === 'year') {
                return saleDate.getFullYear() === baseDate.getFullYear();
            }
            return true;
        });

        // B. Compute Primary Metrics Card Indicators
        const revenue = filteredSales.reduce((sum, s) => sum + parseFloat(s.total_amount || 0), 0);
        const profit = filteredSales.reduce((sum, s) => sum + parseFloat(s.total_profit || 0), 0);
        
        let totalUnits = 0;
        filteredSales.forEach(s => {
            try {
                const items = JSON.parse(s.items_json || '[]');
                items.forEach(i => totalUnits += i.qty);
            } catch(e){}
        });
        const margin = revenue > 0 ? (profit / revenue) * 100 : 0;

        document.getElementById('salesReport').innerText = `₱${revenue.toFixed(2)}`;
        document.getElementById('profitReport').innerText = `₱${profit.toFixed(2)}`;
        document.getElementById('totalVolumeReport').innerText = `${totalUnits} units`;
        document.getElementById('marginReport').innerText = `${margin.toFixed(2)}%`;

        // C. Update Children sub-views inside the split panel layout
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
            const items = JSON.parse(s.items_json || '[]');
            items.forEach(i => { 
                if (i.name === 'Debt Payment') return;
                if (i.isCollection === true) return; // 💡 FIXED: Skip rows that are ledger debt payments
                
                map[i.name] = (map[i.name] || 0) + i.qty; 
            });
        } catch(e){}
    });

    const rankedItems = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 5);

    if (rankedItems.length === 0) {
        list.innerHTML += '<li class="top-item" style="justify-content:center; color:#94a3b8; padding:20px;">No sales records found.</li>';
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
            try { items = JSON.parse(sale.items_json || '[]'); } catch(e){ return; }

            items.forEach(item => {
                if (item.name === prod.prod_name) {
                    if (item.isCollection === true) return; // 💡 FIXED: Skip ledger collections to prevent duplicate ranking weight!

                    const price = parseFloat(item.price) || (prod.orig_price + prod.price_capital);
                    const qty = parseInt(item.qty) || 0;
                    const cost = parseFloat(prod.orig_price) || 0;

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

    // --- SORT CATEGORY FOLDERS AND INTERNAL ITEMS ALPHABETICALLY ---
    const sortedCategories = Object.keys(categoryMap).sort();

    container.innerHTML = sortedCategories.map(catName => {
        const catData = categoryMap[catName];
        if (catData.items.length === 0) return '';

        // Sort the internal items list alphabetically by name before mapping to HTML
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

                        return `
                            <!-- Record-Keeping Box Card -->
                            <div class="ledger-record-card" style="background: #ffffff; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; display: flex; flex-direction: column; gap: 15px; box-shadow: 0 2px 4px rgba(0,0,0,0.02);">
                                
                                <!-- Top Row: Product Name and Balanced Summary Metrics -->
                                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #f1f5f9; padding-bottom: 12px;">
                                    <div style="display: flex; align-items: center; gap: 12px;">
                                        <div style="background: #f1f5f9; color: #1d2b38; width: 40px; height: 40px; border-radius: 8px; display: flex; align-items: center; justify-content: center; font-size: 1.1rem; border: 1px solid #e2e8f0;">
                                            <i class="fa-solid fa-box"></i>
                                        </div>
                                        <span style="font-size: 1.2rem; font-weight: 800; color: #1e293b; letter-spacing: -0.3px;">${item.name}</span>
                                    </div>
                                    <div style="display: flex; gap: 15px; font-size: 0.95rem;">
                                        <span style="color: #475569;">Total Sold: <strong style="color: #0f172a; font-size: 1.05rem;">${itemTotalQty} pcs</strong></span>
                                        <span style="color: #64748b;">•</span>
                                        <span style="color: #475569;">Total Profit: <strong style="color: #10b981; font-size: 1.05rem;">₱${item.totalItemProfit.toFixed(2)}</strong></span>
                                    </div>
                                </div>
                                
                                <!-- Bottom Row: Price Breakdown Grid Rows -->
                                <div style="display: flex; flex-wrap: wrap; gap: 15px;">
                                    ${item.hasSales ? Object.entries(item.eras).map(([price, data]) => `
                                        <!-- Price Record Block -->
                                        <div style="background: #f8fafc; border: 1px solid #edf2f7; border-radius: 10px; padding: 12px 18px; min-width: 160px; flex: 1; max-width: 220px;">
                                            <div style="color: #64748b; font-weight: bold; font-size: 0.8rem; margin-bottom: 6px; text-transform: uppercase; letter-spacing: 0.3px;">
                                                Sold at ₱${parseFloat(price).toFixed(0)}
                                            </div>
                                            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 4px;">
                                                <span style="font-size: 0.85rem; color: #475569;">Quantity:</span>
                                                <strong style="font-size: 1.1rem; color: #1e293b; font-weight: 800;">${data.qty} pcs</strong>
                                            </div>
                                            <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 4px;">
                                                <span style="font-size: 0.85rem; color: #475569;">Total:</span>
                                                <strong style="font-size: 1.1rem; color: #10b981; font-weight: 800;">₱${data.rev.toFixed(2)}</strong>
                                            </div>
                                        </div>
                                    `).join('') : `
                                        <div style="color: #94a3b8; font-size: 0.9rem; font-style: italic; padding: 5px 0;">
                                            No copies of this product were sold during this period.
                                        </div>
                                    `}
                                </div>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>`;
    }).join('') || '<div style="text-align:center; padding:30px; color:#94a3b8;">No results matched search fields.</div>';
}



// --- 5. OVERVIEW & REMAINING CORE UI ROUTINES ---
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
                    ${items.map(i => `
                        <div class="item-detail-row">
                            <span style="font-weight: 600; color: #334155;">${i.name}</span>
                            <span style="font-weight: 700; color: #475569; font-size: 0.8rem; background: #ffffff; padding: 2px 8px; border-radius: 4px; border: 1px solid #e2e8f0;">qty: ${i.qty}</span>
                        </div>
                    `).join('')}
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

async function toggleFav(id) {
    try {
        // 1. Get the current product state from cache
        const p = cachedProductsList.find(prod => prod.prod_id === id);
        if (!p) return;

        // 2. Prepare data, EXPLICITLY ensuring the category is preserved
        const updatedData = { 
            barcode: p.barcode_number, // Ensure barcode is included
            name: p.prod_name, 
            category: p.prod_category || 'UNCATEGORIZED', // Preserve existing category
            orig_price: p.orig_price, 
            price_capital: p.price_capital, 
            stock: p.stock_Qty, 
            expiry: p.expiry_Date, 
            img: p.img_Url, 
            fav: p.Favorite === 1 ? 0 : 1 // Toggle favorite
        };

        // 3. Send update
        await fetch(`http://localhost:3000/api/update-product/${id}`, { 
            method: 'PUT', 
            headers: {'Content-Type': 'application/json'}, 
            body: JSON.stringify(updatedData) 
        });

        // 4. Refresh the UI specifically
        await refreshProductsUI();
        if (globalActiveCategoryName) {
            openCategorySubSection(globalActiveCategoryName); 
        }
    } catch (e) {
        console.error("Toggle Favorite Failed:", e);
    }
}

// --- NEW WORKER: SUBMIT NEW CUSTOMER CREDIT FOLDER ---
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

// --- NEW WORKER: SUBMIT CREDIT TRANSACTION NOTE TO LEDGER ---
document.getElementById('utangForm')?.addEventListener('submit', async (e) => {
    e.preventDefault(); // Prevents browser reload bugs

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

    const utangPayload = {
        customer_name: activeFolderCustomerName,
        items_list: JSON.stringify(selectedUtangItems),
        amount: totalAmount,
        profit: totalProfit
    };

    try {
        const res = await fetch('http://localhost:3000/api/save-utang', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
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
            alert("System Error: " + (result.error || "Unable to save transaction record."));
        }
    } catch (error) {
        console.error("Credit transaction failed:", error);
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
    
    // Periodically update staff online statuses in the background
    setInterval(() => {
        if (typeof renderUserList === 'function') renderUserList();
    }, 10000);

    console.log("Window loaded, initializing...");
    
  
    
    const statsInput = document.getElementById('statsMasterDate');
    if (statsInput) {
        statsInput.valueAsDate = new Date();
        setTimeout(() => setStatPeriod('day'), 300);
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
    if (!query || query.trim() === "") { dropdown.style.display = 'none'; return; }
    try {
        const res = await fetch('http://localhost:3000/api/products');
        const products = await res.json();
        const filtered = products.filter(p => p.prod_name && p.prod_name.toLowerCase().includes(query.toLowerCase()));
        if (filtered.length > 0) {
            dropdown.innerHTML = filtered.map(p => {
                const price = p.orig_price + p.price_capital;
                return `<div class="search-item" onclick='addProdToUtang(${JSON.stringify({id: p.prod_id, name: p.prod_name, price, cost: p.orig_price})})'><span>${p.prod_name}</span><strong>₱${price.toFixed(2)}</strong></div>`;
            }).join('');
            dropdown.style.display = 'block';
        } else { dropdown.style.display = 'none'; }
    } catch(e){}
}
function addProdToUtang(p) {
    const existing = selectedUtangItems.find(item => item.id === p.id);
    if (existing) { existing.qty++; } else { selectedUtangItems.push({...p, qty: 1}); }
    document.getElementById('itemSearch').value = '';
    document.getElementById('searchResults').style.display = 'none';
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
function viewCustomerDetails(id, n) { activeFolderCustomerName = n; document.getElementById('customerFolderList').style.display = 'none'; document.getElementById('currentFolderName').innerText = `Folder: ${n}`; document.getElementById('specificCustomerView').style.display = 'block'; renderSpecificLedger(n); }
function backToFolders() { activeFolderCustomerName = ""; document.getElementById('specificCustomerView').style.display = 'none'; document.getElementById('customerFolderList').style.display = 'grid'; renderCustomerFolders(); }
function switchFolderTab(t) { 
    // 1. Set the active tab state ('ACTIVE' or 'ARCHIVED')
    currentFolderViewTab = t; 
    
    // 2. Clear out any deep folder view context so it doesn't get stuck open
    activeFolderCustomerName = "";
    
    // 3. Reset the visibility panels so it shows the card grid layout instead of an empty table sheet
    const specificView = document.getElementById('specificCustomerView');
    if (specificView) specificView.style.display = 'none';
    
    const gridContainer = document.getElementById('customerFolderList');
    if (gridContainer) gridContainer.style.display = 'grid';

    // 4. Safely re-render the appropriate folders group database pool natively
    renderCustomerFolders(); 
}

async function submitLedgerPayment() {
    const paymentBox = document.getElementById('ledgerPaymentInput');
    const cashValue = parseFloat(paymentBox.value);
    if (isNaN(cashValue) || cashValue <= 0) return alert("Specify a validnumeric value.");
    try {
        const res = await fetch('http://localhost:3000/api/post-ledger-payment', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customer_name: activeFolderCustomerName, payment_amount: cashValue }) });
        if (res.ok) { paymentBox.value = ""; renderSpecificLedger(activeFolderCustomerName); }
    } catch(e){}
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

async function renderCustomerFolders() {
    const container = document.getElementById('customerFolderList');
    if (!container) return;

    try {
        // Fallback state initialization if tracking flag isn't set yet
        if (typeof currentFolderViewTab === 'undefined') {
            window.currentFolderViewTab = 'ACTIVE';
        }

        const endpoint = currentFolderViewTab === 'ACTIVE' ? '/api/get-customers' : '/api/get-archived-customers';
        const res = await fetch(`http://localhost:3000${endpoint}`); 
        const customers = await res.json();

        if (!customers || customers.length === 0) {
            container.innerHTML = `<p style="color: #94a3b8; padding: 40px; grid-column: 1/-1; text-align: center; font-weight: 500;"><i class="fa-solid fa-folder-open" style="display:block; font-size:2rem; margin-bottom:10px;"></i> No folders found in this category.</p>`;
            return;
        }

        container.innerHTML = customers.map(c => {
            const isArchived = currentFolderViewTab === 'ARCHIVED';
            
            // Matte layout configuration profiles mapping to status rulesets
            const folderBackground = isArchived 
                ? 'background: linear-gradient(135deg, #64748b, #475569); box-shadow: 0 15px 35px rgba(100, 116, 139, 0.15);' 
                : 'background: linear-gradient(135deg, #2c274d, #111021);';
                
            const tabBackground = isArchived ? 'background: #475569;' : 'background: #17123f;';

            return `
            <div class="customer-folder-card" style="${folderBackground}" onclick="viewCustomerDetails(${c.customer_id}, '${c.fullname}')">
                <!-- Folder Tab -->
                <div class="customer-folder-tab-lip" style="content: ''; position: absolute; top: -15px; left: 0; width: 80px; height: 30px; ${tabBackground} border-radius: 10px 10px 0 0; z-index: -1;"></div>
                
                <div class="folder-paper">
                    <span class="folder-label-name">${c.fullname}</span>
                    <div class="paper-lines"></div>
                </div>
                
                <div class="folder-content">
                    <div class="folder-details">
                        <span><i class="fa-solid fa-phone"></i> ${c.contact_number || 'N/A'}</span>
                        <span><i class="fa-solid fa-location-dot"></i> ${c.address || 'N/A'}</span>
                    </div>
                    
                    ${isArchived ? `
                        <button onclick="restoreArchivedFolder(event, ${c.customer_id})" class="pay-btn" 
                                style="position: absolute; bottom: 15px; right: 15px; background: #10b981; border: none; padding: 6px 12px; border-radius: 6px; font-size: 0.75rem; font-weight: bold; color: white; cursor: pointer; z-index: 50;">
                            🔄 Restore
                        </button>
                    ` : `
                        <div class="folder-arrow">
                            <i class="fa-solid fa-circle-chevron-right"></i>
                        </div>
                    `}
                </div>
            </div>`;
        }).join('');
    } catch (err) { 
        console.error("Failed to render folders:", err); 
    }
}

// --- CREDIT LEDGER: ITEM TRANSACTION LIST table ---
async function renderSpecificLedger(customerName) {
    const tableBody = document.getElementById('specificUtangTableBody');
    if (!tableBody) return;

    try {
        const res = await fetch(`http://localhost:3000/api/utang-list-by-name?name=${customerName}`);
        const transactionList = await res.json();

        let totalOutstandingDebt = 0;
        let totalAmountBorrowed = 0;
        let totalProfitBorrowed = 0;

        if (!transactionList || transactionList.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="3" style="padding: 20px; text-align: center; color: #94a3b8;">No entries.</td></tr>';
            document.getElementById('customerDebtTotal').innerText = "₱0.00";
            return;
        }

        // --- STEP 1: CHRONOLOGICAL RUNNING BALANCES POOL FOR STYLING OVERRIDES ---
        let debts = transactionList.filter(tx => !tx.items_list.includes("Debt Payment")).reverse();
        let payments = transactionList.filter(tx => tx.items_list.includes("Debt Payment")).reverse();
        let totalPastPayments = payments.reduce((sum, p) => sum + parseFloat(p.amount), 0);

        // Pre-calculate which historical debt rows have already been cleared by cash pools
        debts.forEach(debt => {
            let amt = parseFloat(debt.amount);
            if (totalPastPayments >= amt) {
                totalPastPayments -= amt;
                debt.isRowFullyPaid = true; // Flag row as settled
            } else {
                totalPastPayments = 0;
                debt.isRowFullyPaid = false;
            }
        });

        // Re-align array map indices back to standard newest-to-oldest layout tracking flow
        debts.reverse();

        // --- STEP 2: RENDER LIVE BROWSING ROW ITEMS MATRIX ---
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

            // Find matching item record inside reference list to extract computed settlement state flags
            const matchingDebtObj = !isPayment ? debts.find(d => d.utang_id === tx.utang_id) : null;
            const isRowSettled = matchingDebtObj ? matchingDebtObj.isRowFullyPaid : false;

            // Apply fading style treatment to fully settled debt rows to prevent visual clutter
            let rowStyle = isRowSettled ? 'opacity: 0.45; filter: grayscale(0.5); background-color: #f8fafc;' : '';
            let descriptionText = "";
            let amountStyle = "";
            
            if (isPayment) {
                descriptionText = `<span style="background: #d1fae5; color: #065f46; padding: 4px 8px; border-radius: 6px; font-size: 0.8rem; font-weight: bold; margin-right: 8px;">🟢 PAYMENT RECEIVED</span> Cash collection payment`;
                amountStyle = "color: #10b981; font-weight: 800; font-size:1.05rem;";
            } else {
                try {
                    const parsedItems = JSON.parse(tx.items_list);
                    descriptionText = parsedItems.map(i => `${i.name} <span style="color: #94a3b8; font-size: 0.85rem;">x${i.qty}</span>`).join(', ');
                } catch(e) { 
                    descriptionText = tx.items_list; 
                }
                
                if (isRowSettled) {
                    descriptionText = `<del style="color: #64748b;">${descriptionText} [FULLY PAID]</del>`;
                    amountStyle = "color: #64748b; text-decoration: line-through;";
                } else {
                    amountStyle = "color: #e11d48; font-weight: 700;";
                }
            }

            return `
                <tr style="border-bottom: 1px solid #f1f5f9; ${rowStyle}">
                    <td style="padding: 15px; color: #64748b; font-size: 0.9rem;">${new Date(tx.date_borrowed).toLocaleDateString()}</td>
                    <td style="padding: 15px; font-size: 0.95rem;">${descriptionText}</td>
                    <td style="padding: 15px; text-align: right; ${amountStyle}">${(isPayment && !isRowSettled) ? '-' : ''}₱${txAmt.toFixed(2)}</td>
                </tr>`;
        }).join('');

        // --- STEP 3: UPDATE TERMINAL PANEL WRAPPERS ---
        const totalContainer = document.getElementById('customerDebtTotal');
        if (totalContainer) {
            totalContainer.innerText = `₱${(totalOutstandingDebt > 0 ? totalOutstandingDebt : 0).toFixed(2)}`;
            totalContainer.style.color = totalOutstandingDebt > 0 ? "#ff7675" : "#10b981";
            
            const oldLabel = document.getElementById('ledgerAccruedProfitLabel');
            if (oldLabel) oldLabel.remove();
            
            let remainingProfitOwed = 0;
            if (totalAmountBorrowed > 0 && totalOutstandingDebt > 0) {
                const globalProfitMargin = totalProfitBorrowed / totalAmountBorrowed;
                remainingProfitOwed = totalOutstandingDebt * globalProfitMargin;
            }

            if (totalOutstandingDebt > 0) {
                totalContainer.insertAdjacentHTML('afterend', `
                    <div id="ledgerAccruedProfitLabel" style="margin-top: -5px; margin-bottom: 15px; font-size: 0.85rem; color: #64748b; font-weight: 600;">
                        Remaining Store Profit: <span style="color: #10b981; font-weight: 800;">₱${remainingProfitOwed.toFixed(2)}</span>
                    </div>
                `);
            }
        }
        
        // Dynamic visibility adjustments filtering based on folder view tab context profile rulesets
        const trackingTerminal = document.getElementById('paymentInputTerminal');
        if (trackingTerminal) {
            if (typeof currentFolderViewTab !== 'undefined' && currentFolderViewTab === 'ARCHIVED') {
                // Force a clean read-only state for archived items
                trackingTerminal.innerHTML = `
                    <div style="background: #ecfdf5; border: 1px solid #a7f3d0; padding: 15px; border-radius: 12px; text-align: center; color: #065f46; font-weight: 700; font-size: 0.95rem; margin-top: 10px; width: 100%;">
                        <i class="fa-solid fa-circle-check"></i> The Debt is Fully Paid
                    </div>`;
                trackingTerminal.style.display = 'block';
            } else {
                // REBUILD: Restore the active interactive payment terminal fields if browsing an active customer tab
                trackingTerminal.innerHTML = `
                    <div style="width: 100%; display: flex; flex-direction: column; gap: 10px;">
                        <label style="font-size: 0.85rem; color: #475569; font-weight: 600;">Input Received Cash Payment:</label>
                        <div style="position: relative; display: flex; align-items: center;">
                            <span style="position: absolute; left: 12px; color: #64748b; font-weight: bold;">₱</span>
                            <input type="number" id="ledgerPaymentInput" placeholder="0.00" min="0.01" step="0.01"
                                   style="width: 100%; padding: 10px 12px 10px 28px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 0.95rem; font-weight: 600; color: #1e293b;">
                        </div>
                        <button type="button" onclick="submitLedgerPayment()" class="proceed-payment-btn"
                                style="width: 100%; background: #10b981; color: white; border: none; padding: 12px; border-radius: 8px; font-weight: 700; font-size: 0.95rem; cursor: pointer; transition: background 0.2s;">
                            Proceed Payment
                        </button>
                    </div>`;
                
                // Show or hide the terminal wrapper based on whether there is actually money left to collect
                trackingTerminal.style.display = totalOutstandingDebt <= 0 ? 'none' : 'flex';
            }
        }
const specificViewPanel = document.getElementById('specificCustomerView');
        if (specificViewPanel) {
            const addUtangBtn = Array.from(specificViewPanel.getElementsByTagName('button'))
                .find(btn => btn.innerText.includes('Add Item on Credit'));

            if (addUtangBtn) {
                if (typeof currentFolderViewTab !== 'undefined' && currentFolderViewTab === 'ARCHIVED') {
                    addUtangBtn.style.display = 'none';
                } else {
                    addUtangBtn.style.display = 'block';
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
            
            // Safe JSON stringification to prevent quote breaking in onclick
            const safeUserJSON = JSON.stringify(u).replace(/'/g, "&#39;");
            
            return `
            <div class="employee-card" style="background-color: ${bgColor} !important; border: 1px solid ${isInactive ? '#fca5a5' : '#cbd5e1'}; position: relative; opacity: ${isInactive ? 0.75 : 1}; padding: 20px; border-radius: 12px; display: flex; flex-direction: column; align-items: center; text-align: center;">
                <!-- Status Badge -->
                <span class="status-badge" style="position: absolute; top: 12px; right: 12px; font-size: 0.75rem; font-weight: 800; padding: 4px 10px; border-radius: 6px; text-transform: uppercase; background: ${isInactive ? '#fee2e2' : '#dcfce7'}; color: ${isInactive ? '#ef4444' : '#15803d'}; border: 1px solid ${isInactive ? '#fecaca' : '#bbf7d0'};">
                    ${isInactive ? 'Inactive' : 'Active'}
                </span>

                <div style="width:60px; height:60px; border-radius:50%; background:white; display:flex; align-items:center; justify-content:center; margin-bottom:10px; box-shadow: 0 2px 4px rgba(0,0,0,0.03);">
                    <i class="fa-solid fa-user" style="font-size: 25px; color: ${isInactive ? '#94a3b8' : '#64748b'};"></i>
                </div>
                <h4 style="margin: 5px 0 2px 0; font-weight: 700; color: #1e293b; display: flex; align-items: center; gap: 8px;">
                    <span style="width: 10px; height: 10px; border-radius: 50%; display: inline-block; background: ${isOnline ? '#10b981' : '#94a3b8'}; box-shadow: ${isOnline ? '0 0 8px #10b981' : 'none'};" title="${isOnline ? 'Online' : 'Offline'}"></span>
                    ${u.first_name} ${u.last_name}
                </h4>
                <p style="color: #64748b; font-size: 0.85rem; margin-bottom: 15px; font-weight: 500;">${u.role}</p>
                
                <div style="display: flex; gap: 6px; width: 100%; justify-content: center; flex-wrap: wrap;">
                    <button onclick='openEditModal(${safeUserJSON})' class="cancel-btn" style="background:white; border: 1px solid #cbd5e1; padding: 6px 10px; border-radius: 8px; cursor: pointer; transition: 0.2s;" title="Edit Details">
                        <i class="fa-solid fa-pen" style="color: #64748b;"></i>
                    </button>
                    <button onclick="openActivityLogsModal('${u.email}')" class="cancel-btn" style="background:white; border: 1px solid #cbd5e1; padding: 6px 10px; border-radius: 8px; cursor: pointer; transition: 0.2s;" title="View Activity Logs">
                        <i class="fa-solid fa-clock-rotate-left" style="color: #4f46e5;"></i>
                    </button>
                    <button onclick="deactivateUser(${u.id}, '${u.account_state}')" class="cancel-btn" style="background: ${isInactive ? '#10b981' : '#ef4444'}; color: white; border: none; padding: 6px 10px; border-radius: 8px; font-weight: 600; cursor: pointer; transition: 0.2s; font-size: 0.8rem;">
                        ${isInactive ? 'Reactivate' : 'Deactivate'}
                    </button>
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
    if (!email.trim() || !fname.trim() || !lname.trim() || !contact.trim() || !address.trim()) {
        alert("All fields except Middle Initial are required!");
        return false;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email.trim())) {
        alert("Please enter a valid email address!");
        return false;
    }

    if (!email.trim().toLowerCase().endsWith("@weljo.com")) {
        alert("Staff accounts must use the official corporate email domain (@weljo.com)!");
        return false;
    }

    const nameRegex = /^[A-Za-z\s\-]+$/;
    if (!nameRegex.test(fname.trim())) {
        alert("First Name must contain only letters, spaces, or hyphens!");
        return false;
    }
    if (!nameRegex.test(lname.trim())) {
        alert("Last Name must contain only letters, spaces, or hyphens!");
        return false;
    }

    if (mi.trim()) {
        const miRegex = /^[A-Za-z]{1,2}$/;
        if (!miRegex.test(mi.trim())) {
            alert("Middle Initial must contain only 1 or 2 letters!");
            return false;
        }
    }

    const contactRegex = /^[0-9]{10,12}$/;
    if (!contactRegex.test(contact.trim())) {
        alert("Contact number must be numeric (10 to 12 digits)!");
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

    if (!validateUserInputs(email, fname, mi, lname, contact, address)) return;

    const userData = { email, fname, mi, lname, contact, address, role };

    const res = await fetch(`http://localhost:3000/api/update-user/${id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify(userData)
    });
    
    if (res.ok) {
        alert("User details updated successfully!");
        closeModalByName('editUserModal');
        renderUserList();
    } else {
        const data = await res.json();
        alert("Failed to update user: " + (data.error || "Server error"));
    }
});

async function deactivateUser(id, currentStatus) {
    const isInactive = currentStatus === 'INACTIVE' || currentStatus === 'BANNED';
    const newStatus = isInactive ? 'ACTIVE' : 'INACTIVE';
    
    if (!isInactive) {
        if (!confirm("Are you sure you want to deactivate this staff account? They will lose login access, but all their transaction history logs will remain safely intact.")) {
            return;
        }
    }
    
    await fetch(`http://localhost:3000/api/update-user-status/${id}`, {
        method: 'PUT',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ status: newStatus })
    });
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

    if (pass !== confirmPass) return alert("Passwords do not match!");

    // Password strength check (at least 8 characters, containing both letters and numbers)
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
    if (!passwordRegex.test(pass)) {
        return alert("Password must be at least 8 characters long and contain both letters and numbers!");
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
            const formattedTime = new Date(l.timestamp).toLocaleString();
            
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
