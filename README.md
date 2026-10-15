# ZappyEats — Food Delivery & Instant Grocery Platform

A full-stack web application inspired by Swiggy + Swiggy Instamart, built as a BCA final-year project.
Customers can order from restaurants ("Food" mode) or shop groceries/essentials ("Instamart" mode) from
a single platform. Includes a customer-facing storefront and a separate admin panel to manage vendors,
products, and orders.

## Tech Stack

| Layer      | Technology                          |
|------------|--------------------------------------|
| Backend    | Node.js + Express.js                 |
| Templating | EJS (server-side rendered views)     |
| Database   | SQLite (via `better-sqlite3`)        |
| Auth       | express-session + bcryptjs (hashed passwords) |
| Styling    | Hand-written CSS (no framework)      |

SQLite was chosen so the project runs anywhere with zero external setup — no MySQL/XAMPP server needed.
The whole database lives in a single file: `db/zappyeats.db`.

## Project Structure

```
zappyeats/
├── server.js              # App entry point
├── package.json
├── db/
│   ├── schema.sql          # Table definitions
│   ├── database.js         # DB connection + auto-migration
│   ├── seed.js              # Sample data (restaurants, mart stores, products, admin, demo user)
│   └── zappyeats.db         # SQLite database file (created on first run)
├── routes/
│   ├── auth.js              # Customer register/login/logout
│   ├── customer.js          # Browse, vendor menu, cart, checkout, orders
│   └── admin.js              # Admin login + vendor/product/order management
├── middleware/
│   └── auth.js               # requireLogin / requireAdmin guards
├── views/                    # EJS templates
│   ├── partials/              # header, footer, admin sidebar
│   └── admin/                  # admin panel pages
└── public/
    └── css/style.css          # All styling
```

## How to Run

1. Install dependencies:
   ```
   npm install
   ```
2. Seed the database (only needed once — it skips itself if data already exists):
   ```
   npm run seed
   ```
3. Start the server:
   ```
   npm start
   ```
4. Open **http://localhost:3000** in your browser.

## Demo Logins

| Role     | Email                  | Password   |
|----------|-------------------------|------------|
| Customer | demo@zappyeats.com      | demo1234   |
| Admin    | admin@zappyeats.com     | admin123   |

Admin panel: **http://localhost:3000/admin/login**

You can also register a brand-new customer account from the Sign Up page.

## Core Features

**Customer**
- Choose between Food delivery or Instamart (grocery) mode
- Browse restaurants/stores with search
- View menus grouped by category, add items to cart
- Cart with quantity controls and live totals (subtotal + delivery fee)
- Checkout with delivery address and payment method selection
- Order confirmation page and full order history

**Admin**
- Secure separate login
- Dashboard with key stats (vendors, products, orders, revenue)
- Add / edit / delete vendors (restaurants or mart stores)
- Add / edit / delete products, linked to a vendor
- View all orders and update their status (Placed → Confirmed → Preparing → Out for Delivery → Delivered / Cancelled)

## Database Schema (summary)

- **users** — customer accounts
- **admins** — admin accounts
- **vendors** — restaurants (`mode='food'`) or grocery stores (`mode='mart'`)
- **products** — items belonging to a vendor
- **orders** — one order per checkout, linked to a user and a vendor
- **order_items** — line items within an order (product name/price snapshotted at order time)

## Notes for the Project Report

- Passwords are never stored in plain text — they're hashed with bcrypt.
- Sessions are used to track logged-in customers/admins and the in-progress cart.
- The cart is tied to a single vendor at a time (matches how real food-delivery apps work) — adding
  an item from a different restaurant/store replaces the cart.
- This is a demo/learning project — payment is simulated (no real payment gateway is integrated).

## Possible Extensions (future scope)

- Real payment gateway integration (Razorpay/Stripe test mode)
- Live order tracking with a status timeline
- Ratings & reviews per vendor
- Image uploads for products/vendors instead of emoji icons
- Deployment to a cloud host (Render, Railway, etc.) with a persistent database

## Images & Data Persistence (read before hosting)

Photos can come from three places: an uploaded file (saved in `public/images/uploads/`), a pasted link, or the
emoji fallback. Pasted links can break later, so before hosting do this on your own computer:

1. `npm run localize-images` - downloads every linked photo into `public/images/` and points the database at the local copy.
   It prints a list of any links that failed, so you can re-upload those from the admin panel.
2. `npm run export-seed` - saves all vendors, products and image paths into `db/seed-data.json`.
3. Deploy the whole project folder (including `public/images/` and `db/seed-data.json`).

On a fresh or reset host, the app automatically rebuilds itself from `db/seed-data.json`.
Orders and new customer accounts are not part of the export (they live only in the live database).

## New in this version

- **Red theme + dark mode:** the moon/sun button in the header switches modes and remembers your choice.
- **Landing page:** rotating offer banners (they show your real active coupons) and category circles that search by dish.
- **Coupons:** customers apply codes in the cart or at checkout (percent or flat, minimum order, max discount, expiry). Admin manages them under *Coupons*. Default codes: `WELCOME50`, `FLAT100`, `SAVE20`.
- **Order tracking:** each order has a timeline (Placed → Confirmed → Preparing → Out for Delivery → Delivered). It updates by itself when the admin changes the status.
- **Favourites:** heart button on restaurants, stores and dishes, plus a *Favourites* page.
- **Chat assistant:** recommends dishes ("veg under ₹200", "recommend a pizza"), lists coupons, links to order tracking.
- **Admin:** sales charts (last 7 days revenue, top-selling items, Food vs Instamart), change email/password page, coupon manager.
- **Extras:** loading shimmer for photos, full footer, About page, custom 404 page.

Upgrading from an older version: copy your old `db/zappyeats.db` into the new project's `db/` folder. The app adds the new
tables and columns automatically, so your vendors, products, users and orders are kept.

## Publishing (Render)

Set these environment variables on the host: `NODE_ENV=production`, `SESSION_SECRET=<long random text>`,
`ADMIN_EMAIL=<your admin email>`, `ADMIN_PASSWORD=<your strong password>`, `NODE_VERSION=22`.
Build command: `npm install` - Start command: `npm start`.

## Static demo for GitHub Pages / Netlify

The real app needs a Node server, so it cannot run on static hosts. `npm run build-static` creates a browser-only
copy in `static-demo/` (restaurants, menus, photos, cart, coupons, order tracking, favourites, dark mode, chat assistant).
There is no login, admin panel or shared database in that copy: cart, favourites and orders are saved in the visitor's browser.

1. Run `npm run localize-images` (optional but recommended, so photos live inside the project)
2. Run `npm run build-static`
3. Upload everything inside `static-demo/` to GitHub Pages or drag the folder onto Netlify Drop.

## Publishing on Railway

1. Push the project to GitHub (keep `public/images/` and `db/seed-data.json`).
2. Railway: New Project -> Deploy from GitHub repo -> pick the repo.
3. Variables: `NODE_ENV=production`, `SESSION_SECRET=<long random text>`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`.
4. Settings -> Networking -> Generate Domain.
5. Optional, to keep orders/accounts/uploads between restarts: add a Volume mounted at `/data` and set `DATA_DIR=/data`.
   (The database then lives in `/data/zappyeats.db` and admin uploads in `/data/uploads`.)
