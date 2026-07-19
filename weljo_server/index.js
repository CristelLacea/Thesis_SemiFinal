process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config();
const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cors());
app.use(bodyParser.json());

// Allow any origin to talk to your server
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

// Supabase PostgreSQL Connection Pool
const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: {
        rejectUnauthorized: false
    }
});

// Use 'pool' directly as your 'db'
const db = pool;

// --- HELPER: GET LOCAL TIMESTAMP ---
const getLocalTimestamp = () => {
    const now = new Date();
    return now.getFullYear() + '-' + 
           String(now.getMonth() + 1).padStart(2, '0') + '-' + 
           String(now.getDate()).padStart(2, '0') + ' ' + 
           String(now.getHours()).padStart(2, '0') + ':' + 
           String(now.getMinutes()).padStart(2, '0') + ':' + 
           String(now.getSeconds()).padStart(2, '0');
};

// Middleware to retrieve user email from request headers
app.use((req, res, next) => {
    req.userEmail = req.headers['x-user-email'] || 'system@weljo.com';
    next();
});

const logActivity = (email, action, details) => {
    const timestamp = getLocalTimestamp();
    const sql = `INSERT INTO activity_logs (user_email, action, details, timestamp) VALUES ($1, $2, $3, $4)`;
    db.query(sql, [email, action, details, timestamp], (err) => {
        if (err) console.error("Activity log error:", err.message);
    });
};

// --- 1. PRODUCT ROUTES ---

app.get('/api/products', (req, res) => {
    db.query('SELECT prod_id, barcode_number, prod_name, prod_category, orig_price, price_capital, stock_qty AS "stock_Qty", expiry_date AS "expiry_Date", img_url AS "img_Url", favorite AS "Favorite", is_archived FROM products', (err, results) => {
        if (err) return res.status(500).send(err);
        res.json(results ? results.rows : []);
    });
});

app.post('/api/add-product', (req, res) => {
    const { barcode, name, category, orig_price, price_capital, stock, expiry, img, fav } = req.body;
    const sql = `INSERT INTO products 
                (barcode_number, prod_name, prod_category, orig_price, price_capital, stock_Qty, expiry_Date, img_Url, Favorite) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING prod_id`;
    db.query(sql, [barcode, name, category, orig_price, price_capital, stock, expiry, img, fav], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        logActivity(req.userEmail, "Add Product", `Added product: ${name} (Category: ${category})`);
        res.json({ message: "Product added successfully! 🍦", id: result.rows[0].prod_id });
    });
});

app.put('/api/update-product/:id', (req, res) => {
    const prodId = req.params.id;
    const { barcode, name, category, orig_price, price_capital, stock, expiry, img, fav } = req.body;
    const sqlUpdate = `UPDATE products SET barcode_number=$1, prod_name=$2, prod_category=$3, orig_price=$4, price_capital=$5, stock_Qty=$6, expiry_Date=$7, img_Url=$8, Favorite=$9 WHERE prod_id=$10`;
    
    db.query(sqlUpdate, [barcode, name, category, orig_price, price_capital, stock, expiry, img, fav, prodId], (upErr) => {
        if (upErr) return res.status(500).send(upErr);
        logActivity(req.userEmail, "Update Product", `Updated product ID ${prodId}: ${name}`);
        res.json({ message: "Update Successful! ✅" });
    });
});

app.delete('/api/delete-product/:id', (req, res) => {
    db.query("DELETE FROM products WHERE prod_id = $1", [req.params.id], (err) => {
        if (err) return res.status(500).send(err);
        res.json({ message: "Deleted!" });
    });
});

// --- 2. SALES & HISTORY ROUTES ---

app.get('/api/sales', (req, res) => {
    db.query("SELECT * FROM sales_table ORDER BY sale_id DESC", (err, results) => {
        if (err) return res.status(500).send(err);
        res.json(results ? results.rows : []);
    });
});

app.post('/api/save-sale', (req, res) => {
    const { total_amount, total_profit, items_json } = req.body;
    const sale_date = getLocalTimestamp();
    const sql = `INSERT INTO sales_table (sale_date, total_amount, total_profit, items_json) VALUES ($1, $2, $3, $4) RETURNING sale_id`;
    db.query(sql, [sale_date, total_amount, total_profit, items_json], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        logActivity(req.userEmail, "Process Sale", `Processed sale of amount ₱${total_amount}`);
        res.json({ message: "Sale recorded! 💰", id: result.rows[0].sale_id });
    });
});

app.post('/api/add-price-log', (req, res) => {
    const { prod_id, prod_name, old_price, new_price } = req.body;
    const change_date = getLocalTimestamp(); // Dynamically generates execution timestamp
    
    const sql = `INSERT INTO price_history (prod_id, old_price, new_price, change_date) VALUES ($1, $2, $3, $4) RETURNING log_id`;
    
    db.query(sql, [prod_id, old_price, new_price, change_date], (err, result) => {
        if (err) {
            console.error("Failed to write to price_history table:", err);
            return res.status(500).json({ error: err.message });
        }
        res.json({ message: "Price log documented successfully!", log_id: result.rows[0].log_id });
    });
});

app.get('/api/price-logs', (req, res) => {
    const sql = `SELECT ph.*, p.prod_name FROM price_history ph JOIN products p ON ph.prod_id = p.prod_id ORDER BY ph.change_date DESC`;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results ? results.rows : []);
    });
});

app.post('/api/create-folder', (req, res) => {
    const { fullname, contact, address } = req.body;
    const sql = "INSERT INTO utang_customers (fullname, contact_number, address, folder_status) VALUES ($1, $2, $3, 'ACTIVE') RETURNING customer_id";
    db.query(sql, [fullname, contact, address], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        logActivity(req.userEmail, "Create Debt Folder", `Created ledger folder for customer: ${fullname}`);
        res.json({ status: "success", id: result.rows[0].customer_id });
    });
});

// Fetch only active folders carrying active debt weight
app.get('/api/get-customers', (req, res) => {
    db.query("SELECT * FROM utang_customers WHERE folder_status = 'ACTIVE' ORDER BY fullname ASC", (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results ? results.rows : []);
    });
});

// Fetch hidden folders that have successfully been settled out
app.get('/api/get-archived-customers', (req, res) => {
    db.query("SELECT * FROM utang_customers WHERE folder_status = 'ARCHIVED' ORDER BY fullname ASC", (err, results) => {
        if (err) return res.status(500).json(err);
        res.json(results ? results.rows : []);
    });
});

// Explicit endpoint to toggle status back to active if restoration is requested
app.put('/api/restore-customer-folder/:id', (req, res) => {
    const customerId = req.params.id;
    db.query("UPDATE utang_customers SET folder_status = 'ACTIVE' WHERE customer_id = $1", [customerId], (err) => {
        if (err) return res.status(500).json(err);
        logActivity(req.userEmail, "Restore Debt Folder", `Restored ledger folder for customer ID ${customerId}`);
        res.json({ message: "Folder restored successfully!" });
    });
});

app.get('/api/utang-list-by-name', (req, res) => {
    const name = req.query.name;
    // Selects both raw purchases (Unpaid) and partial payments to compute active tracking balance
    db.query("SELECT * FROM utang_table WHERE customer_name = $1 ORDER BY date_borrowed DESC, utang_id DESC", [name], (err, results) => {
        if (err) return res.status(500).send(err);
        res.json(results ? results.rows : []);
    });
});

app.post('/api/save-utang', (req, res) => {
    const { customer_name, items_list, amount, profit } = req.body;
    const date_borrowed = getLocalTimestamp().split(' ')[0]; 
    const sql = `INSERT INTO utang_table (customer_name, items_list, amount, profit, date_borrowed, status) VALUES ($1, $2, $3, $4, $5, 'Unpaid')`;
    db.query(sql, [customer_name, items_list, amount, profit, date_borrowed], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        logActivity(req.userEmail, "Record Debt (Utang)", `Recorded new debt for customer ${customer_name}: ₱${amount}`);
        res.json({ message: "Note saved to Ledger! 📝" });
    });
});

// --- ACCOUNT BALANCING PAYMENT ENGINE ---
app.post('/api/post-ledger-payment', (req, res) => {
    const { customer_name, payment_amount } = req.body;
    const nowTimestamp = getLocalTimestamp();
    const dateOnly = nowTimestamp.split(' ')[0];

    let cashRemaining = parseFloat(payment_amount);
    if (isNaN(cashRemaining) || cashRemaining <= 0) return res.status(400).json({ error: "Invalid payment value" });

    // 1. Fetch all ledger records for this customer sorted from oldest to newest
    db.query("SELECT * FROM utang_table WHERE customer_name = $1 ORDER BY date_borrowed ASC, utang_id ASC", [customer_name], (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        
        const rows = results ? results.rows : [];
        let profitRealizedThisPayment = 0;

        // Separate past records into dynamic pools
        let debts = rows.filter(r => !r.items_list.includes("Debt Payment"));
        let pastPayments = rows.filter(r => r.items_list.includes("Debt Payment"));

        // Calculate how much cash has already been paid historically down the line
        let totalPastPaymentsAmount = pastPayments.reduce((sum, p) => sum + parseFloat(p.amount), 0);

        // Burn through old debts using past payment history to find where we currently stand
        debts.forEach(debt => {
            let debtAmount = parseFloat(debt.amount);
            if (totalPastPaymentsAmount >= debtAmount) {
                totalPastPaymentsAmount -= debtAmount;
                debt.remainingUnpaid = 0;
            } else {
                debt.remainingUnpaid = debtAmount - totalPastPaymentsAmount;
                totalPastPaymentsAmount = 0;
            }
        });

        // --- ARRAY TO BUNDLE THE ACTUAL PRODUCTS BEING PAID OFF ---
        let paidItemsArray = [];

        // 2. Apply the NEW payment cash to the oldest remaining unpaid items
        for (let debt of debts) {
            if (cashRemaining <= 0) break;
            if (debt.remainingUnpaid <= 0) continue;

            let totalDebtPrice = parseFloat(debt.amount);
            let totalDebtProfit = parseFloat(debt.profit) || 0;
            let itemProfitMargin = totalDebtPrice > 0 ? (totalDebtProfit / totalDebtPrice) : 0;

            // TRACKING CONTEXT: Did this specific payment handle or clear the debt item?
            let amountCoveredThisTime = 0;

            if (cashRemaining >= debt.remainingUnpaid) {
                // This specific item group is now FULLY paid off!
                amountCoveredThisTime = debt.remainingUnpaid;
                profitRealizedThisPayment += (debt.remainingUnpaid * itemProfitMargin);
                cashRemaining -= debt.remainingUnpaid;
            } else {
                // This item group is PARTIALLY paid off
                amountCoveredThisTime = cashRemaining;
                profitRealizedThisPayment += (cashRemaining * itemProfitMargin);
                cashRemaining = 0;
            }

            // --- EXTRACT REAL ITEM NAMES AND APPEND ISCOLLECTION FLAG ---
            if (amountCoveredThisTime > 0) {
                try {
                    const parsedItems = JSON.parse(debt.items_list);
                    
                    // Proportional scale factor for counting partial quantities
                    const executionRatio = amountCoveredThisTime / totalDebtPrice;

                    parsedItems.forEach(item => {
                        let processedQty = Math.round(item.qty * executionRatio);
                        if (processedQty === 0 && executionRatio > 0) processedQty = 1; // Fallback guarantee

                        paidItemsArray.push({
                            name: item.name,
                            qty: processedQty,
                            price: item.price,
                            cost: item.cost,
                            isCollection: true // 💡 Hidden explicit identifier tag
                        });
                    });
                } catch (e) {
                    // Fallback structural compatibility filter for legacy plain-text rows
                    paidItemsArray.push({ name: debt.items_list, qty: 1, isCollection: true });
                }
            }
        }

        // Fallback safety filter to keep database entries secure if no items were mapped
        if (paidItemsArray.length === 0) {
            paidItemsArray.push({ name: "Debt Payment", qty: 1, isCollection: true });
        }

        const finalItemsJson = JSON.stringify(paidItemsArray);
        const paymentItemsJson = JSON.stringify([{ name: `Debt Payment`, qty: 1 }]);

        // 3. Save the payment entry into the ledger history
        const insertPaymentSql = `INSERT INTO utang_table (customer_name, items_list, amount, profit, date_borrowed, status) VALUES ($1, $2, $3, $4, $5, 'Paid')`;
        
        db.query(insertPaymentSql, [customer_name, paymentItemsJson, parseFloat(payment_amount), parseFloat(profitRealizedThisPayment.toFixed(2)), dateOnly], (insErr) => {
            if (insErr) return res.status(500).json({ error: insErr.message });

            // 4. Record the cash AND the true itemized list into today's sales statistics!
            const salesSql = `INSERT INTO sales_table (sale_date, total_amount, total_profit, items_json) VALUES ($1, $2, $3, $4)`;
            db.query(salesSql, [nowTimestamp, parseFloat(payment_amount), parseFloat(profitRealizedThisPayment.toFixed(2)), finalItemsJson], (salesErr) => {
                if (salesErr) return res.status(500).json({ error: salesErr.message });

                // 5. Update folder archive status if full settlement is completed
                db.query("SELECT * FROM utang_table WHERE customer_name = $1", [customer_name], (calcErr, freshResults) => {
                    if (calcErr) return res.status(500).json({ error: calcErr.message });
                    
                    const freshRows = freshResults ? freshResults.rows : [];
                    let netBalance = 0;
                    freshRows.forEach(r => {
                        if (r.items_list.includes("Debt Payment")) netBalance -= parseFloat(r.amount);
                        else netBalance += parseFloat(r.amount);
                    });

                    if (netBalance <= 0) {
                        db.query("UPDATE utang_customers SET folder_status = 'ARCHIVED' WHERE fullname = $1", [customer_name], () => {
                            logActivity(req.userEmail, "Record Debt Payment", `Recorded ledger payment for customer ${customer_name}: ₱${payment_amount} (Fully Settled)`);
                            res.json({ message: "Fully settled!", balance: 0, profitRealized: parseFloat(profitRealizedThisPayment.toFixed(2)) });
                        });
                    } else {
                        logActivity(req.userEmail, "Record Debt Payment", `Recorded ledger payment for customer ${customer_name}: ₱${payment_amount} (Partial Payment)`);
                        res.json({ message: "Payment tracked successfully.", balance: netBalance, profitRealized: parseFloat(profitRealizedThisPayment.toFixed(2)) });
                    }
                });
            });
        });
    });
});

// --- 4. AUTHENTICATION & AUDIT LOGS ---

app.post('/api/login', (req, res) => {
    const { email, password } = req.body;
    const sql = "SELECT * FROM users WHERE email = $1 AND password = $2";
    
    db.query(sql, [email, password], (err, results) => {
        if (err) return res.status(500).json({ status: "error", message: "Database error" });
        
        const rows = results ? results.rows : [];
        if (rows.length > 0) {
            const user = rows[0];
            
            // 1. Check if the user is banned or deactivated
            if (user.account_state && (user.account_state.toUpperCase() === 'BANNED' || user.account_state.toUpperCase() === 'INACTIVE')) {
                return res.json({ status: "fail", message: "Account is deactivated." });
            }

            // 2. Set user as online
            db.query("UPDATE users SET is_online = TRUE, last_active = $1 WHERE email = $2", [new Date(), user.email], (updateErr) => {
                if (updateErr) console.error("Login status update error:", updateErr.message);
                
                logActivity(user.email, "Login", "User logged in successfully");

                res.json({
                    status: "success",
                    role: user.role,
                    email: user.email
                });
            });

        } else {
            // User not found or incorrect password
            res.json({ status: "fail", message: "Invalid Email or Password" });
        }
    });
});

// --- ARCHIVE PRODUCT ---
app.put('/api/archive-product/:id', (req, res) => {
    const sql = "UPDATE products SET is_archived = 1 WHERE prod_id = $1";
    db.query(sql, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        logActivity(req.userEmail, "Archive Product", `Archived product ID ${req.params.id}`);
        res.json({ message: "Product archived successfully! 📦" });
    });
});

// --- RESTORE PRODUCT ---
app.put('/api/restore-product/:id', (req, res) => {
    const sql = "UPDATE products SET is_archived = 0 WHERE prod_id = $1";
    db.query(sql, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        logActivity(req.userEmail, "Restore Product", `Restored product ID ${req.params.id}`);
        res.json({ message: "Product restored to inventory! ✅" });
    });
});

app.get('/api/users', (req, res) => {
    // Automatically mark users as offline if they haven't sent a heartbeat in the last 45 seconds
    const offlineThreshold = new Date(Date.now() - 45000);
    const offlineSql = `UPDATE users SET is_online = FALSE WHERE is_online = TRUE AND last_active < $1`;
    
    db.query(offlineSql, [offlineThreshold], (offlineErr) => {
        if (offlineErr) console.error("Error setting idle users offline:", offlineErr.message);
        
        db.query("SELECT id, email, first_name, middle_initial, last_name, contact_number, address, role, account_state, is_online, last_active FROM users ORDER BY id ASC", (err, results) => {
            if (err) return res.status(500).send(err);
            res.json(results ? results.rows : []);
        });
    });
});

app.post('/api/add-user', (req, res) => {
    const { email, fname, mi, lname, contact, address, password, role } = req.body;
    
    const sql = `INSERT INTO users 
                (email, first_name, middle_initial, last_name, contact_number, address, password, role, account_state) 
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE')`;
    
    db.query(sql, [email, fname, mi, lname, contact, address, password, role], (err, result) => {
        if (err) {
            console.error("Database Error:", err);
            return res.status(500).json({ error: err.message });
        }
        logActivity(req.userEmail, "Create Staff", `Created new staff account: ${email} (${role})`);
        res.json({ message: "User created successfully! ✅" });
    });
});

app.put('/api/update-user-status/:id', (req, res) => {
    const { status } = req.body; 
    db.query("UPDATE users SET account_state = $1 WHERE id = $2", [status, req.params.id], (err) => {
        if (err) {
            console.error("Database Update Error:", err);
            return res.status(500).send(err);
        }
        logActivity(req.userEmail, "Update Staff Status", `Updated status of user ID ${req.params.id} to ${status}`);
        res.json({ message: "Status updated!" });
    });
});

app.put('/api/update-user/:id', (req, res) => {
    const { fname, mi, lname, contact, address, email, role } = req.body;
    const sql = `UPDATE users 
                 SET first_name=$1, middle_initial=$2, last_name=$3, contact_number=$4, address=$5, email=$6, role=$7 
                 WHERE id=$8`;
    
    db.query(sql, [fname, mi, lname, contact, address, email, role, req.params.id], (err) => {
        if (err) return res.status(500).send(err);
        logActivity(req.userEmail, "Update Staff Profile", `Updated profile details of user ID ${req.params.id}: ${email}`);
        res.json({ message: "User updated successfully!" });
    });
});

// --- NEW ONLINE STATUS & AUDIT LOG ENDPOINTS ---

app.post('/api/users/heartbeat', (req, res) => {
    const { email } = req.body;
    const userEmail = email || req.userEmail;
    
    if (userEmail && userEmail !== 'system@weljo.com') {
        db.query("UPDATE users SET is_online = TRUE, last_active = $1 WHERE email = $2", [new Date(), userEmail], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.sendStatus(200);
        });
    } else {
        res.sendStatus(400);
    }
});

app.post('/api/logout', (req, res) => {
    const { email } = req.body;
    const userEmail = email || req.userEmail;
    
    if (userEmail && userEmail !== 'system@weljo.com') {
        db.query("UPDATE users SET is_online = FALSE WHERE email = $1", [userEmail], (err) => {
            if (err) console.error("Logout status update error:", err.message);
            logActivity(userEmail, "Logout", "User logged out successfully");
            res.json({ message: "Logout recorded" });
        });
    } else {
        res.status(400).json({ error: "Invalid email" });
    }
});

app.get('/api/activity-logs', (req, res) => {
    const { email, category, date } = req.query;
    let sql = "SELECT * FROM activity_logs WHERE 1=1";
    const params = [];
    let paramIndex = 1;
    
    if (email && email.trim() !== "") {
        sql += ` AND user_email = $${paramIndex}`;
        params.push(email.trim());
        paramIndex++;
    }
    
    if (category && category.trim() !== "") {
        sql += ` AND action = $${paramIndex}`;
        params.push(category.trim());
        paramIndex++;
    }
    
    if (date && date.trim() !== "") {
        sql += ` AND DATE(timestamp) = $${paramIndex}`;
        params.push(date.trim());
        paramIndex++;
    }
    
    sql += " ORDER BY log_id DESC LIMIT 150";
    
    db.query(sql, params, (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results ? results.rows : []);
    });
});

// --- SERVER START ---
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT} 🚀`));
