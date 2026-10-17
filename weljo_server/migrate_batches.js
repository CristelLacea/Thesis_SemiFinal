process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

async function run() {
    try {
        console.log("Connecting to DB...");
        
        // 1. Create table
        const createTableSql = `
            CREATE TABLE IF NOT EXISTS product_batches (
                batch_id SERIAL PRIMARY KEY,
                prod_id INT REFERENCES products(prod_id) ON DELETE CASCADE,
                batch_qty INT NOT NULL DEFAULT 0,
                initial_qty INT NOT NULL DEFAULT 0,
                expiry_date VARCHAR(255) DEFAULT NULL,
                received_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
                supplier_note VARCHAR(255) DEFAULT ''
            );
        `;
        await pool.query(createTableSql);
        console.log("product_batches table created or already exists!");

        // 2. Backfill existing products
        const backfillSql = `
            INSERT INTO product_batches (prod_id, batch_qty, initial_qty, expiry_date, supplier_note)
            SELECT p.prod_id, p.stock_qty, p.stock_qty, p.expiry_date, 'Opening Stock (Initial Batch)'
            FROM products p
            WHERE p.stock_qty > 0 
              AND NOT EXISTS (SELECT 1 FROM product_batches pb WHERE pb.prod_id = p.prod_id);
        `;
        const backfillRes = await pool.query(backfillSql);
        console.log(`Backfilled ${backfillRes.rowCount} initial batches for existing products with stock!`);

        // 3. Check count of batches
        const countRes = await pool.query("SELECT COUNT(*) AS count FROM product_batches");
        console.log("Total rows in product_batches:", countRes.rows[0].count);

        // 4. Sample a few rows
        const sampleRes = await pool.query(`
            SELECT pb.batch_id, pb.prod_id, p.prod_name, pb.batch_qty, pb.expiry_date, pb.supplier_note
            FROM product_batches pb
            JOIN products p ON pb.prod_id = p.prod_id
            LIMIT 5
        `);
        console.log("Sample batches:", sampleRes.rows);

    } catch (e) {
        console.error("DB Migration Error:", e);
    } finally {
        await pool.end();
    }
}

run();
