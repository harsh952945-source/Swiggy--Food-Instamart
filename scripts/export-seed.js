// Saves all vendors + products (including image paths) from your database into
// db/seed-data.json. On a fresh/reset host, the app loads this file automatically.
// Run:  npm run export-seed
const fs = require('fs');
const path = require('path');
const db = require('../db/database');

const vendors = db.prepare('SELECT * FROM vendors ORDER BY id').all().map(v => ({
  mode: v.mode, name: v.name, category: v.category, description: v.description, rating: v.rating,
  delivery_time: v.delivery_time, image_emoji: v.image_emoji, image_url: v.image_url, color: v.color, is_active: v.is_active,
  products: db.prepare('SELECT * FROM products WHERE vendor_id = ? ORDER BY id').all(v.id).map(p => ({
    name: p.name, description: p.description, price: p.price, unit: p.unit, category: p.category,
    image_emoji: p.image_emoji, image_url: p.image_url, veg: p.veg, is_available: p.is_available,
  })),
}));

const out = path.join(__dirname, '..', 'db', 'seed-data.json');
fs.writeFileSync(out, JSON.stringify({ vendors }, null, 2));
const pc = vendors.reduce((n, v) => n + v.products.length, 0);
console.log(`Exported ${vendors.length} vendors and ${pc} products to db/seed-data.json`);
