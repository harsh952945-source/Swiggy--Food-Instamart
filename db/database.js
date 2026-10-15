const path = require('path');
const fs = require('fs');
const { DatabaseSync } = require('node:sqlite'); // built into Node.js — no native compiling needed

// On a host with a persistent volume (e.g. Railway), set DATA_DIR=/data so the database survives restarts.
const dataDir = process.env.DATA_DIR || __dirname;
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'zappyeats.db');
const isNew = !fs.existsSync(dbPath);

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL');
db.exec('PRAGMA foreign_keys = ON');

// Always ensure schema exists
const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// Lightweight migration: add image_url column if it doesn't exist yet (for DBs created before this feature)
const vendorCols = db.prepare("PRAGMA table_info(vendors)").all().map(c => c.name);
if (!vendorCols.includes('image_url')) {
  db.exec('ALTER TABLE vendors ADD COLUMN image_url TEXT');
}
const productCols = db.prepare("PRAGMA table_info(products)").all().map(c => c.name);
if (!productCols.includes('image_url')) {
  db.exec('ALTER TABLE products ADD COLUMN image_url TEXT');
}

// Migration: coupon info on orders
const orderCols = db.prepare("PRAGMA table_info(orders)").all().map(c => c.name);
if (!orderCols.includes('discount')) db.exec('ALTER TABLE orders ADD COLUMN discount REAL DEFAULT 0');
if (!orderCols.includes('coupon_code')) db.exec('ALTER TABLE orders ADD COLUMN coupon_code TEXT');

// Default coupons (only when the coupons table is empty)
if (db.prepare('SELECT COUNT(*) c FROM coupons').get().c === 0) {
  const ins = db.prepare('INSERT INTO coupons (code, description, type, value, min_order, max_discount) VALUES (?,?,?,?,?,?)');
  ins.run('WELCOME50', '50% off, up to ₹100, on orders above ₹199', 'percent', 50, 199, 100);
  ins.run('FLAT100', 'Flat ₹100 off on orders above ₹499', 'flat', 100, 499, 0);
  ins.run('SAVE20', '20% off, up to ₹80, on orders above ₹149', 'percent', 20, 149, 80);
}

module.exports = db;
module.exports.isNew = isNew;
