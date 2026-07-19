process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
});

const schema = `
-- 1. Create PRODUCTS table
CREATE TABLE IF NOT EXISTS products (
    prod_id SERIAL PRIMARY KEY,
    barcode_number VARCHAR(255) DEFAULT '',
    prod_name VARCHAR(200) NOT NULL,
    prod_category VARCHAR(50) DEFAULT '',
    orig_price DOUBLE PRECISION NOT NULL,
    price_capital DOUBLE PRECISION NOT NULL,
    stock_Qty INT NOT NULL DEFAULT 0,
    expiry_Date VARCHAR(255) DEFAULT NULL,
    img_Url VARCHAR(255) DEFAULT NULL,
    Favorite SMALLINT NOT NULL DEFAULT 0,
    is_archived SMALLINT NOT NULL DEFAULT 0
);

-- 2. Create PRICE_HISTORY table
CREATE TABLE IF NOT EXISTS price_history (
    log_id SERIAL PRIMARY KEY,
    prod_id INT REFERENCES products(prod_id) ON DELETE CASCADE,
    old_price DECIMAL(10,2) NOT NULL,
    new_price DECIMAL(10,2) NOT NULL,
    change_date TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 3. Create SALES_TABLE table
CREATE TABLE IF NOT EXISTS sales_table (
    sale_id SERIAL PRIMARY KEY,
    sale_date VARCHAR(255) NOT NULL,
    total_amount DOUBLE PRECISION NOT NULL,
    total_profit DOUBLE PRECISION NOT NULL,
    items_json TEXT NOT NULL
);

-- 4. Create UTANG_TABLE table
CREATE TABLE IF NOT EXISTS utang_table (
    utang_id SERIAL PRIMARY KEY,
    customer_name VARCHAR(255) NOT NULL,
    amount DECIMAL(10,2) NOT NULL,
    profit DECIMAL(10,2) DEFAULT 0.00,
    items_list TEXT NOT NULL,
    date_borrowed VARCHAR(255) NOT NULL,
    status VARCHAR(50) NOT NULL
);

-- 5. Create UTANG_CUSTOMERS table
CREATE TABLE IF NOT EXISTS utang_customers (
    customer_id SERIAL PRIMARY KEY,
    fullname VARCHAR(255) NOT NULL UNIQUE,
    contact_number VARCHAR(50) DEFAULT NULL,
    address TEXT DEFAULT NULL,
    folder_status VARCHAR(20) DEFAULT 'ACTIVE'
);

-- 6. Create USERS table
CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    first_name VARCHAR(255) NOT NULL,
    middle_initial VARCHAR(5) DEFAULT '',
    last_name VARCHAR(255) NOT NULL,
    contact_number VARCHAR(50) DEFAULT '',
    address TEXT DEFAULT '',
    password VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL,
    account_state VARCHAR(20) DEFAULT 'NORMAL'
);
`;

const seedData = `
-- Insert Default Admin User
INSERT INTO users (email, first_name, middle_initial, last_name, contact_number, address, password, role, account_state)
VALUES ('admin@gmail.com', 'Admin', 'A', 'User', '09123456789', 'Main Address', 'admin123', 'admin', 'NORMAL')
ON CONFLICT (email) DO NOTHING;

-- Insert Initial Products
INSERT INTO products (prod_id, prod_name, prod_category, orig_price, price_capital, stock_Qty, expiry_Date, img_Url, Favorite) VALUES
(5, 'Coke Mismo', 'drinks', 17.00, 5.00, 30, NULL, 'http://cdn.shopify.com/s/files/1/0284/7237/7453/products/coke_mismo_1024x1024_c26e2a40-f514-4a87-a672-bebd8e50ba2f_1200x1200.jpg?v=1590131441', 1),
(6, 'Sprite Swakto', 'drinks', 17.00, 5.00, 18, NULL, 'https://img.lazcdn.com/g/ff/kf/Sd877548befda4e3980c7ac31bfd766418.jpg_720x720q80.jpg', 1),
(7, 'Coke Swakto', '', 12.00, 5.00, 17, NULL, 'https://ph-test-11.slatic.net/p/1a3f3f96e42354a84cda86c625a14937.jpg', 0),
(8, 'Cobra Yellow Plastic', 'drinks', 17.00, 5.00, 18, NULL, 'http://asiabrewery.com/cdn/shop/products/CobraOriginal350mlPETBottlecopy_0f4b1961-8c35-44a8-8a3b-d855285f7315.png?v=1653373730', 0),
(9, 'Sting', 'drinks', 18.00, 5.00, 20, NULL, 'https://5.imimg.com/data5/SELLER/Default/2024/9/453504506/ZC/PP/KK/141888649/sting-energy-drink-250-ml-bottle-500x500.jpg', 0),
(10, 'Royal Swakto', 'drinks', 22.00, 6.00, 20, NULL, 'https://shopsuki.ph/cdn/shop/files/4801981127207_800x.jpg?v=1718866992', 0),
(16, 'Dutch Mill 180ml', 'drinks', 22.00, 5.00, 20, NULL, 'https://imartgrocersph.com/wp-content/uploads/2020/09/Dutch-Mill-Yoghurt-Drink-Strawberry-180mL.jpeg', 0),
(17, 'Nestle Chuckie 250ml', 'drinks', 25.00, 5.00, 20, NULL, 'https://shopsuki.ph/cdn/shop/products/4800361015400_800x.jpg?v=1681126927', 0),
(18, 'Dutch Mill 90ml', 'drinks', 12.00, 5.00, 20, NULL, 'http://zbga.shopsuki.ph/cdn/shop/products/8853002303110_e5939086-7196-4d8c-9989-91618aa5f2d1_1024x.jpg?v=1678246434', 0),
(19, 'Gatorade Small', 'drinks', 33.00, 5.00, 20, NULL, 'https://www.staples-3p.com/s7/is/image/Staples/s1227816_sc7?wid=800&hei=800', 0),
(20, 'Gatorade Big', 'drinks', 45.00, 5.00, 20, NULL, 'https://cdn0.woolworths.media/content/wowproductimages/large/799681.jpg', 0),
(21, 'Nescafe Ice Black', 'drinks', 38.00, 4.00, 20, NULL, 'https://www.nescafe.com/ph/sites/default/files/2024-06/ice-black-front.png', 0),
(22, 'Mountain Dew', 'drinks', 17.00, 5.00, 20, NULL, 'https://store.iloilosupermart.com/wp-content/uploads/2025/10/34521.webp', 0),
(23, 'Sprite Mismo', 'drinks', 17.00, 5.00, 20, NULL, 'https://cdn.store-assets.com/s/377840/i/17268557.jpg', 0),
(24, 'Royal Mismo', 'drinks', 17.00, 5.00, 20, NULL, 'https://salangikopu.com/wp-content/uploads/2020/09/Royal-Tru-Orange-250ml-Front.png', 0),
(25, 'Cobra Green Plastic', 'drinks', 17.00, 5.00, 20, NULL, 'https://asiabrewery.com/cdn/shop/products/CobrSmartcopy_af87c92c-f8b3-4943-8a30-57bb69b84dd1.png?v=1653372069', 0),
(26, 'Piattos Blue', 'chips', 18.00, 2.00, 20, NULL, 'https://www.kuyastindahan.co.uk/images/jack-n-jill-piattos-cheese-85g-p70-1964_image.jpg', 0),
(27, 'Piattos Green', 'chips', 18.00, 2.00, 20, NULL, 'https://cdn.shopify.com/s/files/1/0599/9932/2302/products/image_fd66dab8-94e9-4b85-8bf4-3b84c306038c_1800x1800.jpg?v=1635551128', 0),
(28, 'Tattos Orange', 'chips', 10.00, 3.00, 20, NULL, 'https://www.srssulit.com/wp-content/uploads/products/2004890672-1.png', 0),
(29, 'Patata', 'chips', 8.00, 2.00, 20, NULL, 'https://cf.shopee.ph/file/sg-11134201-22110-04jbk4i2nvjv00', 0),
(30, 'Moby Chocolate', 'chips', 8.00, 5.00, 20, NULL, 'https://tse3.mm.bing.net/th/id/OIP.DJ0gFD4_3Hj5QluhgiqvKwHaHR?pid=Api&P=0&h=180', 0),
(31, 'Moby Caramel', 'chips', 8.00, 2.00, 20, NULL, 'https://www.unlistore.ph/images/thumbs/0026232_moby-caramel-snack-60g-mob21.jpeg', 0),
(32, 'Nissin Bread Stix', 'chips', 35.00, 5.00, 20, NULL, 'http://zbga.shopsuki.ph/cdn/shop/files/102057477_1024x.png?v=1736750154', 0),
(33, 'Mang Juan Brown', 'chips', 8.00, 2.00, 20, NULL, 'https://salangikopu.com/wp-content/uploads/2020/09/Mang-Juan-Chicharron-Sukat-Sili-Small-Front.png', 0),
(34, 'Mang Juan Green', 'chips', 8.00, 2.00, 20, NULL, 'https://www.panaboonlinegrocery.com/sunshine/assets/uploads/chicharon-green-small.png', 0),
(35, 'Oishi Potato Fries', 'chips', 8.00, 2.00, 20, NULL, 'https://www.oishi.com.ph/wp-content/uploads/2017/04/Potato-Fries-Cheese-50g-BM.png', 0),
(36, 'Oishi Boogyman', 'chips', 8.00, 2.00, 20, NULL, 'https://www.oishi.com.ph/wp-content/uploads/2017/04/boogyman-crunch-24g-copy.png', 0),
(37, 'Super Crunch Blue', 'chips', 10.00, 3.00, 20, NULL, 'https://shopsuki.ph/cdn/shop/products/4800365101215_800x.jpg?v=1669086772', 0),
(38, 'Super Crunch Green', 'chips', 10.00, 3.00, 18, NULL, 'http://shopsuki.ph/cdn/shop/files/Untitleddesign-2024-04-16T122646.351_1024x.png?v=1713241566', 0),
(39, 'Super Crunch Red', 'chips', 10.00, 3.00, 20, NULL, 'https://shopgaisano.com/cdn/shop/files/SUPERCRUNCHRED_1024x1024.jpg?v=1762396240', 0),
(40, 'Fish Crackers ', 'chips', 8.00, 2.00, 20, NULL, 'https://i5.walmartimages.com/asr/f97437f2-7068-4134-b877-f3799bbbc20b_2.e25dda6f3f731a0de27d3b79fe7bada1.jpeg', 0),
(41, 'Cracklings8', 'chips', 8.00, 2.00, 20, NULL, 'https://i5.walmartimages.com/asr/494252aa-7ca5-4ada-82c4-233c62bf69b1_1.503d0bd1f8c67137e01db005e0599710.jpeg ', 0),
(42, 'Nova', 'chips', 15.00, 5.00, 20, NULL, 'https://down-ph.img.susercontent.com/file/ph-11134207-7qul6-livc74u0f5gc5a_tn.webp', 0),
(43, 'Tattos Black', 'chips', 10.00, 3.00, 20, NULL, 'http://shopsuki.ph/cdn/shop/files/4806521798268_1024x.jpg?v=1733556223', 0),
(44, 'Tattos Violet', 'chips', 10.00, 5.00, 20, NULL, 'https://www.srssulit.com/wp-content/uploads/products/2004862422-1.png', 0),
(45, 'Fishda', 'chips', 8.00, 2.00, 20, NULL, 'https://www.oishi.com.ph/wp-content/uploads/2017/02/fishda-copy.png', 0),
(46, 'Onion Rings', 'chips', 8.00, 2.00, 20, NULL, 'https://www.oishi.com.ph/wp-content/uploads/2017/04/onion-rings-18g-copy.png', 0),
(47, 'Pritong Bangus', 'chips', 8.00, 2.00, 20, NULL, 'https://down-ph.img.susercontent.com/file/sg-11134202-7rdxz-mclwtzu2iehy3e', 0),
(48, 'Lion Cheese Bones', 'chips', 10.00, 3.00, 20, NULL, 'https://americanuncle.it/cdn/shop/products/TwinLionCheeseBonesCurls58g.jpg?v=1663585510', 0),
(49, 'EC Milky Flakes', 'chips', 10.00, 3.00, 20, NULL, 'https://cdn.store-assets.com/s/377840/i/17136853.jpeg', 0),
(50, 'Oishi Cheez on Chips', 'chips', 8.00, 2.00, 20, NULL, 'https://www.oishi.com.ph/wp-content/uploads/2017/04/COC-L-PNG.png', 0),
(51, 'Seaweed Latiao', 'chips', 8.00, 2.00, 20, NULL, 'https://down-ph.img.susercontent.com/file/ph-11134207-81ztk-mhfp5lkvwj6314', 0),
(52, 'Tattos Green', 'chips', 8.00, 2.00, 20, NULL, 'https://boholgrocery.com/wp-content/uploads/2020/11/Tattoos-Corn-Chips-Sweet-Corn-58g.jpg', 0),
(53, 'Magic Chips Green', 'chips', 8.00, 2.00, 20, NULL, 'https://boholonlinestore.com/wp-content/uploads/2020/06/httpsshop.smmarkets.phmediawysiwyglostnfound320336772_-_jack_jill_magic_chps_sourcrm_onion_28g.png', 0),
(54, 'Magic Chips Yellow', 'chips', 8.00, 2.00, 20, NULL, 'https://www.royplazastore.com/media/182346.jpg', 0),
(55, 'KoKo Crunch', 'biscuit', 8.00, 2.00, 20, NULL, 'https://img.lazcdn.com/g/p/c3f30d689e7c1bdee535b168906efc2c.jpg_720x720q80.jpg', 0),
(56, 'Choco Knots', 'biscuit', 8.00, 2.00, 20, NULL, 'https://img06.weeecdn.com/product/image/463/762/3A1BD0C390F2E0D8.png', 0),
(57, 'EggNog Cookies Small', 'biscuit', 7.00, 2.00, 20, NULL, 'https://d2j6dbq0eux0bg.cloudfront.net/images/17197054/2970884080.jpg', 0),
(58, 'EGG Cracklets', 'chips', 10.00, 3.00, 20, NULL, 'https://bf1af2.akinoncloudcdn.com/products/2024/09/11/90030/bebc7647-55a1-436f-a884-fcf6c86a1536_size3840_cropCenter.jpg', 0),
(59, 'Pretzee Chocolate', 'biscuit', 8.00, 2.00, 20, NULL, 'http://shopsuki.ph/cdn/shop/files/pretzee-chocolate-coated-pretzels-23g_1024x.png?v=1712556342', 0),
(60, 'Pringles Small', 'chips', 50.00, 2.00, 20, NULL, 'https://express.stongs.com/media/uploads/product/00064100852686_A1C1.JPG', 0),
(61, 'Pringles Big', 'chips', 90.00, 7.00, 20, NULL, 'https://a.allegroimg.com/original/110e5b/6ed54ca4476c9cf4b6e2acb7e598/Pringles-chipsy-Sour-Cream-Onion-cebulowe-200g-BIG', 0),
(62, 'Lay''s Stax Pringles', 'chips', 77.00, 5.00, 20, NULL, 'https://www.aygee.com.au/productimage/_1000x1000/Smiths+Snackfood/9310015256639.png?ver=0', 0),
(63, 'Oishi Pillows', 'biscuit', 10.00, 5.00, 20, NULL, 'https://sg-gryphon.com/wp-content/uploads/2022/08/Artwork-Oishi-Pillow-Chocolate-18g-Visual.jpg', 0),
(65, 'Hot Na Hot Corn Chips', 'chips', 10.00, 3.00, 20, NULL, 'https://www.srssulit.com/wp-content/uploads/products/2112-1.png', 0),
(101, 'Watermelon ice cream', 'Cold Goods', 10.00, 5.00, 13, NULL, 'https://assets.unileversolutions.com/v1/126314774.png', 0)
ON CONFLICT (prod_id) DO NOTHING;
`;

console.log("Connecting to Supabase...");
pool.query(schema, (err) => {
    if (err) {
        console.error("Schema creation failed:", err.message);
        process.exit(1);
    }
    console.log("Tables created successfully (or already exist)!");
    
    pool.query(seedData, (seedErr) => {
        if (seedErr) {
            console.error("Data seeding failed:", seedErr.message);
            process.exit(1);
        }
        console.log("Seed data loaded successfully (or already exists)!");
        console.log("Database setup is complete!");
        process.exit(0);
    });
});
