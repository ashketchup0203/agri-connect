// =========================================
// CREATE THE AGRI CONNECT TABLES IN AN EMPTY DATABASE
// Run from VS Code: NPM Scripts > create-tables
// Uses the database details in .env. Does nothing if the tables already exist.
// Afterwards, run NPM Scripts > update-database.
// =========================================
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.MYSQL_ADDON_HOST,
    port: process.env.MYSQL_ADDON_PORT,
    user: process.env.MYSQL_ADDON_USER,
    password: process.env.MYSQL_ADDON_PASSWORD,
    database: process.env.MYSQL_ADDON_DB,
    multipleStatements: true
  });

  try {
    const [existing] = await conn.query(
      "SELECT 1 FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'User'");
    if (existing.length > 0) {
      console.log('\nThe tables already exist, so nothing was changed.');
      console.log('Next: NPM Scripts > update-database\n');
      return;
    }

    const sql = fs.readFileSync(path.join(__dirname, '..', 'database', 'agri_connect_tables.sql'), 'utf8');
    await conn.query(sql);

    const [tables] = await conn.query(
      'SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() ORDER BY TABLE_NAME');
    console.log(`\nCreated ${tables.length} tables: ${tables.map(t => t.TABLE_NAME).join(', ')}`);
    console.log('Added the sample users John Brown (farmer), Jane Smith (customer) and Admin User.');
    console.log('Next: NPM Scripts > update-database\n');
  } finally {
    await conn.end();
  }
}

main().catch(err => {
  console.error('\nCreating the tables FAILED:', err.message, '\n');
  process.exitCode = 1;
});
