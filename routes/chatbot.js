const express = require('express');
const db = require('../db/database');
const router = express.Router();

// ---------- helpers that read real data from the database ----------

function getUserLatestOrder(userId) {
  return db.prepare(`
    SELECT o.*, v.name as vendor_name FROM orders o
    JOIN vendors v ON o.vendor_id = v.id
    WHERE o.user_id = ? ORDER BY o.created_at DESC, o.id DESC LIMIT 1
  `).get(userId);
}

function getVendorNames(mode) {
  return db.prepare('SELECT name FROM vendors WHERE mode = ? AND is_active = 1 ORDER BY rating DESC LIMIT 6').all(mode).map(r => r.name);
}

function getActiveCoupons() {
  return db.prepare(`SELECT * FROM coupons WHERE is_active = 1 AND (expires_at IS NULL OR expires_at = '' OR expires_at >= date('now')) ORDER BY id`).all();
}

// ---------- dish recommendation engine ----------

const STOP = new Set(('i me my we you a an the for to of in on at and or with without want need get give show tell find some any something ' +
  'please can could would should what which whats is are am be do does have has eat order food dish dishes item items option options ' +
  'recommend recommendation suggest suggestion suggestions hungry craving cravings looking like love try best top good great nice tasty ' +
  'cheap cheaper cheapest budget popular under below less than within upto up max rs inr rupees veg vegetarian non nonveg today tonight now ' +
  'near me here there it that this one few more quick fast grocery groceries grocerie instamart mart essentials essential').split(' '));

function parseFoodQuery(text) {
  const t = text.toLowerCase();
  const pm = t.match(/(?:under|below|less than|within|upto|up to|max|budget(?: of)?|around)\s*(?:rs\.?|₹|inr)?\s*(\d{2,5})/) ||
             t.match(/(?:₹|rs\.?\s*)(\d{2,5})/);
  const nonVeg = /\bnon[\s-]?veg\b/.test(t);
  const veg = !nonVeg && /\b(veg|vegetarian)\b/.test(t);
  const mart = /\b(grocery|groceries|instamart|mart|essentials)\b/.test(t);
  const keywords = t.replace(/[^a-z\s]/g, ' ').split(/\s+/)
    .filter(w => w.length >= 3 && !STOP.has(w))
    .map(w => (w.length > 4 && w.endsWith('s') ? w.slice(0, -1) : w));
  return { maxPrice: pm ? Number(pm[1]) : null, veg, nonVeg, mart, keywords: [...new Set(keywords)].slice(0, 4) };
}

function searchDishes(q, joiner = ' AND ') {
  let sql = `SELECT p.id, p.name, p.price, v.id AS vid, v.name AS vname FROM products p
             JOIN vendors v ON v.id = p.vendor_id WHERE p.is_available = 1 AND v.is_active = 1`;
  const params = [];
  if (q.mart) sql += " AND v.mode = 'mart'";
  if (q.maxPrice) { sql += ' AND p.price <= ?'; params.push(q.maxPrice); }
  if (q.veg) sql += ' AND p.veg = 1';
  if (q.nonVeg) sql += ' AND p.veg = 0';
  if (q.keywords.length) {
    const parts = q.keywords.map(() => '(p.name LIKE ? OR p.description LIKE ? OR p.category LIKE ? OR v.category LIKE ? OR v.name LIKE ?)');
    sql += ' AND (' + parts.join(joiner) + ')';
    q.keywords.forEach(k => { const l = `%${k}%`; params.push(l, l, l, l, l); });
  }
  sql += ' ORDER BY v.rating DESC, p.price ASC LIMIT 5';
  return db.prepare(sql).all(...params);
}

function recommend(text, force) {
  const q = parseFoodQuery(text);
  const hasCriteria = q.keywords.length || q.maxPrice || q.veg || q.nonVeg || q.mart;
  if (!hasCriteria && !force) return null;
  let rows = searchDishes(q);
  if (!rows.length && q.keywords.length > 1) rows = searchDishes(q, ' OR ');
  if (!rows.length) return null;

  const bits = [];
  if (q.veg) bits.push('veg'); if (q.nonVeg) bits.push('non-veg');
  const what = bits.length ? bits.join(' ') + ' picks' : 'picks';
  const lead = `Here are some ${what}${q.maxPrice ? ' under ₹' + q.maxPrice : ''}${q.keywords.length ? ' for "' + q.keywords.join(' ') + '"' : ''} — tap one to open the menu:`;
  return { reply: lead, items: rows.map(r => ({ text: `${r.name} — ₹${r.price.toFixed(0)} · ${r.vname}`, url: `/vendor/${r.vid}` })) };
}

// ---------- intent rules (word-boundary matching, first match wins) ----------

const rules = [
  { patterns: ['hi', 'hello', 'hey', 'good morning', 'good evening', 'good afternoon'],
    reply: () => `Hey there! 👋 I'm the ZappyEats assistant. Ask me for dish ideas (try "veg under ₹200"), your order status, coupons, delivery fees or payments.` },

  { patterns: ['where is my order', 'order status', 'track my order', 'my order', 'track order', 'track'],
    reply: (ctx) => {
      if (!ctx.userId) return `Please log in first so I can look up your order, then ask me again.`;
      const o = getUserLatestOrder(ctx.userId);
      if (!o) return `I don't see any orders on your account yet. Pick something tasty from the homepage!`;
      return { reply: `Your latest order #${o.id} from ${o.vendor_name} is: ${o.status}. Total ₹${o.total.toFixed(0)}.`, items: [{ text: 'Open live tracking for this order', url: `/order/${o.id}` }] };
    } },

  { patterns: ['coupon', 'coupons', 'offer', 'offers', 'discount', 'promo', 'promo code', 'deal', 'deals'],
    reply: () => {
      const cs = getActiveCoupons();
      if (!cs.length) return `There are no active coupons right now — check back soon!`;
      return { reply: `Active coupons — enter the code on the cart or checkout page:`, items: cs.map(c => ({ text: `${c.code} — ${c.description}`, url: '/cart' })) };
    } },

  { patterns: ['favourite', 'favourites', 'favorite', 'favorites', 'wishlist', 'saved'],
    reply: () => ({ reply: `Tap the ♡ heart on any restaurant, store or dish to save it. You can see everything you saved on your Favourites page.`, items: [{ text: 'Open my favourites', url: '/favourites' }] }) },

  { patterns: ['cancel my order', 'cancel order', 'how to cancel'],
    reply: () => `To cancel an order, please contact the restaurant/store directly — this demo app doesn't have self-serve cancellation yet.` },

  { patterns: ['delivery time', 'how long', 'how fast', 'when will it arrive', 'eta'],
    reply: () => `Most Food orders arrive in 20–35 mins and Instamart orders in about 10–15 mins. Each restaurant/store page shows its own estimate.` },

  { patterns: ['delivery fee', 'delivery charge', 'delivery charges', 'shipping', 'how much is delivery'],
    reply: () => `Delivery is ₹35 for Food orders and ₹15 for Instamart orders, added at checkout.` },

  { patterns: ['payment', 'how to pay', 'cash on delivery', 'upi', 'card'],
    reply: () => `We accept Cash on Delivery, UPI and Card — choose one on the checkout page.` },

  { patterns: ['how to order', 'how do i order', 'place an order', 'how does this work'],
    reply: () => `Pick Food or Instamart → open a restaurant/store → Add items → open your Cart (apply a coupon if you have one) → Checkout. Then track it live from My Orders.` },

  { patterns: ['what restaurants', 'which restaurants', 'restaurant options', 'list restaurants'],
    reply: () => {
      const n = getVendorNames('food');
      return n.length ? { reply: `Top restaurants right now: ${n.join(', ')}.`, items: [{ text: 'Browse all restaurants', url: '/browse/food' }] } : `Check the Food section for restaurants.`;
    } },

  { patterns: ['what stores', 'which stores', 'grocery options', 'instamart options', 'list stores'],
    reply: () => {
      const n = getVendorNames('mart');
      return n.length ? { reply: `Instamart stores right now: ${n.join(', ')}.`, items: [{ text: 'Browse Instamart', url: '/browse/mart' }] } : `Check the Instamart section for stores.`;
    } },

  { patterns: ['create account', 'sign up', 'register', 'how to login', 'forgot password'],
    reply: () => `Create an account from the Sign Up page with your name, email and a password. There's no password reset in this demo — just register a fresh account if needed.` },

  { patterns: ['thank', 'thanks', 'thank you'], reply: () => `You're welcome! Anything else I can help with?` },
  { patterns: ['bye', 'goodbye', 'see you'], reply: () => `Goodbye! Enjoy your meal. 🍽️` },

  // dish ideas: "recommend something veg under 200", "I'm hungry", "suggest a cheap dinner"
  { patterns: ['recommend', 'suggest', 'suggestion', 'hungry', 'craving', 'what should i eat', 'what can i eat', 'what to eat', 'what should i order', 'cheap', 'budget', 'popular', 'best', 'top rated'],
    reply: (ctx, text) => recommend(text, true) },
];

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function matches(text, p) {
  const re = new RegExp('\\b' + esc(p) + (p.length <= 3 ? '\\b' : ''));
  return re.test(text);
}

const fallback = `I'm not sure about that one. Try: "veg under ₹200", "recommend a pizza", "my order status", "coupons", or "delivery fee".`;

function getReply(message, ctx) {
  const text = message.toLowerCase().trim();
  for (const rule of rules) {
    if (rule.patterns.some(p => matches(text, p))) {
      const out = rule.reply(ctx, text);
      if (out) return typeof out === 'string' ? { reply: out } : out;
    }
  }
  // no rule matched: treat it as a dish search ("paneer", "pizza under 300", "veg snacks")
  const dish = recommend(text, false);
  if (dish) return dish;
  return { reply: fallback };
}

router.post('/api/chat', (req, res) => {
  const message = String((req.body && req.body.message) || '').slice(0, 300);
  if (!message.trim()) return res.json({ reply: "Say something and I'll try to help! 🙂" });
  const ctx = { userId: req.session.user ? req.session.user.id : null };
  res.json(getReply(message, ctx));
});

module.exports = router;
