// =========================================
// DATABASE UPDATE FOR AGRI CONNECT
// Run from VS Code: NPM Scripts > update-database
// Safe to run again: it skips anything that is already done.
// It only ADDS columns, tables and data (and hides two placeholder products).
// It never deletes anything.
// =========================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const bcrypt = require('bcryptjs');
const db = require('../db');

// Demo passwords (they meet the "1 number + 1 special character" rule).
// Every sample farmer below signs in with the Farmer password.
const DEMO_PASSWORDS = {
  Farmer: 'Farmer123!',
  Customer: 'Customer123!',
  Admin: 'Admin123!'
};

async function columnExists(table, column) {
  const [rows] = await db.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length > 0;
}

async function addColumn(table, column, definition) {
  if (await columnExists(table, column)) {
    console.log(`  - ${table}.${column} already exists`);
    return false;
  }
  await db.query(`ALTER TABLE \`${table}\` ADD COLUMN \`${column}\` ${definition}`);
  console.log(`  + added ${table}.${column}`);
  return true;
}

// Lets a column be empty (used for imported sample products that don't have every detail)
async function allowEmpty(table, column, type) {
  const [rows] = await db.query(
    `SELECT IS_NULLABLE FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  if (rows.length && rows[0].IS_NULLABLE === 'NO') {
    await db.query(`ALTER TABLE \`${table}\` MODIFY \`${column}\` ${type} NULL`);
    console.log(`  + ${table}.${column} can now be empty`);
  }
}

const slug = text => text.toLowerCase().replace(/[^a-z0-9]+/g, '');
const fixParish = parish => (parish === 'St Thomas' ? 'St. Thomas' : parish);

function parseShortDate(text) {
  // "5 Oct 2026" -> "2026-10-05"
  const date = new Date(`${text} UTC`);
  return isNaN(date) ? null : date.toISOString().slice(0, 10);
}


async function main() {
  // ---------------------------------------------------------
  console.log('\n1. Listing columns on Product');
  await addColumn('Product', 'Description', 'TEXT NULL');
  await addColumn('Product', 'Unit', 'VARCHAR(20) NULL');
  await addColumn('Product', 'Parish', 'VARCHAR(50) NULL');
  await addColumn('Product', 'Pickup_location', 'VARCHAR(255) NULL');
  await addColumn('Product', 'Farm_pickup', 'BOOLEAN NOT NULL DEFAULT TRUE');
  await addColumn('Product', 'Delivery', 'BOOLEAN NOT NULL DEFAULT FALSE');
  const statusIsNew = await addColumn('Product', 'Status',
    "ENUM('Pending','Approved','Rejected') NOT NULL DEFAULT 'Pending'");
  if (statusIsNew) {
    await db.query("UPDATE Product SET Status = 'Approved'");
    console.log('  + marked existing products as Approved');
  }
  await addColumn('Product', 'Created_at', 'DATETIME DEFAULT CURRENT_TIMESTAMP');
  await addColumn('Product', 'Subcategory', 'VARCHAR(50) NULL');
  await addColumn('Product', 'Tag', 'VARCHAR(50) NULL');

  // ---------------------------------------------------------
  console.log('\n2. Detail tables');
  await db.query(`
    CREATE TABLE IF NOT EXISTS Crop_Detail (
      Product_id       INT PRIMARY KEY,
      Variety          VARCHAR(100) NOT NULL,
      Harvest_date     DATE NOT NULL,
      Growing_method   VARCHAR(30),
      Min_order        INT,
      Grade            VARCHAR(50),
      Spray_use        VARCHAR(255),
      Storage          VARCHAR(255),
      Packaging        VARCHAR(100),
      Certificate_file VARCHAR(255),
      FOREIGN KEY (Product_id) REFERENCES Product(Product_id) ON DELETE CASCADE
    )`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS Livestock_Detail (
      Product_id      INT PRIMARY KEY,
      Species_breed   VARCHAR(100) NOT NULL,
      Sex             VARCHAR(20),
      Age             VARCHAR(50),
      Live_weight     DECIMAL(7,2),
      Animal_id       VARCHAR(50),
      Health          VARCHAR(255),
      Transport       VARCHAR(255),
      Vet_record_file VARCHAR(255),
      FOREIGN KEY (Product_id) REFERENCES Product(Product_id) ON DELETE CASCADE
    )`);
  await db.query(`
    CREATE TABLE IF NOT EXISTS Product_Image (
      Image_id   INT AUTO_INCREMENT PRIMARY KEY,
      Product_id INT NOT NULL,
      Image_path VARCHAR(255) NOT NULL,
      Sort_order INT NOT NULL DEFAULT 0,
      FOREIGN KEY (Product_id) REFERENCES Product(Product_id) ON DELETE CASCADE
    )`);
  // The website still requires these for new listings; the database allows them
  // to be empty so the imported sample products fit.
  await allowEmpty('Crop_Detail', 'Grade', 'VARCHAR(50)');
  await allowEmpty('Crop_Detail', 'Spray_use', 'VARCHAR(255)');
  await allowEmpty('Crop_Detail', 'Storage', 'VARCHAR(255)');
  await allowEmpty('Livestock_Detail', 'Sex', 'VARCHAR(20)');
  await allowEmpty('Livestock_Detail', 'Age', 'VARCHAR(50)');
  await allowEmpty('Livestock_Detail', 'Live_weight', 'DECIMAL(7,2)');
  await allowEmpty('Livestock_Detail', 'Health', 'VARCHAR(255)');
  await allowEmpty('Livestock_Detail', 'Transport', 'VARCHAR(255)');
  console.log('  + Crop_Detail, Livestock_Detail and Product_Image ready');

  // ---------------------------------------------------------
  console.log('\n3. Farm names');
  await addColumn('Farmer', 'Farm_name', 'VARCHAR(100) NULL');
  const [named] = await db.query(
    `UPDATE Farmer f JOIN \`User\` u ON u.User_id = f.User_id
     SET f.Farm_name = CONCAT(u.L_name, ' Family Farm')
     WHERE f.Farm_name IS NULL`);
  if (named.affectedRows) console.log(`  + gave ${named.affectedRows} existing farmer(s) a farm name`);

  // ---------------------------------------------------------
  console.log('\n4. Order and payment columns');
  await addColumn('Order', 'Delivery_method', "VARCHAR(20) NOT NULL DEFAULT 'Delivery'");
  await addColumn('Order', 'Recipient_name', 'VARCHAR(100) NULL');
  await addColumn('Order', 'Recipient_phone', 'VARCHAR(20) NULL');
  await addColumn('Order', 'Delivery_address', 'VARCHAR(255) NULL');
  await addColumn('Order', 'Delivery_parish', 'VARCHAR(50) NULL');
  await addColumn('Order', 'Delivery_fee', 'DECIMAL(10,2) NOT NULL DEFAULT 0');
  await addColumn('Payment', 'Payment_method', 'VARCHAR(30) NULL');

  // ---------------------------------------------------------
  console.log('\n5. Securing sample passwords');
  const [users] = await db.query('SELECT User_id, Email, Role, Password_hash FROM `User`');
  let changed = 0;
  for (const user of users) {
    if (user.Password_hash && user.Password_hash.startsWith('$2')) continue;   // already hashed
    const password = DEMO_PASSWORDS[user.Role] || 'Welcome123!';
    await db.query('UPDATE `User` SET Password_hash = ? WHERE User_id = ?',
      [await bcrypt.hash(password, 10), user.User_id]);
    console.log(`  + ${user.Email} (${user.Role}) can now sign in with: ${password}`);
    changed++;
  }
  if (changed === 0) console.log('  - all passwords were already hashed');

  // ---------------------------------------------------------
  console.log('\n6. Importing the marketplace products from js/product-data.js');
  const dataFile = path.join(__dirname, '..', 'js', 'product-data.js');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(`${fs.readFileSync(dataFile, 'utf8')}\nthis.productData = productData;`, sandbox);
  const products = sandbox.productData;

  // Real image file names (so "img/goat-cheese.jpg" finds "img/Goat-Cheese.jpg")
  const imageFiles = fs.readdirSync(path.join(__dirname, '..', 'img'));
  const realImagePath = image => {
    const name = path.basename(image);
    const match = imageFiles.find(file => file.toLowerCase() === name.toLowerCase());
    return match ? `img/${match}` : image;
  };

  const farmerPasswordHash = await bcrypt.hash(DEMO_PASSWORDS.Farmer, 10);
  const farmerIds = new Map();   // farm name -> Farmer_id
  let radaCounter = 1001;
  let addedFarmers = 0;
  let addedProducts = 0;

  for (const p of Object.values(products)) {
    const farmName = p.farmerFarm.replace('⌄', '').trim();
    const [first, ...rest] = p.farmerName.split('·')[0].trim().split(' ');
    const last = rest.join(' ') || 'Farmer';
    const parish = fixParish(p.parish);

    // --- The farmer (one account per farm) ---
    if (!farmerIds.has(farmName)) {
      const email = `${slug(farmName)}@example.com`;
      const [found] = await db.query(
        'SELECT f.Farmer_id FROM `User` u JOIN Farmer f ON f.User_id = u.User_id WHERE u.Email = ?', [email]);
      if (found.length) {
        farmerIds.set(farmName, found[0].Farmer_id);
      } else {
        const [userResult] = await db.query(
          "INSERT INTO `User` (F_name, L_name, Email, Phone_num, Parish, Role, Password_hash) VALUES (?, ?, ?, ?, ?, 'Farmer', ?)",
          [first, last, email, `876-555-${String(radaCounter).slice(-4)}`, parish, farmerPasswordHash]);
        const [farmerResult] = await db.query(
          'INSERT INTO Farmer (User_id, Farm_parish, Farm_name) VALUES (?, ?, ?)',
          [userResult.insertId, parish, farmName]);
        let radaNumber = `RADA-${radaCounter}`;
        const [taken] = await db.query('SELECT 1 FROM RADA_Record WHERE RADA_reg_num = ?', [radaNumber]);
        if (taken.length) radaNumber = `RADA-${radaCounter}-${farmerResult.insertId}`;
        await db.query(
          "INSERT INTO RADA_Record (Farmer_id, RADA_reg_num, Verif_status, Verif_date) VALUES (?, ?, 'Verified', '2026-11-01')",
          [farmerResult.insertId, radaNumber]);
        farmerIds.set(farmName, farmerResult.insertId);
        addedFarmers++;
      }
      radaCounter++;
    }
    const farmerId = farmerIds.get(farmName);

    // --- The product ---
    const [exists] = await db.query('SELECT 1 FROM Product WHERE Farmer_id = ? AND Name = ?', [farmerId, p.title]);
    if (exists.length) continue;

    const [group, subcategory] = p.category.split(' - ');
    const category = group.trim() === 'Livestock' ? 'Livestock' : 'Crops';
    const image = realImagePath(p.image);

    const [productResult] = await db.query(
      `INSERT INTO Product
         (Farmer_id, Name, Category, Subcategory, Tag, Quantity, Price, Image, Description, Unit,
          Parish, Pickup_location, Farm_pickup, Delivery, Status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, TRUE, TRUE, 'Approved')`,
      [farmerId, p.title, category, subcategory ? subcategory.trim() : null, p.tag, p.stock, p.price,
       image, p.description, p.unit, parish, `${farmName}, ${parish}`]);
    const productId = productResult.insertId;

    const isLiveAnimal = category === 'Livestock' && (p.unit === 'head' || p.unit === 'bird');
    if (isLiveAnimal) {
      const pounds = parseFloat(p.detail3);
      const weightKg = /lb/i.test(p.detail3) && pounds ? Math.round(pounds * 0.4536 * 10) / 10 : null;
      const sex = /buck|ram|boar|bull/i.test(p.title) ? 'Male' : (/hen|doe|ewe|sow|cow/i.test(p.title) ? 'Female' : null);
      await db.query(
        `INSERT INTO Livestock_Detail (Product_id, Species_breed, Sex, Age, Live_weight, Health, Transport)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [productId, p.detail1, sex, p.detail2, weightKg, p.detail4, p.farmDesc]);
    } else {
      await db.query(
        `INSERT INTO Crop_Detail (Product_id, Variety, Harvest_date, Growing_method, Min_order, Spray_use, Storage)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [productId, p.detail1, parseShortDate(p.detail3) || '2026-11-01', p.detail2.slice(0, 30),
         p.unit === 'lb' ? 5 : 1, p.farmDesc.slice(0, 255), p.detail4]);
    }
    await db.query('INSERT INTO Product_Image (Product_id, Image_path, Sort_order) VALUES (?, ?, 0)', [productId, image]);
    addedProducts++;
  }
  console.log(`  + added ${addedFarmers} farmer account(s) and ${addedProducts} product(s)`);
  if (addedFarmers) console.log(`  + sample farmers sign in with <farmname>@example.com and: ${DEMO_PASSWORDS.Farmer}`);

  // ---------------------------------------------------------
  console.log('\n7. Hiding the two placeholder products from the very first database script');
  const [hidden] = await db.query(
    `UPDATE Product SET Status = 'Rejected'
     WHERE Name IN ('Irish Potatoes', 'Scotch Bonnet Peppers') AND Image IS NULL AND Status = 'Approved'
       AND Product_id NOT IN (SELECT Product_id FROM Crop_Detail)
       AND Product_id NOT IN (SELECT Product_id FROM Livestock_Detail)`);
  console.log(hidden.affectedRows ? `  + hid ${hidden.affectedRows} placeholder product(s)` : '  - nothing to hide');

  // ---------------------------------------------------------
  console.log('\n8. Product reviews');
  await db.query(`
    CREATE TABLE IF NOT EXISTS Review (
      Review_id   INT AUTO_INCREMENT PRIMARY KEY,
      Product_id  INT NOT NULL,
      Customer_id INT NOT NULL,
      Rating      TINYINT NOT NULL,
      Comment     VARCHAR(500) NULL,
      Created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY one_review_per_buyer (Product_id, Customer_id),
      FOREIGN KEY (Product_id)  REFERENCES Product(Product_id) ON DELETE CASCADE,
      FOREIGN KEY (Customer_id) REFERENCES Customer(Customer_id) ON DELETE CASCADE
    )`);
  console.log('  + Review table ready');

  console.log('\nDatabase update finished.\n');
}

main()
  .catch(err => {
    console.error('\nDatabase update FAILED:', err.message, '\n');
    process.exitCode = 1;
  })
  .finally(() => db.end());
