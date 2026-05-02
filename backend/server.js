const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const app = express();
app.use(cors());
app.use(express.json());

// Konfigurasi koneksi Database membaca dari Environment Variables Ansible
const pool = new Pool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: 5432,
});
const JWT_SECRET = process.env.JWT_SECRET;

async function initDB() {
  const query = `
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username VARCHAR(50) UNIQUE NOT NULL,
      password VARCHAR(255) NOT NULL
    );
  `;
  try {
    await pool.query(query);
    console.log("Database table 'users' is ready.");
  } catch (err) {
    console.error("Failed to initialize database:", err);
  }
}

app.get('/', (req, res) => {
  res.status(200).json({ message: "Backend is UP and RUNNING!" });
});

app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: "Username dan Password wajib diisi!" });
  }

  try {
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    await pool.query(
      'INSERT INTO users (username, password) VALUES ($1, $2)',[username, hashedPassword]
    );

    res.status(201).json({ message: "Registrasi berhasil! Silakan login." });
  } catch (err) {
    if (err.code === '23505') { // error code Postgres untuk UNIQUE constraint
      return res.status(409).json({ message: "Username sudah digunakan!" });
    }
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ message: "Username dan Password wajib diisi!" });
  }

  try {
    const result = await pool.query('SELECT * FROM users WHERE username = $1', [username]);
    if (result.rows.length === 0) {
      return res.status(401).json({ message: "Username tidak ditemukan!" });
    }

    const user = result.rows[0];

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Password salah!" });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      JWT_SECRET,
      { expiresIn: '1h' }
    );

    res.status(200).json({
      message: "Login berhasil!",
      token: token
    });
  } catch (err) {
    res.status(500).json({ message: "Terjadi kesalahan server." });
  }
});

const PORT = process.env.PORT || 3000;
setTimeout(() => {
  initDB();
  app.listen(PORT, () => {
    console.log(`Backend Server running on port ${PORT}`);
  });
}, 5000); // delay 5 detik