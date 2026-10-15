-- ZappyEats database schema

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  phone TEXT,
  address TEXT,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS admins (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL
);

-- vendors: restaurants (mode='food') or grocery/mart stores (mode='mart')
CREATE TABLE IF NOT EXISTS vendors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  mode TEXT NOT NULL CHECK(mode IN ('food','mart')),
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  rating REAL DEFAULT 4.0,
  delivery_time TEXT DEFAULT '30 mins',
  image_emoji TEXT DEFAULT '🍽️',
  image_url TEXT,
  color TEXT DEFAULT '#6C3EC9',
  is_active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vendor_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL,
  unit TEXT DEFAULT '',
  category TEXT,
  image_emoji TEXT DEFAULT '🍔',
  image_url TEXT,
  veg INTEGER DEFAULT 1,
  is_available INTEGER DEFAULT 1,
  FOREIGN KEY (vendor_id) REFERENCES vendors(id)
);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  vendor_id INTEGER NOT NULL,
  mode TEXT NOT NULL,
  total REAL NOT NULL,
  delivery_fee REAL DEFAULT 0,
  address TEXT NOT NULL,
  payment_method TEXT DEFAULT 'Cash on Delivery',
  status TEXT DEFAULT 'Placed',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (vendor_id) REFERENCES vendors(id)
);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL,
  product_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  price REAL NOT NULL,
  quantity INTEGER NOT NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE IF NOT EXISTS coupons (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT UNIQUE NOT NULL,
  description TEXT,
  type TEXT NOT NULL CHECK(type IN ('percent','flat')),
  value REAL NOT NULL,
  min_order REAL DEFAULT 0,
  max_discount REAL DEFAULT 0,
  is_active INTEGER DEFAULT 1,
  expires_at TEXT,
  times_used INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS favourites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('vendor','product')),
  ref_id INTEGER NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, kind, ref_id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);
