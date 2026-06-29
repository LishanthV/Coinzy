const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const nodemailer = require('nodemailer');
const otpGenerator = require('otp-generator');
require('dotenv').config();
const { validate, schemas } = require('./validation');

const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// ─────────────────────────────────────────────────────────────────────────────
// DB Pool
// ─────────────────────────────────────────────────────────────────────────────
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'coinzy_db',
  waitForConnections: true,
  connectionLimit: 10,
});

// ─────────────────────────────────────────────────────────────────────────────
// Nodemailer transporter
// ─────────────────────────────────────────────────────────────────────────────
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587'),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

// ─────────────────────────────────────────────────────────────────────────────
// Token helpers
// ─────────────────────────────────────────────────────────────────────────────
const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'coinzy_access_secret_change_me';
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'coinzy_refresh_secret_change_me';

function generateAccessToken(userId) {
  return jwt.sign({ userId }, ACCESS_SECRET, { expiresIn: '15m' });
}

function generateRefreshToken(userId) {
  return jwt.sign({ userId }, REFRESH_SECRET, { expiresIn: '30d' });
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth middleware
// ─────────────────────────────────────────────────────────────────────────────
async function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing token' });
  }
  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, ACCESS_SECRET);
    req.userId = decoded.userId;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Token expired', code: 'TOKEN_EXPIRED' });
    }
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-migration on startup
// ─────────────────────────────────────────────────────────────────────────────
async function runMigrations() {
  const conn = await pool.getConnection();
  try {
    await conn.query(`CREATE DATABASE IF NOT EXISTS coinzy_db`);
    await conn.query(`USE coinzy_db`);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id VARCHAR(36) PRIMARY KEY,
        userId VARCHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50),
        balance DECIMAL(15,2) DEFAULT 0,
        color VARCHAR(50),
        icon VARCHAR(50),
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS budgets (
        id VARCHAR(36) PRIMARY KEY,
        userId VARCHAR(36) NOT NULL,
        categoryId VARCHAR(50) NOT NULL,
        \`limit\` DECIMAL(15,2) NOT NULL,
        period VARCHAR(20) DEFAULT 'monthly',
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id VARCHAR(36) PRIMARY KEY,
        userId VARCHAR(36) NOT NULL,
        accountId VARCHAR(36),
        toAccountId VARCHAR(36),
        type VARCHAR(20) NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        categoryId VARCHAR(50),
        note TEXT,
        date VARCHAR(50),
        merchant VARCHAR(255),
        customCategory VARCHAR(255),
        items TEXT,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id VARCHAR(36) PRIMARY KEY,
        userId VARCHAR(36) NOT NULL,
        token TEXT NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS savings_goals (
        id VARCHAR(36) PRIMARY KEY,
        userId VARCHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        targetAmount DECIMAL(15,2) NOT NULL,
        currentAmount DECIMAL(15,2) DEFAULT 0,
        targetDate VARCHAR(50) DEFAULT NULL,
        updatedAt BIGINT NOT NULL DEFAULT 0,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS recurring_transactions (
        id VARCHAR(36) PRIMARY KEY,
        userId VARCHAR(36) NOT NULL,
        accountId VARCHAR(36) NOT NULL,
        type VARCHAR(20) NOT NULL,
        amount DECIMAL(15,2) NOT NULL,
        categoryId VARCHAR(50) DEFAULT NULL,
        note TEXT,
        merchant VARCHAR(255) DEFAULT NULL,
        frequency VARCHAR(20) NOT NULL DEFAULT 'monthly',
        nextDueDate VARCHAR(50) NOT NULL,
        lastProcessed VARCHAR(50) DEFAULT NULL,
        isActive TINYINT(1) DEFAULT 1,
        updatedAt BIGINT NOT NULL DEFAULT 0,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE CASCADE
      )
    `);

    // ── OTP pending registrations table ──────────────────────────────────────
    await conn.query(`
      CREATE TABLE IF NOT EXISTS pending_registrations (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        password VARCHAR(255) NOT NULL,
        otp VARCHAR(6) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Existing column migrations
    const [cols] = await conn.query(`SHOW COLUMNS FROM transactions`);
    const colNames = cols.map((c) => c.Field);
    if (colNames.includes('description') && !colNames.includes('note')) {
      await conn.query(`ALTER TABLE transactions CHANGE description note TEXT`);
    }
    if (!colNames.includes('merchant')) {
      await conn.query(`ALTER TABLE transactions ADD COLUMN merchant VARCHAR(255) DEFAULT NULL`);
    }
    if (!colNames.includes('customCategory')) {
      await conn.query(`ALTER TABLE transactions ADD COLUMN customCategory VARCHAR(255) DEFAULT NULL`);
    }
    if (!colNames.includes('items')) {
      await conn.query(`ALTER TABLE transactions ADD COLUMN items TEXT DEFAULT NULL`);
    }

    console.log('✅ Migrations complete');
  } finally {
    conn.release();
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// OTP email sender
// ─────────────────────────────────────────────────────────────────────────────
async function sendOTPEmail(email, name, otp) {
  await transporter.sendMail({
    from: `"Coinzy" <${process.env.SMTP_FROM}>`,
    to: email,
    subject: 'Your Coinzy Verification Code',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: #0f0f0f; color: #ffffff; border-radius: 16px;">
        <h1 style="color: #7C3AED; margin-bottom: 8px;">Coinzy 💜</h1>
        <h2 style="color: #ffffff; margin-bottom: 4px;">Verify your email</h2>
        <p style="color: #9ca3af;">Hi ${name}, use the code below to complete your registration.</p>
        <div style="background: #1f1f1f; border-radius: 12px; padding: 24px; text-align: center; margin: 24px 0;">
          <p style="color: #9ca3af; font-size: 13px; margin-bottom: 8px;">YOUR VERIFICATION CODE</p>
          <h1 style="color: #7C3AED; font-size: 48px; letter-spacing: 12px; margin: 0;">${otp}</h1>
        </div>
        <p style="color: #9ca3af; font-size: 13px;">This code expires in <strong style="color:#fff">10 minutes</strong>. If you didn't request this, ignore this email.</p>
      </div>
    `,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Auth routes
// ─────────────────────────────────────────────────────────────────────────────

// Step 1 — Send OTP (replaces old register route)
app.post(['/auth/register', '/api/auth/register'], validate(schemas.register), async (req, res) => {
  const { name, email, password } = req.validated;
  try {
    // Check if email already registered
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'Email already in use' });
    }

    // Hash password before storing in pending
    const hashed = await bcrypt.hash(password, 12);

    // Generate 6-digit OTP
    const otp = otpGenerator.generate(6, {
      digits: true,
      lowerCaseAlphabets: false,
      upperCaseAlphabets: false,
      specialChars: false,
    });

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    const pendingId = require('crypto').randomUUID();

    // Remove any existing pending registration for this email
    await pool.query('DELETE FROM pending_registrations WHERE email = ?', [email]);

    // Store pending registration
    await pool.query(
      'INSERT INTO pending_registrations (id, name, email, password, otp, expires_at) VALUES (?, ?, ?, ?, ?, ?)',
      [pendingId, name, email, hashed, otp, expiresAt]
    );

    // Send OTP email
    await sendOTPEmail(email, name, otp);

    return res.status(200).json({
      message: 'OTP sent to your email',
      email, // return email so frontend knows where OTP was sent
    });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Failed to send OTP. Please try again.' });
  }
});

// Step 2 — Verify OTP and create account
app.post(['/auth/verify-otp', '/api/auth/verify-otp'], async (req, res) => {
  const { email, otp } = req.body;

  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required' });
  }

  try {
    // Find pending registration
    const [rows] = await pool.query(
      'SELECT * FROM pending_registrations WHERE email = ? AND expires_at > NOW()',
      [email]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: 'OTP expired or not found. Please register again.' });
    }

    const pending = rows[0];

    // Check OTP matches
    if (pending.otp !== otp.toString().trim()) {
      return res.status(400).json({ error: 'Invalid OTP. Please try again.' });
    }

    // Create user account
    const userId = require('crypto').randomUUID();
    await pool.query(
      'INSERT INTO users (id, name, email, password) VALUES (?, ?, ?, ?)',
      [userId, pending.name, pending.email, pending.password]
    );

    // Clean up pending registration
    await pool.query('DELETE FROM pending_registrations WHERE email = ?', [email]);

    // Generate tokens
    const accessToken = generateAccessToken(userId);
    const refreshToken = generateRefreshToken(userId);
    await storeRefreshToken(userId, refreshToken);

    return res.status(201).json({
      accessToken,
      refreshToken,
      userId,
      name: pending.name,
      email: pending.email,
    });
  } catch (err) {
    console.error('Verify OTP error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Resend OTP
app.post(['/auth/resend-otp', '/api/auth/resend-otp'], async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required' });

  try {
    const [rows] = await pool.query(
      'SELECT * FROM pending_registrations WHERE email = ?',
      [email]
    );

    if (rows.length === 0) {
      return res.status(400).json({ error: 'No pending registration found. Please register again.' });
    }

    const pending = rows[0];
    const otp = otpGenerator.generate(6, {
      digits: true,
      lowerCaseAlphabets: false,
      upperCaseAlphabets: false,
      specialChars: false,
    });

    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await pool.query(
      'UPDATE pending_registrations SET otp = ?, expires_at = ? WHERE email = ?',
      [otp, expiresAt, email]
    );

    await sendOTPEmail(email, pending.name, otp);
    return res.json({ message: 'New OTP sent' });
  } catch (err) {
    console.error('Resend OTP error:', err);
    return res.status(500).json({ error: 'Failed to resend OTP' });
  }
});

// Login
app.post(['/auth/login', '/api/auth/login'], validate(schemas.login), async (req, res) => {
  const { email, password } = req.validated;
  try {
    const [rows] = await pool.query('SELECT * FROM users WHERE email = ?', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);
    await storeRefreshToken(user.id, refreshToken);

    return res.json({
      accessToken,
      refreshToken,
      userId: user.id,
      name: user.name,
      email: user.email,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Refresh token
app.post(['/auth/refresh', '/api/auth/refresh'], validate(schemas.refreshToken), async (req, res) => {
  const { refreshToken } = req.validated;
  try {
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, REFRESH_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const [rows] = await pool.query(
      'SELECT * FROM refresh_tokens WHERE userId = ? AND expires_at > NOW()',
      [decoded.userId]
    );

    const match = rows.find((r) => r.token === refreshToken);
    if (!match) {
      return res.status(401).json({ error: 'Refresh token not recognised' });
    }

    await pool.query('DELETE FROM refresh_tokens WHERE id = ?', [match.id]);

    const newAccessToken = generateAccessToken(decoded.userId);
    const newRefreshToken = generateRefreshToken(decoded.userId);
    await storeRefreshToken(decoded.userId, newRefreshToken);

    return res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// Logout
app.post('/auth/logout', authenticate, async (req, res) => {
  const { refreshToken } = req.body;
  try {
    if (refreshToken) {
      await pool.query('DELETE FROM refresh_tokens WHERE userId = ? AND token = ?', [
        req.userId,
        refreshToken,
      ]);
    }
    return res.json({ message: 'Logged out' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Server error' });
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Helper — store refresh token
// ─────────────────────────────────────────────────────────────────────────────
async function storeRefreshToken(userId, token) {
  const id = require('crypto').randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await pool.query(
    'INSERT INTO refresh_tokens (id, userId, token, expires_at) VALUES (?, ?, ?, ?)',
    [id, userId, token, expiresAt]
  );
}

// Clean up expired tokens daily
setInterval(async () => {
  try {
    await pool.query('DELETE FROM refresh_tokens WHERE expires_at < NOW()');
    await pool.query('DELETE FROM pending_registrations WHERE expires_at < NOW()');
    console.log('🧹 Expired tokens cleaned');
  } catch (err) {
    console.error('Cleanup error:', err);
  }
}, 24 * 60 * 60 * 1000);

// ─────────────────────────────────────────────────────────────────────────────
// Protected routes
// ─────────────────────────────────────────────────────────────────────────────

// Accounts
app.get(['/accounts', '/api/accounts'], authenticate, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM accounts WHERE userId = ?', [req.userId]);
  res.json(rows);
});

app.post(['/accounts', '/api/accounts'], authenticate, validate(schemas.account), async (req, res) => {
  const { id, name, type, balance, color, icon } = req.validated;
  await pool.query(
    'INSERT INTO accounts (id, userId, name, type, balance, color, icon) VALUES (?, ?, ?, ?, ?, ?, ?)',
    [id, req.userId, name, type, balance, color, icon]
  );
  res.status(201).json({ id });
});

// Transactions
app.get(['/transactions', '/api/transactions'], authenticate, async (req, res) => {
  const [rows] = await pool.query(
    'SELECT * FROM transactions WHERE userId = ? ORDER BY date DESC',
    [req.userId]
  );
  res.json(rows);
});

app.post(['/transactions', '/api/transactions'], authenticate, validate(schemas.transaction), async (req, res) => {
  const { id, accountId, toAccountId, type, amount, categoryId, note, date, merchant, customCategory, items } = req.validated;
  await pool.query(
    `INSERT INTO transactions 
     (id, userId, accountId, toAccountId, type, amount, categoryId, note, date, merchant, customCategory, items) 
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, req.userId, accountId, toAccountId, type, amount, categoryId, note, date, merchant, customCategory, items]
  );
  res.status(201).json({ id });
});

app.delete(['/transactions/:id', '/api/transactions/:id'], authenticate, async (req, res) => {
  await pool.query('DELETE FROM transactions WHERE id = ? AND userId = ?', [
    req.params.id,
    req.userId,
  ]);
  res.json({ deleted: true });
});

// Budgets
app.get(['/budgets', '/api/budgets'], authenticate, async (req, res) => {
  const [rows] = await pool.query('SELECT * FROM budgets WHERE userId = ?', [req.userId]);
  res.json(rows);
});

app.post(['/budgets', '/api/budgets'], authenticate, validate(schemas.budget), async (req, res) => {
  const { id, categoryId, limit, period } = req.validated;
  await pool.query(
    'INSERT INTO budgets (id, userId, categoryId, `limit`, period) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE `limit` = VALUES(`limit`)',
    [id, req.userId, categoryId, limit, period]
  );
  res.status(201).json({ id });
});

// User profile
app.get(['/user', '/api/user'], authenticate, async (req, res) => {
  const [rows] = await pool.query('SELECT id, name, email, created_at FROM users WHERE id = ?', [req.userId]);
  if (rows.length === 0) return res.status(404).json({ error: 'User not found' });
  res.json(rows[0]);
});

// Savings Goals
app.get(['/goals', '/api/goals'], authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM savings_goals WHERE userId = ? ORDER BY updatedAt DESC', [req.userId]);
    const formatted = rows.map(g => ({
      ...g,
      targetAmount: Number(g.targetAmount),
      currentAmount: Number(g.currentAmount)
    }));
    res.json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post(['/goals', '/api/goals'], authenticate, validate(schemas.savingsGoal), async (req, res) => {
  const { id, name, targetAmount, currentAmount, targetDate } = req.validated;
  const cleanId = id || require('crypto').randomUUID();
  const now = Date.now();
  try {
    await pool.query(
      `INSERT INTO savings_goals 
        (id, userId, name, targetAmount, currentAmount, targetDate, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        name = VALUES(name), 
        targetAmount = VALUES(targetAmount), 
        currentAmount = VALUES(currentAmount), 
        targetDate = VALUES(targetDate), 
        updatedAt = VALUES(updatedAt)`,
      [cleanId, req.userId, name, targetAmount, currentAmount || 0, targetDate || null, now]
    );
    res.status(201).json({ id: cleanId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.delete(['/goals/:id', '/api/goals/:id'], authenticate, async (req, res) => {
  try {
    await pool.query('DELETE FROM savings_goals WHERE id = ? AND userId = ?', [
      req.params.id,
      req.userId
    ]);
    res.json({ deleted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Recurring Transactions
app.get(['/recurring', '/api/recurring'], authenticate, async (req, res) => {
  try {
    const [rules] = await pool.query(
      'SELECT * FROM recurring_transactions WHERE userId = ? AND isActive = 1 ORDER BY nextDueDate ASC',
      [req.userId]
    );
    const formatted = rules.map(r => ({ ...r, amount: Number(r.amount) }));
    res.json(formatted);
  } catch (error) {
    console.error('Fetch Recurring Error:', error);
    res.status(500).json({ error: 'Failed to fetch recurring transactions.' });
  }
});

app.post(['/recurring', '/api/recurring'], authenticate, validate(schemas.recurringTransaction), async (req, res) => {
  const { id, accountId, type, amount, categoryId, note, merchant, frequency, nextDueDate } = req.validated;
  const cleanId = id || ('rec_' + Math.random().toString(36).substring(2, 11));
  try {
    const [accCheck] = await pool.query('SELECT userId FROM accounts WHERE id = ?', [accountId]);
    if (accCheck.length === 0 || accCheck[0].userId !== req.userId) {
      return res.status(403).json({ error: 'Account does not belong to this user.' });
    }
    await pool.query(
      `INSERT INTO recurring_transactions 
        (id, userId, accountId, type, amount, categoryId, note, merchant, frequency, nextDueDate, isActive, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE
        amount=?, categoryId=?, note=?, merchant=?, frequency=?, nextDueDate=?, isActive=1, updatedAt=?`,
      [
        cleanId, req.userId, accountId, type, amount,
        categoryId || null, note || '', merchant || '',
        frequency, nextDueDate, Date.now(),
        amount, categoryId || null, note || '', merchant || '',
        frequency, nextDueDate, Date.now()
      ]
    );
    res.json({ success: true, id: cleanId });
  } catch (error) {
    console.error('Create Recurring Error:', error);
    res.status(500).json({ error: 'Failed to create recurring transaction.' });
  }
});

app.delete(['/recurring/:id', '/api/recurring/:id'], authenticate, async (req, res) => {
  try {
    await pool.query(
      'UPDATE recurring_transactions SET isActive = 0 WHERE id = ? AND userId = ?',
      [req.params.id, req.userId]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Delete Recurring Error:', error);
    res.status(500).json({ error: 'Failed to delete recurring transaction.' });
  }
});

async function adjustAccountBalance(connection, type, amount, accountId, toAccountId, sign) {
  let delta = 0;
  if (type === 'income') delta = amount;
  if (type === 'expense') delta = -amount;
  if (type === 'transfer') {
    await connection.query('UPDATE accounts SET balance = balance - ? WHERE id = ?', [amount, accountId]);
    await connection.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [amount, toAccountId]);
  } else {
    await connection.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [delta * sign, accountId]);
  }
}

app.post(['/recurring/process', '/api/recurring/process'], authenticate, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [due] = await connection.query(
      `SELECT * FROM recurring_transactions WHERE userId = ? AND isActive = 1 AND nextDueDate <= ?`,
      [req.userId, today]
    );
    const created = [];
    for (const rule of due) {
      const txnId = 'txn_' + Math.random().toString(36).substring(2, 11);
      const now = Date.now();
      await connection.query(
        `INSERT INTO transactions (id, userId, accountId, type, amount, categoryId, note, merchant, date, updatedAt)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [txnId, req.userId, rule.accountId, rule.type, rule.amount, rule.categoryId, rule.note, rule.merchant, new Date().toISOString(), now]
      );
      await adjustAccountBalance(connection, rule.type, rule.amount, rule.accountId, null, 1);
      const next = new Date(rule.nextDueDate);
      if (rule.frequency === 'daily') next.setDate(next.getDate() + 1);
      else if (rule.frequency === 'weekly') next.setDate(next.getDate() + 7);
      else if (rule.frequency === 'monthly') next.setMonth(next.getMonth() + 1);
      else if (rule.frequency === 'yearly') next.setFullYear(next.getFullYear() + 1);
      const nextDueDate = next.toISOString().slice(0, 10);
      await connection.query(
        `UPDATE recurring_transactions SET nextDueDate = ?, lastProcessed = ?, updatedAt = ? WHERE id = ?`,
        [nextDueDate, today, Date.now(), rule.id]
      );
      created.push({ txnId, ruleId: rule.id, amount: rule.amount, type: rule.type });
    }
    await connection.commit();
    res.json({ success: true, processed: created.length, transactions: created });
  } catch (error) {
    await connection.rollback();
    console.error('Process Recurring Error:', error);
    res.status(500).json({ error: 'Failed to process recurring transactions.' });
  } finally {
    connection.release();
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// Start
// ─────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
runMigrations()
  .then(() => {
    app.listen(PORT, () => console.log(`🚀 Coinzy server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('❌ Migration failed:', err);
    process.exit(1);
  });