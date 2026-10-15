const express = require('express');
const session = require('express-session');
const path = require('path');
const methodOverride = require('method-override');

require('./db/database'); // ensures schema is created
// Auto-seed if the database is empty — important on hosts with ephemeral/reset
// storage, so the site is never blank after a redeploy or restart. Safe to run
// on every boot: seed.js skips itself if vendors already exist.
require('./db/seed');

const app = express();
const isProd = process.env.NODE_ENV === 'production';

// Required when running behind a hosting platform's reverse proxy (Render, Railway,
// etc.) — without this, Express can't correctly detect HTTPS, which breaks secure cookies.
app.set('trust proxy', 1);

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
if (process.env.DATA_DIR) app.use('/images/uploads', express.static(path.join(process.env.DATA_DIR, 'uploads')));
app.use(express.static(path.join(__dirname, 'public')));

app.use(session({
  secret: process.env.SESSION_SECRET || 'zappyeats-secret-key-change-in-production',
  resave: false,
  saveUninitialized: true,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24, // 1 day
    secure: isProd // only send cookies over HTTPS once deployed
  }
}));

app.use(require('./routes/auth'));
app.use(require('./routes/customer'));
app.use(require('./routes/admin'));
app.use(require('./routes/chatbot'));

app.use((req, res) => {
  res.status(404).render('404');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ZappyEats running on port ${PORT}${isProd ? ' (production)' : ' — http://localhost:' + PORT}`);
});
