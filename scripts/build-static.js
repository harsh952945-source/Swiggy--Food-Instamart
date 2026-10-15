// Builds a browser-only copy of the site (for GitHub Pages) from YOUR database.
// Run:  npm run build-static      ->  creates the folder  static-demo/
const fs = require('fs');
const path = require('path');
const db = require('../db/database');

const root = path.join(__dirname, '..');
const out = path.join(root, 'static-demo');
const rel = (p) => (!p ? null : (p.startsWith('/') ? p.slice(1) : p)); // /images/x.jpg -> images/x.jpg (works under github.io/<repo>/)

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(path.join(out, 'css'), { recursive: true });
fs.mkdirSync(path.join(out, 'js'), { recursive: true });

const vendors = db.prepare('SELECT * FROM vendors WHERE is_active = 1 ORDER BY id').all().map(v => ({
  id: v.id, mode: v.mode, name: v.name, category: v.category, description: v.description, rating: v.rating,
  delivery_time: v.delivery_time, image_emoji: v.image_emoji, image_url: rel(v.image_url), color: v.color, is_active: 1,
  products: db.prepare('SELECT * FROM products WHERE vendor_id = ? AND is_available = 1 ORDER BY id').all(v.id).map(p => ({
    id: p.id, name: p.name, description: p.description, price: p.price, unit: p.unit, category: p.category,
    image_emoji: p.image_emoji, image_url: rel(p.image_url), veg: p.veg, is_available: 1,
  })),
}));
const coupons = db.prepare(`SELECT code, description, type, value, min_order, max_discount, expires_at FROM coupons
  WHERE is_active = 1 AND (expires_at IS NULL OR expires_at = '' OR expires_at >= date('now')) ORDER BY id`).all();

fs.writeFileSync(path.join(out, 'data.js'), 'window.ZE_DATA = ' + JSON.stringify({ vendors, coupons }) + ';\n');
for (const f of ['index.html', '404.html', 'app.js']) fs.copyFileSync(path.join(root, 'static-template', f), path.join(out, f));
fs.copyFileSync(path.join(root, 'public', 'css', 'style.css'), path.join(out, 'css', 'style.css'));
fs.copyFileSync(path.join(root, 'public', 'js', 'chatbot.js'), path.join(out, 'js', 'chatbot.js'));
const imgs = path.join(root, 'public', 'images');
if (fs.existsSync(imgs)) fs.cpSync(imgs, path.join(out, 'images'), { recursive: true });
fs.writeFileSync(path.join(out, '.nojekyll'), '');

const pc = vendors.reduce((n, v) => n + v.products.length, 0);
const localImgs = vendors.filter(v => v.image_url && !/^https?:/.test(v.image_url)).length;
console.log(`Built static-demo/ with ${vendors.length} vendors, ${pc} products, ${coupons.length} coupons.`);
console.log(`Local photos copied from public/images (vendors using them: ${localImgs}).`);
const external = vendors.filter(v => /^https?:/.test(v.image_url || '')).length + vendors.reduce((n, v) => n + v.products.filter(p => /^https?:/.test(p.image_url || '')).length, 0);
if (external) console.log(`Note: ${external} photo(s) still use outside links. Run "npm run localize-images" first if you want them saved inside the project.`);
console.log('Next: upload everything inside static-demo/ to your GitHub repository (see README).');
