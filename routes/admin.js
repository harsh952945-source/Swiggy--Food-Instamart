const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { requireAdmin } = require('../middleware/auth');
const router = express.Router();

// ---- Image upload (saved inside the project: public/images/uploads) ----
const uploadDir = process.env.DATA_DIR ? path.join(process.env.DATA_DIR, 'uploads') : path.join(__dirname, '..', 'public', 'images', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    filename: (req, file, cb) => cb(null, Date.now() + '-' + Math.round(Math.random() * 1e6) + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => cb(null, /^image\/(jpeg|png|webp|gif|avif)$/.test(file.mimetype)),
});
// uploaded file wins; otherwise use the pasted link (or nothing)
const pickImage = (req) => (req.file ? '/images/uploads/' + req.file.filename : (req.body.image_url || null));


router.get('/admin/login', (req, res) => {
  res.render('admin/login', { error: null });
});

router.post('/admin/login', (req, res) => {
  const { email, password } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE email = ?').get(email);
  if (!admin || !bcrypt.compareSync(password, admin.password)) {
    return res.render('admin/login', { error: 'Invalid admin credentials.' });
  }
  req.session.admin = { id: admin.id, name: admin.name, email: admin.email };
  res.redirect('/admin');
});

router.post('/admin/logout', (req, res) => {
  req.session.admin = null;
  res.redirect('/admin/login');
});

router.use('/admin', requireAdmin);

router.get('/admin', (req, res) => {
  const stats = {
    vendors: db.prepare('SELECT COUNT(*) c FROM vendors').get().c,
    products: db.prepare('SELECT COUNT(*) c FROM products').get().c,
    orders: db.prepare('SELECT COUNT(*) c FROM orders').get().c,
    users: db.prepare('SELECT COUNT(*) c FROM users').get().c,
    revenue: db.prepare("SELECT COALESCE(SUM(total),0) r FROM orders WHERE status != 'Cancelled'").get().r,
  };
  const recentOrders = db.prepare(`
    SELECT o.*, u.name as user_name, v.name as vendor_name
    FROM orders o JOIN users u ON o.user_id = u.id JOIN vendors v ON o.vendor_id = v.id
    ORDER BY o.created_at DESC, o.id DESC LIMIT 8
  `).all();

  // Revenue + orders for the last 7 days (missing days filled with 0)
  const rows = db.prepare(`SELECT date(created_at) d, COUNT(*) n, COALESCE(SUM(total),0) r FROM orders
    WHERE status != 'Cancelled' AND date(created_at) >= date('now','-6 days') GROUP BY d`).all();
  const byDay = {}; rows.forEach(r => byDay[r.d] = r);
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const dt = new Date(Date.now() - i * 86400000);
    const key = dt.toISOString().slice(0, 10);
    days.push({
      label: dt.toLocaleDateString('en-IN', { weekday: 'short', timeZone: 'UTC' }),
      orders: byDay[key] ? byDay[key].n : 0,
      revenue: byDay[key] ? Math.round(byDay[key].r) : 0,
    });
  }
  const maxRevenue = Math.max(1, ...days.map(d => d.revenue));

  const topItems = db.prepare(`SELECT oi.name, SUM(oi.quantity) qty FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.status != 'Cancelled' GROUP BY oi.name ORDER BY qty DESC LIMIT 5`).all();
  const modeSplit = db.prepare(`SELECT mode, COUNT(*) n, COALESCE(SUM(total),0) r FROM orders WHERE status != 'Cancelled' GROUP BY mode`).all();

  res.render('admin/dashboard', { stats, recentOrders, days, maxRevenue, topItems, modeSplit });
});

// ---- Vendors ----
router.get('/admin/vendors', (req, res) => {
  const vendors = db.prepare('SELECT * FROM vendors ORDER BY id DESC').all();
  res.render('admin/vendors', { vendors });
});

router.get('/admin/vendors/new', (req, res) => {
  res.render('admin/vendor-form', { vendor: null });
});

router.post('/admin/vendors/new', upload.single('image_file'), (req, res) => {
  const { mode, name, category, description, delivery_time, image_emoji, image_url, color } = req.body;
  db.prepare(`INSERT INTO vendors (mode,name,category,description,delivery_time,image_emoji,image_url,color) VALUES (?,?,?,?,?,?,?,?)`)
    .run(mode, name, category, description, delivery_time || '30 mins', image_emoji || '🍽️', pickImage(req), color || '#6C3EC9');
  res.redirect('/admin/vendors');
});

router.get('/admin/vendors/:id/edit', (req, res) => {
  const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id);
  if (!vendor) return res.redirect('/admin/vendors');
  res.render('admin/vendor-form', { vendor });
});

router.post('/admin/vendors/:id/edit', upload.single('image_file'), (req, res) => {
  const { mode, name, category, description, delivery_time, image_emoji, image_url, color, is_active } = req.body;
  db.prepare(`UPDATE vendors SET mode=?, name=?, category=?, description=?, delivery_time=?, image_emoji=?, image_url=?, color=?, is_active=? WHERE id=?`)
    .run(mode, name, category, description, delivery_time, image_emoji, pickImage(req), color, is_active ? 1 : 0, req.params.id);
  res.redirect('/admin/vendors');
});

router.post('/admin/vendors/:id/delete', (req, res) => {
  db.prepare('DELETE FROM products WHERE vendor_id = ?').run(req.params.id);
  db.prepare('DELETE FROM vendors WHERE id = ?').run(req.params.id);
  res.redirect('/admin/vendors');
});

// ---- Products ----
router.get('/admin/products', (req, res) => {
  const products = db.prepare(`
    SELECT p.*, v.name as vendor_name FROM products p JOIN vendors v ON p.vendor_id = v.id ORDER BY p.id DESC
  `).all();
  res.render('admin/products', { products });
});

router.get('/admin/products/new', (req, res) => {
  const vendors = db.prepare('SELECT * FROM vendors ORDER BY name').all();
  res.render('admin/product-form', { product: null, vendors });
});

router.post('/admin/products/new', upload.single('image_file'), (req, res) => {
  const { vendor_id, name, description, price, unit, category, image_emoji, image_url, veg } = req.body;
  db.prepare(`INSERT INTO products (vendor_id,name,description,price,unit,category,image_emoji,image_url,veg) VALUES (?,?,?,?,?,?,?,?,?)`)
    .run(vendor_id, name, description, parseFloat(price), unit || '', category || 'General', image_emoji || '🍽️', pickImage(req), veg ? 1 : 0);
  res.redirect('/admin/products');
});

router.get('/admin/products/:id/edit', (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);
  const vendors = db.prepare('SELECT * FROM vendors ORDER BY name').all();
  if (!product) return res.redirect('/admin/products');
  res.render('admin/product-form', { product, vendors });
});

router.post('/admin/products/:id/edit', upload.single('image_file'), (req, res) => {
  const { vendor_id, name, description, price, unit, category, image_emoji, image_url, veg, is_available } = req.body;
  db.prepare(`UPDATE products SET vendor_id=?, name=?, description=?, price=?, unit=?, category=?, image_emoji=?, image_url=?, veg=?, is_available=? WHERE id=?`)
    .run(vendor_id, name, description, parseFloat(price), unit, category, image_emoji, pickImage(req), veg ? 1 : 0, is_available ? 1 : 0, req.params.id);
  res.redirect('/admin/products');
});

router.post('/admin/products/:id/delete', (req, res) => {
  db.prepare('DELETE FROM products WHERE id = ?').run(req.params.id);
  res.redirect('/admin/products');
});

// ---- Orders ----
router.get('/admin/orders', (req, res) => {
  const orders = db.prepare(`
    SELECT o.*, u.name as user_name, v.name as vendor_name
    FROM orders o JOIN users u ON o.user_id = u.id JOIN vendors v ON o.vendor_id = v.id
    ORDER BY o.created_at DESC
  `).all();
  res.render('admin/orders', { orders });
});

router.post('/admin/orders/:id/status', (req, res) => {
  const { status } = req.body;
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
  res.redirect('/admin/orders');
});

// ---- Coupons ----
router.get('/admin/coupons', (req, res) => {
  const coupons = db.prepare('SELECT * FROM coupons ORDER BY id DESC').all();
  const msg = req.session.adminMsg || null; req.session.adminMsg = null;
  res.render('admin/coupons', { coupons, msg });
});

router.post('/admin/coupons/new', (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase().replace(/\s+/g, '');
  const type = req.body.type === 'flat' ? 'flat' : 'percent';
  const value = parseFloat(req.body.value);
  const minOrder = parseFloat(req.body.min_order) || 0;
  const maxDiscount = parseFloat(req.body.max_discount) || 0;
  const fail = (text) => { req.session.adminMsg = { type: 'error', text }; res.redirect('/admin/coupons'); };
  if (!/^[A-Z0-9]{3,20}$/.test(code)) return fail('Code must be 3–20 letters/numbers (no spaces).');
  if (!(value > 0)) return fail('Discount value must be greater than 0.');
  if (type === 'percent' && value > 100) return fail('A percentage discount cannot be more than 100.');
  try {
    db.prepare('INSERT INTO coupons (code, description, type, value, min_order, max_discount, expires_at) VALUES (?,?,?,?,?,?,?)')
      .run(code, (req.body.description || '').trim(), type, value, minOrder, maxDiscount, req.body.expires_at || null);
  } catch (e) {
    return fail('A coupon with that code already exists.');
  }
  req.session.adminMsg = { type: 'ok', text: `Coupon ${code} created.` };
  res.redirect('/admin/coupons');
});

router.post('/admin/coupons/:id/toggle', (req, res) => {
  db.prepare('UPDATE coupons SET is_active = 1 - is_active WHERE id = ?').run(req.params.id);
  res.redirect('/admin/coupons');
});

router.post('/admin/coupons/:id/delete', (req, res) => {
  db.prepare('DELETE FROM coupons WHERE id = ?').run(req.params.id);
  res.redirect('/admin/coupons');
});

// ---- Change admin email / password ----
router.get('/admin/password', (req, res) => {
  res.render('admin/password', { msg: null, email: req.session.admin.email });
});

router.post('/admin/password', (req, res) => {
  const { current_password, new_email, new_password, confirm_password } = req.body;
  const admin = db.prepare('SELECT * FROM admins WHERE id = ?').get(req.session.admin.id);
  const show = (type, text) => res.render('admin/password', { msg: { type, text }, email: req.session.admin.email });

  if (!admin || !bcrypt.compareSync(current_password || '', admin.password)) return show('error', 'Your current password is incorrect.');
  const email = (new_email || '').trim() || admin.email;
  let hash = admin.password;
  if (new_password) {
    if (new_password.length < 6) return show('error', 'New password must be at least 6 characters.');
    if (new_password !== confirm_password) return show('error', 'New password and confirmation do not match.');
    hash = bcrypt.hashSync(new_password, 10);
  } else if (email === admin.email) {
    return show('error', 'Nothing to change — enter a new password and/or a new email.');
  }
  const clash = db.prepare('SELECT id FROM admins WHERE email = ? AND id != ?').get(email, admin.id);
  if (clash) return show('error', 'That email is already used by another admin.');
  db.prepare('UPDATE admins SET email = ?, password = ? WHERE id = ?').run(email, hash, admin.id);
  req.session.admin.email = email;
  res.render('admin/password', { msg: { type: 'ok', text: 'Saved. Use your new login details next time.' }, email });
});

module.exports = router;
