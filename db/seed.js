const fs = require('fs');
const path = require('path');
const bcrypt = require('bcryptjs');
const db = require('./database');

const DATA_FILE = path.join(__dirname, 'seed-data.json');

const vendorCount = db.prepare('SELECT COUNT(*) c FROM vendors').get().c;

if (vendorCount === 0) {
  console.log('Seeding database...');

  const insertVendor = db.prepare(`INSERT INTO vendors (mode,name,category,description,rating,delivery_time,image_emoji,image_url,color) VALUES (?,?,?,?,?,?,?,?,?)`);
  const insertProduct = db.prepare(`INSERT INTO products (vendor_id,name,description,price,unit,category,image_emoji,image_url,veg) VALUES (?,?,?,?,?,?,?,?,?)`);

  if (fs.existsSync(DATA_FILE)) {
    // Your own exported data (vendors + products + image paths)
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    for (const v of data.vendors) {
      const info = insertVendor.run(v.mode, v.name, v.category, v.description, v.rating, v.delivery_time, v.image_emoji, v.image_url || null, v.color);
      if (v.is_active === 0) db.prepare('UPDATE vendors SET is_active=0 WHERE id=?').run(info.lastInsertRowid);
      for (const p of v.products) {
        const pi = insertProduct.run(info.lastInsertRowid, p.name, p.description, p.price, p.unit, p.category, p.image_emoji, p.image_url || null, p.veg);
        if (p.is_available === 0) db.prepare('UPDATE products SET is_available=0 WHERE id=?').run(pi.lastInsertRowid);
      }
    }
    console.log('Loaded vendors/products from db/seed-data.json');
  } else {
    // Real photo URLs via LoremFlickr (keyword-tagged, free to hotlink, lock= keeps it consistent instead of random)
    const img = (keyword, lock) => `https://loremflickr.com/480/300/${keyword}?lock=${lock}`;
    let itemLock = 200; // separate lock range from vendor banners (100s)
    const itemImg = (keyword) => img(keyword, itemLock++);

    // ---- FOOD restaurants ----
    const restaurants = [
      ['Spice Route Kitchen', 'North Indian', 'Rich curries and tandoori classics', 4.3, '28 mins', '🍛', img('indian-curry', 101), '#D9455F'],
      ['Momo Cloud', 'Tibetan · Chinese', 'Steamed momos and noodle bowls', 4.5, '22 mins', '🥟', img('dumplings', 102), '#3E8EC9'],
      ['Pizza Forge', 'Italian · Pizza', 'Wood-fired pizzas, fresh out the oven', 4.2, '32 mins', '🍕', img('pizza', 103), '#E08A2C'],
      ['Southern Leaf', 'South Indian', 'Dosas, idlis and filter coffee', 4.6, '20 mins', '🥞', img('dosa', 104), '#3E9E6B'],
      ['Burger Barn', 'American · Burgers', 'Juicy grilled burgers and fries', 4.1, '25 mins', '🍔', img('burger', 105), '#C9563E'],
      ['Sushi Origami', 'Japanese', 'Fresh sushi rolls and bento boxes', 4.7, '35 mins', '🍣', img('sushi', 106), '#6C3EC9'],
    ];
    const foodMenus = {
      'Spice Route Kitchen': [
        ['Butter Chicken', 'Creamy tomato curry with tandoori chicken', 289, 'Chicken', 0, 'butter-chicken'],
        ['Paneer Tikka Masala', 'Grilled paneer in spiced gravy', 249, 'Paneer', 1, 'paneer-tikka'],
        ['Dal Makhani', 'Slow-cooked black lentils with butter', 199, 'Dal', 1, 'dal-makhani'],
        ['Garlic Naan', 'Tandoor-baked flatbread', 59, 'Bread', 1, 'naan-bread'],
        ['Chicken Biryani', 'Aromatic basmati rice with spiced chicken', 259, 'Rice', 0, 'biryani'],
      ],
      'Momo Cloud': [
        ['Chicken Steamed Momos', '8 pcs with spicy chutney', 179, 'Momos', 0, 'momos'],
        ['Veg Fried Momos', '8 pcs pan fried', 149, 'Momos', 1, 'fried-dumplings'],
        ['Hakka Noodles', 'Wok tossed vegetable noodles', 169, 'Noodles', 1, 'noodles'],
        ['Chilli Paneer', 'Crispy paneer in chilli garlic sauce', 219, 'Starters', 1, 'chilli-paneer'],
      ],
      'Pizza Forge': [
        ['Margherita', 'Classic tomato, mozzarella, basil', 249, '10 inch', 1, 'margherita-pizza'],
        ['Farmhouse', 'Loaded with garden veggies', 299, '10 inch', 1, 'vegetable-pizza'],
        ['Pepperoni Blast', 'Double pepperoni, extra cheese', 349, '10 inch', 0, 'pepperoni-pizza'],
        ['Garlic Breadsticks', 'Cheesy garlic breadsticks', 129, '6 pcs', 1, 'breadsticks'],
      ],
      'Southern Leaf': [
        ['Masala Dosa', 'Crispy dosa with potato filling', 129, 'Dosa', 1, 'masala-dosa'],
        ['Idli Sambar', '4 pcs with sambar and chutney', 99, 'Idli', 1, 'idli'],
        ['Filter Coffee', 'South Indian filter coffee', 49, 'Beverage', 1, 'filter-coffee'],
        ['Rava Uttapam', 'Semolina pancake with onions', 119, 'Uttapam', 1, 'uttapam'],
      ],
      'Burger Barn': [
        ['Classic Cheeseburger', 'Beef-style patty with cheddar', 189, 'Burger', 0, 'cheeseburger'],
        ['Crispy Veg Burger', 'Crunchy vegetable patty burger', 159, 'Burger', 1, 'veg-burger'],
        ['Loaded Fries', 'Fries with cheese sauce and jalapenos', 149, 'Sides', 1, 'loaded-fries'],
        ['Cold Coffee Shake', 'Thick cold coffee shake', 99, 'Beverage', 1, 'milkshake'],
      ],
      'Sushi Origami': [
        ['California Roll', '8 pcs crab, avocado, cucumber', 349, 'Rolls', 0, 'california-roll'],
        ['Veg Tempura Roll', '8 pcs crispy vegetable tempura', 299, 'Rolls', 1, 'tempura'],
        ['Salmon Nigiri', '4 pcs fresh salmon nigiri', 399, 'Nigiri', 0, 'salmon-nigiri'],
        ['Miso Soup', 'Traditional soybean soup', 89, 'Soup', 1, 'miso-soup'],
      ],
    };

    for (const [name, category, description, rating, dtime, emoji, imageUrl, color] of restaurants) {
      const info = insertVendor.run('food', name, category, description, rating, dtime, emoji, imageUrl, color);
      const vid = info.lastInsertRowid;
      for (const [pname, pdesc, price, pcat, veg, keyword] of foodMenus[name]) {
        insertProduct.run(vid, pname, pdesc, price, '1 plate', pcat, veg ? '🥗' : '🍗', itemImg(keyword), veg);
      }
    }

    // ---- MART (Instamart-style) stores ----
    const marts = [
      ['QuickMart Essentials', 'Groceries', 'Daily essentials delivered in minutes', 4.4, '12 mins', '🛒', img('grocery-store', 107), '#2C8E6E'],
      ['FreshBasket', 'Fruits & Vegetables', 'Farm-fresh produce', 4.5, '15 mins', '🥦', img('vegetables', 108), '#5FA33E'],
      ['DairyDrop', 'Dairy & Bakery', 'Milk, bread, eggs and more', 4.3, '10 mins', '🥛', img('dairy', 109), '#3E7EC9'],
      ['SnackHive', 'Snacks & Beverages', 'Chips, drinks and munchies', 4.2, '14 mins', '🍟', img('snacks', 110), '#C98E3E'],
    ];
    const martItems = {
      'QuickMart Essentials': [
        ['Basmati Rice 5kg', 'Premium long grain rice', 449, 'pack', 'Staples', 'rice-bag'],
        ['Toor Dal 1kg', 'Whole yellow lentils', 129, 'pack', 'Staples', 'lentils'],
        ['Sunflower Oil 1L', 'Refined cooking oil', 159, 'bottle', 'Staples', 'cooking-oil'],
        ['Sugar 1kg', 'Refined white sugar', 49, 'pack', 'Staples', 'sugar'],
        ['Salt 1kg', 'Iodised table salt', 25, 'pack', 'Staples', 'salt'],
      ],
      'FreshBasket': [
        ['Tomatoes 1kg', 'Fresh red tomatoes', 39, 'kg', 'Vegetables', 'tomatoes'],
        ['Bananas (Dozen)', 'Ripe yellow bananas', 59, 'dozen', 'Fruits', 'bananas'],
        ['Onions 1kg', 'Fresh onions', 35, 'kg', 'Vegetables', 'onions'],
        ['Apples 1kg', 'Crisp red apples', 179, 'kg', 'Fruits', 'apples'],
        ['Spinach Bunch', 'Fresh leafy spinach', 25, 'bunch', 'Vegetables', 'spinach'],
      ],
      'DairyDrop': [
        ['Toned Milk 1L', 'Fresh toned milk', 58, 'litre', 'Dairy', 'milk-bottle'],
        ['Brown Bread', 'Whole wheat bread loaf', 45, 'pack', 'Bakery', 'bread-loaf'],
        ['Farm Eggs (6)', 'Fresh whole eggs', 48, 'pack', 'Dairy', 'eggs'],
        ['Paneer 200g', 'Fresh cottage cheese', 89, 'pack', 'Dairy', 'paneer'],
        ['Butter 100g', 'Salted table butter', 55, 'pack', 'Dairy', 'butter'],
      ],
      'SnackHive': [
        ['Potato Chips', 'Classic salted chips', 30, 'pack', 'Snacks', 'potato-chips'],
        ['Cola 750ml', 'Chilled soft drink', 40, 'bottle', 'Beverages', 'soda-bottle'],
        ['Choco Cookies', 'Crunchy chocolate chip cookies', 60, 'pack', 'Snacks', 'cookies'],
        ['Namkeen Mix 200g', 'Spicy Indian snack mix', 55, 'pack', 'Snacks', 'indian-snacks'],
      ],
    };

    for (const [name, category, description, rating, dtime, emoji, imageUrl, color] of marts) {
      const info = insertVendor.run('mart', name, category, description, rating, dtime, emoji, imageUrl, color);
      const vid = info.lastInsertRowid;
      for (const [pname, pdesc, price, unit, pcat, keyword] of martItems[name]) {
        insertProduct.run(vid, pname, pdesc, price, unit, pcat, '🛍️', itemImg(keyword), 1);
      }
    }

  }

  // ---- Admin account ----
  // On a public site set ADMIN_EMAIL and ADMIN_PASSWORD in your hosting dashboard so the default login is never used.
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@zappyeats.com';
  const adminPlain = process.env.ADMIN_PASSWORD || 'admin123';
  const adminPass = bcrypt.hashSync(adminPlain, 10);
  db.prepare('INSERT INTO admins (name,email,password) VALUES (?,?,?)').run('Admin', adminEmail, adminPass);

  // ---- Demo customer ----
  const userPass = bcrypt.hashSync('demo1234', 10);
  db.prepare('INSERT INTO users (name,email,password,phone,address) VALUES (?,?,?,?,?)')
    .run('Demo User', 'demo@zappyeats.com', userPass, '9876543210', '221B Baker Street, Mumbai');

  console.log('Seeding complete.');
  console.log(process.env.ADMIN_PASSWORD ? 'Admin login -> ' + adminEmail + ' (password from ADMIN_PASSWORD)' : 'Admin login -> admin@zappyeats.com / admin123 (default - change before publishing)');
  console.log('Demo user login -> demo@zappyeats.com / demo1234');
} else {
  console.log('Database already seeded, skipping.');
}
