// Connects to the Clever Cloud MySQL database using the details in .env
require('dotenv').config();
const mysql = require('mysql2/promise');

// The free Clever Cloud plan allows only 5 connections at once, shared by
// everything that uses the database (this server, MySQL Workbench, VS Code's
// SQLTools, teammates' servers). So this server uses at most 2, keeps at most
// 1 open while idle, and closes it after 10 seconds of no use.
const db = mysql.createPool({
  host: process.env.MYSQL_ADDON_HOST,
  port: process.env.MYSQL_ADDON_PORT,
  user: process.env.MYSQL_ADDON_USER,
  password: process.env.MYSQL_ADDON_PASSWORD,
  database: process.env.MYSQL_ADDON_DB,
  connectionLimit: 2,
  maxIdle: 1,
  idleTimeout: 10000
});

module.exports = db;
