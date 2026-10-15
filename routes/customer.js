const express = require('express');
const db = require('../db/database');
const { requireLogin } = require('../middleware/auth');
const router = express.Router();

const STEPS = ['Placed', 'Confirmed', 'Preparing', 'Out for Delivery', 'Delivered'];

function getCart(req) {
  if (!req.session.cart) req.session.cart = { vendorId: null, mode: null, items: [] };
  return req.session.cart;
}

function cartCount(cart) {
  return cart.items.reduce((s, i) => s + i.quantity, 0);
}

// Only allow redirects back to our own pages
function safeNext(n, fallback = '/') {
  if (typeof n !== 'string' || !n.startsWith('/') || n.startsWith('//') || n.includes('\\')) return fallback;
  return n;
}

// Work out subtotal, delivery fee, coupon discount and total for the current cart
function computeTotals(cart, code) {
  const subtotal = cart.items.reduce((s, i) => s + i.price * i.quantity, 0);
  const deliveryFee = subtotal > 0 ? (cart.mode === 'mart' ? 15 : 35) : 0;
  let discount = 0, coupon = null, couponError = null;

  if (code && subtotal > 0) {
    const c = db.prepare('SELECT * FROM coupons WHERE code = ? COLLATE NOCASE').get(code);
    if (!c || !c.is_active) couponError = 'This coupon is not valid.';
    else if (c.expires_at && c.expires_at < new Date().toISOString().slice(0, 10)) couponError = 'This coupon has expired.';
    else if (subtotal < c.min_order) couponError = `Add ₹${Math.ceil(c.min_order - subtotal)} more to use ${c.code}.`;
    else {
      coupon = c;
      discount = c.type === 'percent' ? subtotal * c.value / 100 : c.value;
      if (c.type === 'percent' && c.max_discount > 0) discount = Math.min(discount, c.max_discount);
      discount = Math.min(Math.round(discount), subtotal);
    }
  }
  return { subtotal, deliveryFee, discount, coupon, couponError, total: subtotal - discount + deliveryFee };
}

function activeCoupons() {
  return db.prepare(`SELECT * FROM coupons WHERE is_active = 1 AND (expires_at IS NULL OR expires_at = '' OR expires_at >= date('now')) ORDER BY id`).all();
}

router.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.cart = getCart(req);
  res.locals.cartCount = cartCount(getCart(req));
  res.locals.currentPath = req.originalUrl;
  res.locals.favVendors = new Set();
  res.locals.favProducts = new Set();
  if (req.session.user) {
    db.prepare('SELECT kind, ref_id FROM favourites WHERE user_id = ?').all(req.session.user.id)
      .forEach(f => (f.kind === 'vendor' ? res.locals.favVendors : res.locals.favProducts).add(f.ref_id));
  }
  next();
});

// Landing page
router.get('/', (req, res) => {
  res.render('index', { coupons: activeCoupons() });
});

router.get('/about', (req, res) => res.render('about'));

// Vendor listing per mode (food or mart). Search matches vendor name/category OR any product on its menu.
router.get('/browse/:mode', (req, res) => {
  const mode = req.params.mode === 'mart' ? 'mart' : 'food';
  const q = (req.query.q || '').trim();
  let vendors;
  if (q) {
    const like = `%${q}%`;
    vendors = db.prepare(
      `SELECT * FROM vendors WHERE mode = ? AND is_active = 1 AND (
         name LIKE ? OR category LIKE ? OR
         id IN (SELECT vendor_id FROM products WHERE is_available = 1 AND (name LIKE ? OR category LIKE ? OR description LIKE ?))
       ) ORDER BY rating DESC`
    ).all(mode, like, like, like, like, like);
  } else {
    vendors = db.prepare('SELECT * FROM vendors WHERE mode = ? AND is_active = 1 ORDER BY rating DESC').all(mode);
  }
  res.render('browse', { vendors, mode, q });
});

// Vendor detail / menu
router.get('/vendor/:id', (req, res) => {
  const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(req.params.id);
  if (!vendor) return res.status(404).render('404');
  const products = db.prepare('SELECT * FROM products WHERE vendor_id = ? AND is_available = 1').all(vendor.id);
  const categories = [...new Set(products.map(p => p.category))];
  const grouped = categories.map(cat => ({ cat, items: products.filter(p => p.category === cat) }));
  res.render('vendor', { vendor, grouped });
});

// ---------- Favourites ----------
router.post('/favourites/toggle', (req, res) => {
  const { kind, ref_id } = req.body;
  const next = safeNext(req.body.next, '/favourites');
  if (!req.session.user) {
    req.session.returnTo = next;
    return res.redirect('/login');
  }
  if (!['vendor', 'product'].includes(kind) || !ref_id) return res.redirect(next);
  const uid = req.session.user.id;
  const existing = db.prepare('SELECT id FROM favourites WHERE user_id = ? AND kind = ? AND ref_id = ?').get(uid, kind, ref_id);
  if (existing) db.prepare('DELETE FROM favourites WHERE id = ?').run(existing.id);
  else db.prepare('INSERT INTO favourites (user_id, kind, ref_id) VALUES (?,?,?)').run(uid, kind, ref_id);
  res.redirect(next);
});

router.get('/favourites', requireLogin, (req, res) => {
  const uid = req.session.user.id;
  const vendors = db.prepare(`SELECT v.* FROM favourites f JOIN vendors v ON v.id = f.ref_id
    WHERE f.user_id = ? AND f.kind = 'vendor' AND v.is_active = 1 ORDER BY f.created_at DESC`).all(uid);
  const products = db.prepare(`SELECT p.*, v.name AS vendor_name, v.mode AS vendor_mode FROM favourites f
    JOIN products p ON p.id = f.ref_id JOIN vendors v ON v.id = p.vendor_id
    WHERE f.user_id = ? AND f.kind = 'product' AND p.is_available = 1 ORDER BY f.created_at DESC`).all(uid);
  res.render('favourites', { vendors, products });
});

// ---------- Cart ----------
router.post('/cart/add', (req, res) => {
  const { productId, vendorId, mode } = req.body;
  const cart = getCart(req);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) return res.redirect('/');

  if (cart.vendorId && String(cart.vendorId) !== String(vendorId)) {
    // switching vendor clears the cart (mirrors real food-delivery apps)
    cart.items = [];
  }
  cart.vendorId = vendorId;
  cart.mode = mode;

  const existing = cart.items.find(i => i.productId == productId);
  if (existing) {
    existing.quantity += 1;
  } else {
    cart.items.push({ productId: product.id, name: product.name, price: product.price, quantity: 1 });
  }
  req.session.cart = cart;
  res.redirect(`/vendor/${vendorId}`);
});

router.post('/cart/update', (req, res) => {
  const { productId, action } = req.body;
  const cart = getCart(req);
  const item = cart.items.find(i => i.productId == productId);
  if (item) {
    if (action === 'inc') item.quantity += 1;
    if (action === 'dec') item.quantity -= 1;
    if (item.quantity <= 0) {
      cart.items = cart.items.filter(i => i.productId != productId);
    }
  }
  if (cart.items.length === 0) { cart.vendorId = null; cart.mode = null; req.session.couponCode = null; }
  req.session.cart = cart;
  res.redirect('/cart');
});

// ---------- Coupons ----------
router.post('/coupon/apply', (req, res) => {
  const code = String(req.body.code || '').trim().toUpperCase();
  const next = safeNext(req.body.next, '/cart');
  const c = code ? db.prepare('SELECT * FROM coupons WHERE code = ? COLLATE NOCASE').get(code) : null;
  if (!c || !c.is_active) {
    req.session.couponCode = null;
    req.session.couponMsg = { type: 'error', text: code ? `"${code}" is not a valid coupon.` : 'Enter a coupon code.' };
  } else {
    req.session.couponCode = c.code;
    req.session.couponMsg = null;
  }
  res.redirect(next);
});

router.post('/coupon/remove', (req, res) => {
  req.session.couponCode = null;
  req.session.couponMsg = null;
  res.redirect(safeNext(req.body.next, '/cart'));
});

function couponView(req, cart) {
  const t = computeTotals(cart, req.session.couponCode);
  let msg = req.session.couponMsg || null;
  req.session.couponMsg = null;
  if (!msg && t.couponError) msg = { type: 'error', text: t.couponError };
  if (!msg && t.coupon) msg = { type: 'ok', text: `${t.coupon.code} applied — you save ₹${t.discount}.` };
  return { ...t, couponMsg: msg, offers: activeCoupons(), appliedCode: t.coupon ? t.coupon.code : null };
}

router.get('/cart', (req, res) => {
  const cart = getCart(req);
  const vendor = cart.vendorId ? db.prepare('SELECT * FROM vendors WHERE id = ?').get(cart.vendorId) : null;
  res.render('cart', { vendor, ...couponView(req, cart) });
});

router.get('/checkout', requireLogin, (req, res) => {
  const cart = getCart(req);
  if (cart.items.length === 0) return res.redirect('/cart');
  const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(cart.vendorId);
  res.render('checkout', { vendor, ...couponView(req, cart), error: null });
});

router.post('/checkout', requireLogin, (req, res) => {
  const cart = getCart(req);
  if (cart.items.length === 0) return res.redirect('/cart');
  const { address, paymentMethod } = req.body;
  const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(cart.vendorId);

  const fail = (error) => res.render('checkout', { vendor, ...couponView(req, cart), error });
  if (!address || !address.trim()) return fail('Delivery address is required.');

  const t = computeTotals(cart, req.session.couponCode);
  if (req.session.couponCode && t.couponError) return fail(t.couponError + ' Remove the coupon or fix your cart to continue.');

  const info = db.prepare(
    `INSERT INTO orders (user_id, vendor_id, mode, total, delivery_fee, address, payment_method, status, discount, coupon_code) VALUES (?,?,?,?,?,?,?,?,?,?)`
  ).run(req.session.user.id, cart.vendorId, cart.mode, t.total, t.deliveryFee, address, paymentMethod || 'Cash on Delivery', 'Placed', t.discount, t.coupon ? t.coupon.code : null);

  const orderId = info.lastInsertRowid;
  const insertItem = db.prepare('INSERT INTO order_items (order_id, product_id, name, price, quantity) VALUES (?,?,?,?,?)');
  for (const item of cart.items) {
    insertItem.run(orderId, item.productId, item.name, item.price, item.quantity);
  }
  if (t.coupon) db.prepare('UPDATE coupons SET times_used = times_used + 1 WHERE id = ?').run(t.coupon.id);

  req.session.cart = { vendorId: null, mode: null, items: [] };
  req.session.couponCode = null;
  res.redirect(`/order/${orderId}/success`);
});

// ---------- Orders & tracking ----------
function loadOrder(req) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.session.user.id);
  if (!order) return null;
  const vendor = db.prepare('SELECT * FROM vendors WHERE id = ?').get(order.vendor_id);
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  return { order, vendor, items, steps: STEPS, stepIndex: STEPS.indexOf(order.status) };
}

router.get('/order/:id/success', requireLogin, (req, res) => {
  const data = loadOrder(req);
  if (!data) return res.status(404).render('404');
  res.render('order-success', data);
});

router.get('/order/:id', requireLogin, (req, res) => {
  const data = loadOrder(req);
  if (!data) return res.status(404).render('404');
  res.render('order-track', data);
});

// Small JSON endpoint the tracking page polls so the timeline updates without a manual refresh
router.get('/order/:id/status', requireLogin, (req, res) => {
  const o = db.prepare('SELECT status FROM orders WHERE id = ? AND user_id = ?').get(req.params.id, req.session.user.id);
  if (!o) return res.status(404).json({ error: 'not found' });
  res.json({ status: o.status, stepIndex: STEPS.indexOf(o.status) });
});

router.get('/orders', requireLogin, (req, res) => {
  const orders = db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC, id DESC').all(req.session.user.id);
  const vendorsById = {};
  db.prepare('SELECT * FROM vendors').all().forEach(v => vendorsById[v.id] = v);
  res.render('orders', { orders, vendorsById });
});

module.exports = router;
