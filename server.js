// Agri Connect server: shows the pages in /public and talks to the database
const express = require('express');
const db = require('./db');

const app = express();
app.use(express.json());
app.use(express.static('public'));   // serves every file in the public folder

// Test route: open http://localhost:3000/api/test to check the database connection
app.get('/api/test', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT COUNT(*) AS users FROM `User`');
    res.json({ connected: true, users: rows[0].users });
  } catch (err) {
    res.status(500).json({ connected: false, error: err.message });
  }
});

// Get all products (used by the home page)
app.get('/api/products', async (req, res) => {
  try {
    const [rows] = await db.query('SELECT * FROM Product');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Agri Connect running at http://localhost:${PORT}`));
