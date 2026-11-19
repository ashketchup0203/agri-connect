// =========================================
// AGRI CONNECT SERVER
// Shows the website pages and talks to the database.
// Start it from VS Code: NPM Scripts > start
// =========================================
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const db = require('./db');   // also loads .env

const app = express();
const ROOT = __dirname;

// ---------- Folders for uploaded files ----------
// Product photos are public (shown on the site).
// Certificates and vet records are private (never served to visitors).
const PHOTO_DIR = path.join(ROOT, 'uploads', 'products');
const DOCUMENT_DIR = path.join(ROOT, 'private_uploads');
fs.mkdirSync(PHOTO_DIR, { recursive: true });
fs.mkdirSync(DOCUMENT_DIR, { recursive: true });

// ---------- General setup ----------
if (!process.env.SESSION_SECRET) {
  console.warn('Warning: SESSION_SECRET is missing from .env, using a temporary one. Users will be signed out when the server restarts.');
}

app.use(express.json());
app.use(session({
  name: 'agri.sid',
  secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax' }
}));

// ---------- Website files ----------
// The pages live in the main project folder, next to server.js.
// Only these are shared with visitors: .html pages and images in the main folder,
// plus the css, js, img and uploads folders. Everything else (server.js, db.js,
// .env, scripts, node_modules, private_uploads) is never sent to the browser.
const PUBLIC_FILE = /^\/(?:$|[^/]+\.(?:html|png|jpe?g|webp|svg|ico)$|(?:css|js|img|uploads)\/[^]+)$/i;
const staticFiles = express.static(ROOT, { dotfiles: 'ignore', index: 'index.html' });

app.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') return next();
  if (req.path.startsWith('/api/')) return next();
  if (!PUBLIC_FILE.test(req.path) || req.path.includes('..')) return next();
  staticFiles(req, res, next);
});


// =========================================
// HELPERS
// =========================================

const PARISHES = ['Clarendon', 'Hanover', 'Kingston', 'Manchester', 'Portland', 'St. Andrew', 'St. Ann',
  'St. Catherine', 'St. Elizabeth', 'St. James', 'St. Mary', 'St. Thomas', 'Trelawny', 'Westmoreland'];

// Password rule used everywhere: at least 1 number and 1 special character
function passwordMeetsRule(password) {
  return /[0-9]/.test(password) && /[^A-Za-z0-9\s]/.test(password);
}

// Loads the signed-in user, plus their customer or farmer details
async function loadUser(userId) {
  const [rows] = await db.query(
    `SELECT u.User_id, u.F_name, u.L_name, u.Email, u.Phone_num, u.Parish, u.Role,
            c.Customer_id, f.Farmer_id, f.Farm_parish, f.Farm_name, r.Verif_status
     FROM \`User\` u
     LEFT JOIN Customer c ON c.User_id = u.User_id
     LEFT JOIN Farmer f ON f.User_id = u.User_id
     LEFT JOIN RADA_Record r ON r.Farmer_id = f.Farmer_id
     WHERE u.User_id = ?`,
    [userId]
  );
  if (rows.length === 0) return null;

  const row = rows[0];
  return {
    id: row.User_id,
    firstName: row.F_name,
    lastName: row.L_name,
    email: row.Email,
    phone: row.Phone_num,
    parish: row.Parish,
    role: row.Role,
    customerId: row.Customer_id || null,
    farmer: row.Farmer_id ? {
      farmerId: row.Farmer_id,
      farmName: row.Farm_name,
      farmParish: row.Farm_parish,
      verifStatus: row.Verif_status || 'Pending',
      verified: row.Verif_status === 'Verified'
    } : null
  };
}

// Where each kind of user goes after signing in
function homePageFor(user) {
  if (user.role === 'Farmer' && user.farmer) return 'overview.html';   // the farmer hub
  return 'index.html';
}

// Signs the user in by starting a fresh session
function startSession(req, userId, remember) {
  return new Promise((resolve, reject) => {
    req.session.regenerate(err => {
      if (err) return reject(err);
      req.session.userId = userId;
      if (remember) req.session.cookie.maxAge = 30 * 24 * 60 * 60 * 1000;   // 30 days
      req.session.save(saveErr => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

// Stops the request unless a farmer is signed in (any farmer, verified or not)
async function requireFarmer(req, res, next) {
  try {
    if (!req.session.userId) return res.status(401).json({ error: 'Please sign in.' });
    const user = await loadUser(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Please sign in again.' });
    }
    if (user.role !== 'Farmer' || !user.farmer) {
      return res.status(403).json({ error: 'Only farmer accounts can use the farmer hub.' });
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

// Stops the request unless a verified farmer is signed in
async function requireVerifiedFarmer(req, res, next) {
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Please sign in to create a listing.' });
    }
    const user = await loadUser(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.status(401).json({ error: 'Please sign in again.' });
    }
    if (user.role !== 'Farmer' || !user.farmer) {
      return res.status(403).json({ error: 'Only farmer accounts can create listings.' });
    }
    if (!user.farmer.verified) {
      return res.status(403).json({ error: 'Your farm must be RADA verified before you can publish listings.' });
    }
    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}

// Deletes files that were uploaded for a listing that could not be saved
function removeUploadedFiles(req) {
  const groups = Object.values(req.files || {});
  for (const files of groups) {
    for (const file of files) fs.unlink(file.path, () => {});
  }
}

const SHORT_DATE = { day: 'numeric', month: 'short', year: 'numeric' };
const LONG_DATE = { day: 'numeric', month: 'long', year: 'numeric' };
function formatDate(value, options) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  return date.toLocaleDateString('en-GB', { ...options, timeZone: 'UTC' });
}


// =========================================
// PRODUCTS: database rows -> what the pages show
// =========================================
const PRODUCT_SELECT = `
  SELECT p.Product_id, p.Name, p.Category, p.Subcategory, p.Tag, p.Quantity, p.Price, p.Image,
         p.Description, p.Unit, p.Parish, p.Pickup_location, p.Farm_pickup, p.Delivery, p.Status,
         f.Farmer_id, f.Farm_name, u.F_name, u.L_name, r.Verif_status,
         c.Product_id AS Crop_id, c.Variety, c.Harvest_date, c.Growing_method, c.Min_order,
         c.Grade, c.Spray_use, c.Storage, c.Packaging,
         l.Product_id AS Livestock_id, l.Species_breed, l.Sex, l.Age, l.Live_weight,
         l.Animal_id, l.Health, l.Transport
  FROM Product p
  JOIN Farmer f ON f.Farmer_id = p.Farmer_id
  JOIN \`User\` u ON u.User_id = f.User_id
  LEFT JOIN RADA_Record r ON r.Farmer_id = f.Farmer_id
  LEFT JOIN Crop_Detail c ON c.Product_id = p.Product_id
  LEFT JOIN Livestock_Detail l ON l.Product_id = p.Product_id`;

function toDisplayProduct(row) {
  const isLivestock = row.Category === 'Livestock';
  const fullName = `${row.F_name} ${row.L_name}`;
  const verified = row.Verif_status === 'Verified';

  let harvestDate = 'Ready for pickup';
  let farmDesc = row.Description || '';
  let labels = ['VARIETY', 'GROWING METHOD', 'HARVEST DATE', 'STORAGE'];
  let details = ['—', '—', '—', '—'];

  if (row.Livestock_id) {
    // Live animals
    labels = ['BREED', 'AGE', 'WEIGHT', 'HEALTH'];
    details = [
      row.Species_breed || '—',
      row.Age || '—',
      row.Live_weight ? `${Number(row.Live_weight)} kg` : '—',
      row.Health || '—'
    ];
    farmDesc = [row.Health, row.Transport].filter(Boolean).join('. ') || farmDesc;
  } else if (row.Crop_id) {
    // Crops, and animal products such as eggs, pork and cheese
    if (isLivestock) labels = ['PRODUCT', 'METHOD', 'DATE', 'STORAGE'];
    details = [
      row.Variety || '—',
      row.Growing_method || '—',
      formatDate(row.Harvest_date, SHORT_DATE) || '—',
      row.Storage || '—'
    ];
    harvestDate = `${isLivestock ? 'Prepared' : 'Harvested'} ${formatDate(row.Harvest_date, LONG_DATE)}`;
    farmDesc = row.Spray_use || farmDesc;
  }

  return {
    id: row.Product_id,
    title: row.Name,
    tag: row.Tag || (isLivestock ? 'Health checked' : 'Freshly harvested'),
    price: Number(row.Price),
    unit: row.Unit || (isLivestock ? 'head' : 'lb'),
    parish: row.Parish || '',
    categoryGroup: row.Category,
    category: row.Subcategory ? `${row.Category} - ${row.Subcategory}` : row.Category,
    description: row.Description || '',
    stock: row.Quantity,
    minOrder: row.Min_order || 1,
    image: row.Image || 'img/png_ver/logo2.png',
    harvestDate,
    harvestLoc: `From ${row.Farm_name || fullName} in ${row.Parish || 'Jamaica'}.`,
    farmerFarm: row.Farm_name || fullName,
    farmerName: `${fullName} · ${verified ? 'Verified farmer' : 'Farmer'}`,
    farmerInitials: `${row.F_name.charAt(0)}${row.L_name.charAt(0)}`.toUpperCase(),
    farmDesc,
    detailLabels: labels,
    details,
    farmPickup: !!row.Farm_pickup,
    delivery: !!row.Delivery,
    pickupLocation: row.Pickup_location || '',
    verified
  };
}


// =========================================
// FILE UPLOADS (create listing photos and documents)
// =========================================
const IMAGE_TYPES = ['image/jpeg', 'image/png'];
const DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, file.fieldname === 'Image' ? PHOTO_DIR : DOCUMENT_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase().replace(/[^.a-z0-9]/g, '');
      cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`);
    }
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 7 },   // 10 MB each
  fileFilter: (req, file, cb) => {
    const allowed = file.fieldname === 'Image' ? IMAGE_TYPES : DOCUMENT_TYPES;
    if (allowed.includes(file.mimetype)) return cb(null, true);
    const err = new Error(file.fieldname === 'Image'
      ? 'Photos must be JPG or PNG files.'
      : 'Documents must be PDF, JPG or PNG files.');
    err.status = 400;
    cb(err);
  }
});

const listingUploads = upload.fields([
  { name: 'Image', maxCount: 5 },
  { name: 'Crop_document', maxCount: 1 },
  { name: 'Vet_record', maxCount: 1 }
]);


// =========================================
// LISTING VALIDATION
// =========================================
const UNITS = {
  Crops: ['lb', 'kg', 'dozen', 'bunch', 'bundle', 'head', 'crate'],
  Livestock: ['head', 'pair', 'lot', 'bird', 'lb', 'dozen']
};
const GRADES = ['Grade A · Large, unblemished', 'Grade B · Medium, minor marks', 'Mixed sizes', 'Processing grade'];
const SEXES = ['Male', 'Female', 'Mixed (group)'];
const METHODS = ['', 'Conventional', 'Organic', 'Greenhouse', 'Hydroponic'];

// Checks the form on the server too, so bad data can never reach the database.
// Returns { errors: [...field names], values: {...cleaned values} }
function validateListing(body) {
  const errors = [];
  const text = (name, max) => {
    const value = (body[name] || '').toString().trim();
    return max ? value.slice(0, max) : value;
  };
  const required = (name, value) => { if (!value) errors.push(name); return value; };
  const positiveNumber = (name, isInteger) => {
    const value = Number(body[name]);
    const ok = Number.isFinite(value) && value > 0 && (!isInteger || Number.isInteger(value));
    if (!ok) errors.push(name);
    return value;
  };
  const oneOf = (name, list, isRequired = true) => {
    const value = text(name);
    if ((isRequired || value) && !list.includes(value)) errors.push(name);
    return value;
  };

  const category = body.Category === 'Livestock' ? 'Livestock' : (body.Category === 'Crops' ? 'Crops' : null);
  if (!category) errors.push('Category');

  const values = {
    category,
    name: required('Name', text('Name', 100)),
    description: required('Description', text('Description', 2000)),
    price: positiveNumber('Price'),
    unit: oneOf('Unit', UNITS[category] || []),
    quantity: positiveNumber('Quantity', true),
    parish: oneOf('Parish', PARISHES),
    pickupLocation: required('Pickup_location', text('Pickup_location', 255)),
    farmPickup: true,   // buyers can always collect from the pickup location
    delivery: oneOf('Delivery', ['Yes', 'No']) === 'Yes'
  };

  if (category === 'Crops') {
    const harvestDate = text('Harvest_date');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(harvestDate) || isNaN(Date.parse(harvestDate))) errors.push('Harvest_date');
    const minOrderText = text('Min_order');
    let minOrder = null;
    if (minOrderText) minOrder = positiveNumber('Min_order', true);

    values.details = {
      variety: required('Variety', text('Variety', 100)),
      harvestDate,
      growingMethod: oneOf('Growing_method', METHODS, false) || null,
      minOrder,
      grade: oneOf('Grade', GRADES),
      sprayUse: required('Spray_use', text('Spray_use', 255)),
      storage: required('Storage', text('Storage', 255)),
      packaging: text('Packaging', 100) || null
    };
  }

  if (category === 'Livestock') {
    values.details = {
      speciesBreed: required('Species_breed', text('Species_breed', 100)),
      sex: oneOf('Sex', SEXES),
      age: required('Age', text('Age', 50)),
      liveWeight: positiveNumber('Live_weight'),
      animalId: text('Animal_id', 50) || null,
      health: required('Health', text('Health', 255)),
      transport: required('Transport', text('Transport', 255))
    };
  }

  return { errors, values };
}


// =========================================
// ROUTES: TESTING
// =========================================

// Open http://localhost:3000/api/test to check the database connection
app.get('/api/test', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT COUNT(*) AS users FROM `User`');
    res.json({ connected: true, users: rows[0].users });
  } catch (err) {
    res.status(500).json({ connected: false, error: err.message });
  }
});


// =========================================
// ROUTES: ACCOUNTS
// =========================================

// Create Account page
app.post('/api/auth/signup', async (req, res, next) => {
  const body = req.body || {};
  const clean = (value, max) => (value || '').toString().trim().slice(0, max);

  const role = body.role === 'farmer' ? 'Farmer' : (body.role === 'buyer' ? 'Customer' : null);
  const firstName = clean(body.firstName, 50);
  const lastName = clean(body.lastName, 50);
  const email = clean(body.email, 100).toLowerCase();
  const phone = clean(body.phone, 20);
  const parish = clean(body.parish, 50);
  const password = (body.password || '').toString();
  const farmName = clean(body.farmName, 100);
  const radaNumber = clean(body.radaNumber, 50);

  const errors = [];
  if (!role) errors.push('role');
  if (!firstName) errors.push('first-name');
  if (!lastName) errors.push('last-name');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.push('email');
  if (!/^[0-9+()\-\s]{7,20}$/.test(phone)) errors.push('phone');
  if (!PARISHES.includes(parish)) errors.push('parish');
  if (password.length < 8 || !passwordMeetsRule(password)) errors.push('password');
  if (role === 'Farmer' && !farmName) errors.push('farm-name');
  if (role === 'Farmer' && !radaNumber) errors.push('rada-number');
  if (body.agreed !== true) errors.push('terms');
  if (errors.length > 0) {
    return res.status(400).json({ error: 'Please check the highlighted fields.', fields: errors });
  }

  let conn;
  try {
    const [existing] = await db.query('SELECT User_id FROM `User` WHERE Email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists. Try signing in instead.', fields: ['email'] });
    }
    if (role === 'Farmer') {
      const [radaTaken] = await db.query('SELECT RADA_id FROM RADA_Record WHERE RADA_reg_num = ?', [radaNumber]);
      if (radaTaken.length > 0) {
        return res.status(409).json({ error: 'This RADA registration number is already linked to an account.', fields: ['rada-number'] });
      }
    }

    const hash = await bcrypt.hash(password, 10);
    conn = await db.getConnection();
    await conn.beginTransaction();

    const [userResult] = await conn.query(
      'INSERT INTO `User` (F_name, L_name, Email, Phone_num, Parish, Role, Password_hash) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [firstName, lastName, email, phone, parish, role, hash]
    );
    const userId = userResult.insertId;

    if (role === 'Customer') {
      await conn.query('INSERT INTO Customer (User_id, Customer_type) VALUES (?, ?)', [userId, 'Individual']);
    } else {
      const [farmerResult] = await conn.query(
        'INSERT INTO Farmer (User_id, Farm_parish, Farm_name) VALUES (?, ?, ?)',
        [userId, parish, farmName]
      );
      // New farmers wait for RADA verification before they can publish
      await conn.query(
        "INSERT INTO RADA_Record (Farmer_id, RADA_reg_num, Verif_status) VALUES (?, ?, 'Pending')",
        [farmerResult.insertId, radaNumber]
      );
    }

    await conn.commit();
    conn.release();
    conn = null;

    await startSession(req, userId, false);
    const user = await loadUser(userId);
    res.status(201).json({ user, redirect: role === 'Farmer' ? 'overview.html' : 'index.html' });
  } catch (err) {
    if (conn) {
      await conn.rollback().catch(() => {});
      conn.release();
    }
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'An account with these details already exists.', fields: ['email'] });
    }
    next(err);
  }
});

// Sign In page
app.post('/api/auth/login', async (req, res, next) => {
  try {
    const email = (req.body.email || '').toString().trim();
    const password = (req.body.password || '').toString();
    const remember = req.body.remember === true;

    if (!email || !password) {
      return res.status(400).json({ error: 'Enter your email address and password.' });
    }

    const [rows] = await db.query('SELECT User_id, Password_hash FROM `User` WHERE Email = ?', [email]);
    const storedHash = rows.length ? rows[0].Password_hash : null;
    const passwordOk = storedHash && storedHash.startsWith('$2')
      ? await bcrypt.compare(password, storedHash)
      : false;

    if (!passwordOk) {
      return res.status(401).json({ error: 'Incorrect email or password.' });
    }

    await startSession(req, rows[0].User_id, remember);
    const user = await loadUser(rows[0].User_id);
    res.json({ user, redirect: homePageFor(user) });
  } catch (err) {
    next(err);
  }
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy(() => {
    res.clearCookie('agri.sid');
    res.json({ ok: true });
  });
});

// Who is signed in? Used by the page headers, create listing and checkout
app.get('/api/me', async (req, res, next) => {
  try {
    // Answers { user: null } when nobody is signed in (not an error)
    if (!req.session.userId) return res.json({ user: null });
    const user = await loadUser(req.session.userId);
    if (!user) {
      req.session.destroy(() => {});
      return res.json({ user: null });
    }
    res.json({ user });
  } catch (err) {
    next(err);
  }
});


// =========================================
// ROUTES: PRODUCTS
// =========================================

// Approved products for the marketplace
app.get('/api/products', async (req, res, next) => {
  try {
    const [rows] = await db.query(`${PRODUCT_SELECT} WHERE p.Status = 'Approved' ORDER BY p.Product_id`);
    res.json(rows.map(toDisplayProduct));
  } catch (err) {
    next(err);
  }
});

// One approved product, with all its photos (product page)
app.get('/api/products/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Product not found.' });

    const [rows] = await db.query(`${PRODUCT_SELECT} WHERE p.Product_id = ? AND p.Status = 'Approved'`, [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Product not found.' });

    const product = toDisplayProduct(rows[0]);
    const [images] = await db.query(
      'SELECT Image_path FROM Product_Image WHERE Product_id = ? ORDER BY Sort_order', [id]);
    product.images = images.length ? images.map(img => img.Image_path) : [product.image];
    res.json(product);
  } catch (err) {
    next(err);
  }
});

// Create a listing (create listing page). Saved as "Pending" until an admin approves it.
app.post('/api/products', requireVerifiedFarmer, listingUploads, async (req, res, next) => {
  const { errors, values } = validateListing(req.body);
  if (errors.length > 0) {
    removeUploadedFiles(req);
    return res.status(400).json({ error: 'Some required fields are missing or invalid.', fields: errors });
  }

  const photos = (req.files && req.files.Image) || [];
  const photoPaths = photos.map(file => `uploads/products/${file.filename}`);
  const documentFile = req.files && (req.files.Crop_document || req.files.Vet_record);
  const documentName = documentFile ? documentFile[0].filename : null;

  let conn;
  try {
    conn = await db.getConnection();
    await conn.beginTransaction();

    const [result] = await conn.query(
      `INSERT INTO Product
         (Farmer_id, Name, Category, Quantity, Price, Image, Description, Unit,
          Parish, Pickup_location, Farm_pickup, Delivery, Status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
      [req.user.farmer.farmerId, values.name, values.category, values.quantity, values.price,
       photoPaths[0] || null, values.description, values.unit, values.parish,
       values.pickupLocation, values.farmPickup, values.delivery]
    );
    const productId = result.insertId;
    const d = values.details;

    if (values.category === 'Crops') {
      await conn.query(
        `INSERT INTO Crop_Detail
           (Product_id, Variety, Harvest_date, Growing_method, Min_order, Grade,
            Spray_use, Storage, Packaging, Certificate_file)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [productId, d.variety, d.harvestDate, d.growingMethod, d.minOrder, d.grade,
         d.sprayUse, d.storage, d.packaging, documentName]
      );
    } else {
      await conn.query(
        `INSERT INTO Livestock_Detail
           (Product_id, Species_breed, Sex, Age, Live_weight, Animal_id, Health, Transport, Vet_record_file)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [productId, d.speciesBreed, d.sex, d.age, d.liveWeight, d.animalId,
         d.health, d.transport, documentName]
      );
    }

    for (let i = 0; i < photoPaths.length; i++) {
      await conn.query(
        'INSERT INTO Product_Image (Product_id, Image_path, Sort_order) VALUES (?, ?, ?)',
        [productId, photoPaths[i], i]
      );
    }

    await conn.commit();
    res.status(201).json({ productId, status: 'Pending' });
  } catch (err) {
    if (conn) await conn.rollback().catch(() => {});
    removeUploadedFiles(req);
    next(err);
  } finally {
    if (conn) conn.release();
  }
});


// =========================================
// ROUTES: REVIEWS (product page, Reviews tab)
// Buyers can review a product once they have ordered it (one review each, which they can change).
// =========================================
async function hasOrdered(customerId, productId) {
  const [rows] = await db.query(
    `SELECT 1 FROM Order_Item oi JOIN \`Order\` o ON o.Order_id = oi.Order_id
     WHERE o.Customer_id = ? AND oi.Product_id = ? AND o.Status <> 'Cancelled' LIMIT 1`,
    [customerId, productId]
  );
  return rows.length > 0;
}

app.get('/api/products/:id/reviews', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Product not found.' });

    const [rows] = await db.query(
      `SELECT r.Rating, r.Comment, TIMESTAMPDIFF(SECOND, r.Created_at, NOW()) AS Age_s,
              r.Customer_id, u.F_name, u.L_name
       FROM Review r
       JOIN Customer c ON c.Customer_id = r.Customer_id
       JOIN \`User\` u ON u.User_id = c.User_id
       WHERE r.Product_id = ?
       ORDER BY r.Created_at DESC, r.Review_id DESC`,
      [id]
    );

    // What the person looking at the page can do
    let canReview = false;
    let myReview = null;
    let reason = 'signed-out';
    const user = req.session.userId ? await loadUser(req.session.userId) : null;
    if (user && user.customerId) {
      canReview = await hasOrdered(user.customerId, id);
      reason = canReview ? null : 'not-ordered';
      const mine = rows.find(r => r.Customer_id === user.customerId);
      if (mine) myReview = { rating: mine.Rating, comment: mine.Comment || '' };
    } else if (user) {
      reason = 'not-buyer';
    }

    const count = rows.length;
    const average = count ? Math.round((rows.reduce((sum, r) => sum + r.Rating, 0) / count) * 10) / 10 : 0;
    res.json({
      count,
      average,
      canReview,
      reason,
      myReview,
      reviews: rows.map(r => ({
        name: `${r.F_name} ${r.L_name.charAt(0)}.`,
        rating: r.Rating,
        comment: r.Comment || '',
        date: jamaicaLabel(new Date(Date.now() - Number(r.Age_s) * 1000), LONG_DATE)
      }))
    });
  } catch (err) {
    next(err);
  }
});

app.post('/api/products/:id/reviews', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) return res.status(404).json({ error: 'Product not found.' });
    if (!req.session.userId) return res.status(401).json({ error: 'Please sign in to leave a review.' });

    const user = await loadUser(req.session.userId);
    if (!user) return res.status(401).json({ error: 'Please sign in again.' });
    if (!user.customerId) return res.status(403).json({ error: 'Only buyer accounts can leave reviews.' });
    if (!(await hasOrdered(user.customerId, id))) {
      return res.status(403).json({ error: 'You can review this product after you have ordered it.' });
    }

    const rating = Number((req.body || {}).rating);
    const comment = ((req.body || {}).comment || '').toString().trim().slice(0, 500);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
      return res.status(400).json({ error: 'Please choose a rating from 1 to 5 stars.' });
    }

    await db.query(
      `INSERT INTO Review (Product_id, Customer_id, Rating, Comment) VALUES (?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE Rating = VALUES(Rating), Comment = VALUES(Comment), Created_at = CURRENT_TIMESTAMP`,
      [id, user.customerId, rating, comment || null]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
});


// =========================================
// ROUTES: NOTIFICATIONS (the bell in the header)
// Each notification has a key; the browser remembers which keys have been seen.
// =========================================
const ORDER_UPDATES = {
  Pending: 'was placed. Waiting for the farmer to confirm.',
  Confirmed: 'was confirmed by the farmer.',
  Shipped: 'is on its way to you.',
  Delivered: 'was delivered. Enjoy, and leave a review!',
  Cancelled: 'was cancelled.'
};

app.get('/api/notifications', async (req, res, next) => {
  try {
    if (!req.session.userId) return res.json({ signedIn: false, items: [] });
    const user = await loadUser(req.session.userId);
    if (!user) return res.json({ signedIn: false, items: [] });
    const items = [];

    if (user.customerId) {
      const [orders] = await db.query(
        `SELECT Order_id, Status, Delivery_method,
                TIMESTAMPDIFF(SECOND, Order_date, NOW()) AS Age_s
         FROM \`Order\` WHERE Customer_id = ? ORDER BY Order_date DESC, Order_id DESC LIMIT 8`,
        [user.customerId]
      );
      for (const o of orders) {
        const text = o.Status === 'Confirmed' && o.Delivery_method === 'Pickup'
          ? 'is ready for farm pickup.'
          : ORDER_UPDATES[o.Status] || `is ${o.Status.toLowerCase()}.`;
        items.push({ key: `order-${o.Order_id}-${o.Status}`, text: `Order ${orderNumber(o.Order_id)} ${text}`, ageSeconds: Number(o.Age_s) });
      }
    }

    if (user.farmer) {
      const farmerId = user.farmer.farmerId;
      const [newOrders] = await db.query(
        `SELECT o.Order_id, u.F_name, u.L_name, TIMESTAMPDIFF(SECOND, o.Order_date, NOW()) AS Age_s
         FROM \`Order\` o
         JOIN Customer c ON c.Customer_id = o.Customer_id
         JOIN \`User\` u ON u.User_id = c.User_id
         WHERE o.Status = 'Pending' AND EXISTS (
           SELECT 1 FROM Order_Item oi JOIN Product p ON p.Product_id = oi.Product_id
           WHERE oi.Order_id = o.Order_id AND p.Farmer_id = ?)
         ORDER BY o.Order_date DESC LIMIT 8`,
        [farmerId]
      );
      for (const o of newOrders) {
        items.push({
          key: `farm-order-${o.Order_id}`,
          text: `New order ${orderNumber(o.Order_id)} from ${o.F_name} ${o.L_name} needs your confirmation.`,
          link: 'overview.html#recent-orders',
          ageSeconds: Number(o.Age_s)
        });
      }
      const [listings] = await db.query(
        `SELECT Product_id, Name, Quantity, Unit, Status, TIMESTAMPDIFF(SECOND, Created_at, NOW()) AS Age_s
         FROM Product WHERE Farmer_id = ? AND (Status = 'Pending' OR (Status = 'Approved' AND Quantity <= ?))
         ORDER BY Product_id DESC LIMIT 8`,
        [farmerId, LOW_STOCK]
      );
      for (const p of listings) {
        items.push(p.Status === 'Pending'
          ? { key: `listing-${p.Product_id}-pending`, text: `Your listing “${p.Name}” is waiting for admin review.`, ageSeconds: Number(p.Age_s) }
          : { key: `listing-${p.Product_id}-low-${p.Quantity}`, text: `“${p.Name}” is running low: ${p.Quantity} ${p.Unit || 'left'}${p.Unit ? ' left' : ''}.`,
              link: `product.html?id=${p.Product_id}`, ageSeconds: null });
      }
      if (!user.farmer.verified) {
        items.push({ key: 'rada-pending', text: 'Your RADA verification is still being reviewed.', ageSeconds: null });
      }
    }

    if (user.role === 'Admin') {
      const [[counts]] = await db.query(
        `SELECT (SELECT COUNT(*) FROM Product WHERE Status = 'Pending') AS listings,
                (SELECT COUNT(*) FROM RADA_Record WHERE Verif_status = 'Pending') AS farmers`
      );
      if (counts.listings) items.push({ key: `admin-listings-${counts.listings}`, text: `${counts.listings} listing(s) waiting for review.`, ageSeconds: null });
      if (counts.farmers) items.push({ key: `admin-rada-${counts.farmers}`, text: `${counts.farmers} farmer(s) waiting for RADA verification.`, ageSeconds: null });
    }

    res.json({ signedIn: true, role: user.role, items });
  } catch (err) {
    next(err);
  }
});


// =========================================
// ROUTES: ORDERS (checkout page)
// =========================================
const DELIVERY_FEE = 800;

app.post('/api/orders', async (req, res, next) => {
  const body = req.body || {};
  const clean = (value, max) => (value || '').toString().trim().slice(0, max);

  let conn;
  try {
    if (!req.session.userId) {
      return res.status(401).json({ error: 'Please sign in to place your order.' });
    }
    const user = await loadUser(req.session.userId);
    if (!user) return res.status(401).json({ error: 'Please sign in again.' });
    if (!user.customerId) {
      return res.status(403).json({ error: 'Only buyer accounts can place orders. Sign in with a buyer account.' });
    }

    // Combine repeated products and check quantities
    const wanted = new Map();
    for (const item of Array.isArray(body.items) ? body.items : []) {
      const id = Number(item.productId);
      const qty = Number(item.quantity);
      if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(qty) || qty <= 0) {
        return res.status(400).json({ error: 'Your basket has an item with an invalid quantity.' });
      }
      wanted.set(id, (wanted.get(id) || 0) + qty);
    }
    if (wanted.size === 0) return res.status(400).json({ error: 'Your basket is empty.' });

    const method = body.deliveryMethod === 'Pickup' ? 'Pickup' : 'Delivery';
    // Home delivery is paid by debit or credit card; farm pickup is paid in cash
    const PAYMENT_METHODS = method === 'Delivery' ? ['Debit card', 'Credit card'] : ['Cash'];
    const paymentMethod = clean(body.paymentMethod, 30);
    const recipient = clean(body.recipientName, 100);
    const phone = clean(body.phone, 20);
    const address = clean(body.address, 255);
    const parish = clean(body.parish, 50);

    const fields = [];
    if (!recipient) fields.push('recipient-name');
    if (!/^[0-9+()\-\s]{7,20}$/.test(phone)) fields.push('recipient-phone');
    if (method === 'Delivery' && !address) fields.push('delivery-address');
    if (method === 'Delivery' && !PARISHES.includes(parish)) fields.push('delivery-parish');
    if (fields.length > 0) {
      return res.status(400).json({ error: 'Please complete your delivery details.', fields });
    }
    if (!PAYMENT_METHODS.includes(paymentMethod)) {
      return res.status(400).json({ error: method === 'Delivery'
        ? 'Please choose debit card or credit card for home delivery.'
        : 'Farm pickup orders are paid in cash.' });
    }

    conn = await db.getConnection();
    await conn.beginTransaction();

    // Lock the products while we check stock, so two buyers can't buy the same last item
    const ids = [...wanted.keys()];
    const [products] = await conn.query(
      `SELECT Product_id, Name, Price, Quantity, Unit, Status, Delivery, Farm_pickup
       FROM Product WHERE Product_id IN (?) FOR UPDATE`,
      [ids]
    );
    const byId = new Map(products.map(p => [p.Product_id, p]));

    const problems = [];
    let subtotal = 0;
    for (const [id, qty] of wanted) {
      const product = byId.get(id);
      if (!product || product.Status !== 'Approved') {
        problems.push('One item in your basket is no longer available.');
      } else if (method === 'Delivery' && !product.Delivery) {
        problems.push(`${product.Name} can't be delivered. Choose farm pickup or remove it.`);
      } else if (method === 'Pickup' && !product.Farm_pickup) {
        problems.push(`${product.Name} isn't available for farm pickup.`);
      } else if (qty > product.Quantity) {
        problems.push(`Only ${product.Quantity} ${product.Unit} of ${product.Name} left.`);
      } else {
        subtotal += qty * Number(product.Price);
      }
    }
    if (problems.length > 0) {
      await conn.rollback();
      return res.status(409).json({ error: problems.join(' ') });
    }

    const deliveryFee = method === 'Delivery' ? DELIVERY_FEE : 0;
    const total = subtotal + deliveryFee;

    const [orderResult] = await conn.query(
      `INSERT INTO \`Order\`
         (Customer_id, Status, Delivery_method, Recipient_name, Recipient_phone,
          Delivery_address, Delivery_parish, Delivery_fee)
       VALUES (?, 'Pending', ?, ?, ?, ?, ?, ?)`,
      [user.customerId, method, recipient, phone,
       method === 'Delivery' ? address : null, method === 'Delivery' ? parish : null, deliveryFee]
    );
    const orderId = orderResult.insertId;

    for (const [id, qty] of wanted) {
      const product = byId.get(id);
      await conn.query(
        'INSERT INTO Order_Item (Order_id, Product_id, Quantity, Order_price) VALUES (?, ?, ?, ?)',
        [orderId, id, qty, product.Price]
      );
      await conn.query('UPDATE Product SET Quantity = Quantity - ? WHERE Product_id = ?', [qty, id]);
    }

    // No real payment processor is connected, so the payment is recorded as Pending.
    // Card details are never sent to the server or stored.
    await conn.query(
      "INSERT INTO Payment (Order_id, Amount, Payment_status, Payment_method) VALUES (?, ?, 'Pending', ?)",
      [orderId, total, paymentMethod]
    );

    await conn.commit();
    res.status(201).json({ orderId, total, status: 'Pending' });
  } catch (err) {
    if (conn) await conn.rollback().catch(() => {});
    next(err);
  } finally {
    if (conn) conn.release();
  }
});


// =========================================
// ROUTES: FARMER HUB (overview.html)
// =========================================
const LOW_STOCK = 10;            // a listing with this many units or fewer is "running low"
const FARM_TIME_ZONE = 'America/Jamaica';
const DAY_MS = 24 * 60 * 60 * 1000;

// "2026-11-18" for the day an instant falls on in Jamaica
function jamaicaDay(date) {
  return date.toLocaleDateString('en-CA', { timeZone: FARM_TIME_ZONE });
}
function jamaicaLabel(date, options) {
  return date.toLocaleDateString('en-GB', { ...options, timeZone: FARM_TIME_ZONE });
}
const orderNumber = id => `AC-${1000 + id}`;

// Everything the overview page shows, for the signed-in farmer
app.get('/api/farmer/overview', requireFarmer, async (req, res, next) => {
  try {
    const farmerId = req.user.farmer.farmerId;
    const now = Date.now();

    // Ages are worked out by the database ("seconds ago"), so the database's
    // own time zone doesn't matter. Days are then counted in Jamaica time.
    const [sales] = await db.query(
      `SELECT o.Order_id, TIMESTAMPDIFF(SECOND, o.Order_date, NOW()) AS Age_s,
              oi.Quantity * oi.Order_price AS Line_total
       FROM Order_Item oi
       JOIN Product p ON p.Product_id = oi.Product_id
       JOIN \`Order\` o ON o.Order_id = oi.Order_id
       WHERE p.Farmer_id = ? AND o.Status <> 'Cancelled'
         AND o.Order_date >= NOW() - INTERVAL 70 DAY`,
      [farmerId]
    );
    const when = row => new Date(now - Number(row.Age_s) * 1000);

    // Sales this month vs last month
    const today = new Date(now);
    const thisMonth = jamaicaDay(today).slice(0, 7);                 // "2026-11"
    const [y, m] = thisMonth.split('-').map(Number);
    const lastMonth = m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, '0')}`;
    let monthSales = 0;
    let lastMonthSales = 0;

    // Sales for each of the last 7 days, and the 7 days before that
    const week = [];
    for (let i = 6; i >= 0; i--) {
      const day = new Date(now - i * DAY_MS);
      week.push({ key: jamaicaDay(day), letter: jamaicaLabel(day, { weekday: 'narrow' }), total: 0 });
    }
    const weekByDay = new Map(week.map(d => [d.key, d]));
    const prevWeekStart = jamaicaDay(new Date(now - 13 * DAY_MS));
    let prevWeekSales = 0;

    for (const row of sales) {
      const day = jamaicaDay(when(row));
      const amount = Number(row.Line_total);
      if (day.startsWith(thisMonth)) monthSales += amount;
      if (day.startsWith(lastMonth)) lastMonthSales += amount;
      if (weekByDay.has(day)) weekByDay.get(day).total += amount;
      else if (day >= prevWeekStart && day < week[0].key) prevWeekSales += amount;
    }
    const weekSales = week.reduce((sum, d) => sum + d.total, 0);

    // Listings
    const [listings] = await db.query(
      `SELECT Product_id, Name, Category, Quantity, Price, Unit, Image, Status
       FROM Product WHERE Farmer_id = ? ORDER BY Product_id DESC`,
      [farmerId]
    );
    const listingState = p => {
      if (p.Status === 'Pending') return 'Pending review';
      if (p.Status === 'Rejected') return 'Not approved';
      if (p.Quantity <= 0) return 'Sold out';
      if (p.Quantity <= LOW_STOCK) return 'Low stock';
      return 'Active';
    };
    const live = listings.filter(p => p.Status === 'Approved' && p.Quantity > 0);

    // Orders that include this farmer's products (only this farmer's items are shown and counted)
    const [orderRows] = await db.query(
      `SELECT o.Order_id, o.Status, o.Delivery_method, o.Delivery_parish,
              TIMESTAMPDIFF(SECOND, o.Order_date, NOW()) AS Age_s,
              u.F_name, u.L_name, p.Name, p.Unit, oi.Quantity, oi.Order_price
       FROM \`Order\` o
       JOIN Customer c ON c.Customer_id = o.Customer_id
       JOIN \`User\` u ON u.User_id = c.User_id
       JOIN Order_Item oi ON oi.Order_id = o.Order_id
       JOIN Product p ON p.Product_id = oi.Product_id
       WHERE p.Farmer_id = ?
       ORDER BY o.Order_date DESC, o.Order_id DESC, oi.Order_item_id`,
      [farmerId]
    );
    const orders = new Map();
    for (const row of orderRows) {
      if (!orders.has(row.Order_id)) {
        orders.set(row.Order_id, {
          id: row.Order_id,
          number: orderNumber(row.Order_id),
          buyer: `${row.F_name} ${row.L_name}`,
          status: row.Status,
          pickup: row.Delivery_method === 'Pickup',
          date: jamaicaLabel(when(row), { day: 'numeric', month: 'short' }),
          place: row.Delivery_method === 'Pickup' ? 'Farm pickup' : (row.Delivery_parish || 'Delivery'),
          items: [],
          total: 0
        });
      }
      const order = orders.get(row.Order_id);
      order.items.push(`${row.Name} ${row.Quantity} ${row.Unit || ''}`.trim());
      order.total += row.Quantity * Number(row.Order_price);
    }
    const allOrders = [...orders.values()];
    const open = allOrders.filter(o => ['Pending', 'Confirmed', 'Shipped'].includes(o.status));
    const buyers = new Set(orderRows.filter(r => r.Status !== 'Cancelled').map(r => `${r.F_name} ${r.L_name}`));

    // Farm rating: average of the reviews on this farmer's products
    const [[rating]] = await db.query(
      `SELECT COUNT(*) AS Reviews, AVG(r.Rating) AS Average
       FROM Review r JOIN Product p ON p.Product_id = r.Product_id WHERE p.Farmer_id = ?`,
      [farmerId]
    );

    res.json({
      farmer: {
        firstName: req.user.firstName,
        lastName: req.user.lastName,
        farmName: req.user.farmer.farmName,
        parish: req.user.farmer.farmParish || req.user.parish,
        verified: req.user.farmer.verified,
        verifStatus: req.user.farmer.verifStatus
      },
      today: jamaicaLabel(today, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
      hour: Number(today.toLocaleString('en-GB', { hour: 'numeric', hour12: false, timeZone: FARM_TIME_ZONE })),
      stats: {
        monthSales,
        lastMonthSales,
        lastMonthName: jamaicaLabel(new Date(Date.UTC(y, m - 2, 15)), { month: 'long' }),
        activeListings: live.length,
        lowStock: live.filter(p => p.Quantity <= LOW_STOCK).length,
        pendingReview: listings.filter(p => p.Status === 'Pending').length,
        ordersToFulfil: open.length,
        needConfirmation: open.filter(o => o.status === 'Pending').length,
        buyers: buyers.size,
        reviews: Number(rating.Reviews),
        rating: rating.Reviews ? Math.round(Number(rating.Average) * 10) / 10 : null
      },
      recentOrders: allOrders.slice(0, 5),
      listings: listings.slice(0, 4).map(p => ({
        id: p.Product_id,
        name: p.Name,
        price: Number(p.Price),
        unit: p.Unit || (p.Category === 'Livestock' ? 'head' : 'lb'),
        quantity: p.Quantity,
        image: p.Image || 'img/png_ver/logo2.png',
        state: listingState(p),
        approved: p.Status === 'Approved'
      })),
      totalListings: listings.length,
      week: {
        days: week.map(d => ({ letter: d.letter, total: d.total })),
        total: weekSales,
        previousTotal: prevWeekSales,
        from: jamaicaLabel(new Date(now - 6 * DAY_MS), { day: 'numeric', month: 'short' }),
        to: jamaicaLabel(today, { day: 'numeric', month: 'short' })
      }
    });
  } catch (err) {
    next(err);
  }
});

// Farmer confirms a new order (Pending -> Confirmed)
app.post('/api/farmer/orders/:id/confirm', requireFarmer, async (req, res, next) => {
  try {
    const orderId = Number(req.params.id);
    if (!Number.isInteger(orderId) || orderId <= 0) return res.status(404).json({ error: 'Order not found.' });

    // Only an order that contains this farmer's products
    const [result] = await db.query(
      `UPDATE \`Order\` SET Status = 'Confirmed'
       WHERE Order_id = ? AND Status = 'Pending'
         AND EXISTS (SELECT 1 FROM Order_Item oi JOIN Product p ON p.Product_id = oi.Product_id
                     WHERE oi.Order_id = \`Order\`.Order_id AND p.Farmer_id = ?)`,
      [orderId, req.user.farmer.farmerId]
    );
    if (result.affectedRows === 0) {
      return res.status(409).json({ error: 'This order was already confirmed or is not one of yours.' });
    }
    res.json({ orderId, status: 'Confirmed' });
  } catch (err) {
    next(err);
  }
});


// =========================================
// UNKNOWN ADDRESSES + ERRORS
// (A page that doesn't exist gets an empty 404, so the browser shows its own
//  "This page can't be found / HTTP ERROR 404" page.)
// =========================================

// Unknown API address
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found.' });
});

// Unknown page
app.use((req, res) => {
  res.status(404).end();
});

// Errors (bad uploads, database problems)
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const messages = {
      LIMIT_FILE_SIZE: 'Each file must be 10 MB or smaller.',
      LIMIT_FILE_COUNT: 'Please choose up to 5 photos.',
      LIMIT_UNEXPECTED_FILE: 'Please choose up to 5 photos.'
    };
    removeUploadedFiles(req);
    return res.status(400).json({ error: messages[err.code] || 'There was a problem with the uploaded files.' });
  }
  if (err.status === 400) {
    removeUploadedFiles(req);
    return res.status(400).json({ error: err.message });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'The request could not be read.' });
  }
  if (err.code === 'ER_USER_LIMIT_REACHED' || err.code === 'ER_CON_COUNT_ERROR') {
    console.error('Database is full: all 5 connections are in use. Close MySQL Workbench, ' +
      "disconnect VS Code's SQLTools, and stop any other copy of this server.");
    return res.status(503).json({ error: 'The database is busy right now. Please try again in a moment.' });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});


const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => console.log(`Agri Connect running at http://localhost:${PORT}`));
server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${PORT} is already in use: another copy of the Agri Connect server is still running.\n` +
      'Stop that copy first (close the terminal it is running in, or end "Node.js JavaScript Runtime" in Task Manager), then run start again.\n');
    process.exit(1);
  }
  throw err;
});
