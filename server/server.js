require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET || 'coinzy_secret_key_12345';

// Enable CORS & JSON parsing
app.use(cors());
app.use(express.json());

// MySQL Connection Details (without database name first)
const dbConfig = {
  host: process.env.DB_HOST || '127.0.0.1',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  port: Number(process.env.DB_PORT) || 3306,
};
const DB_NAME = process.env.DB_NAME || 'coinzy_db';

let pool;

// Test connection, auto-create database & run schema check on startup
(async () => {
  try {
    console.log('[Database] Connecting to MySQL server to check database...');
    // 1. Establish single connection to create database if not exists
    const tempConnection = await mysql.createConnection(dbConfig);
    await tempConnection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\``);
    await tempConnection.end();
    console.log(`[Database] Verified/Created MySQL database: "${DB_NAME}"`);

    // 2. Initialize connection pool with database selected
    pool = mysql.createPool({
      ...dbConfig,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
    });

    const connection = await pool.getConnection();
    console.log(`[Database] Successfully connected pool to MySQL database: "${DB_NAME}"!`);
    
    // Check if database tables exist
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id VARCHAR(36) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id VARCHAR(36) PRIMARY KEY,
        userId VARCHAR(36) NOT NULL,
        name VARCHAR(255) NOT NULL,
        type VARCHAR(50) NOT NULL,
        balance DECIMAL(15, 2) DEFAULT 0.00,
        color VARCHAR(50) NOT NULL,
        icon VARCHAR(50) NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS budgets (
        id VARCHAR(36) PRIMARY KEY,
        userId VARCHAR(36) NOT NULL,
        categoryId VARCHAR(50) NOT NULL,
        \`limit\` DECIMAL(15, 2) NOT NULL,
        period VARCHAR(20) DEFAULT 'monthly',
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
      )
    `);

    await connection.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id VARCHAR(36) PRIMARY KEY,
        userId VARCHAR(36) NOT NULL,
        accountId VARCHAR(36) NOT NULL,
        toAccountId VARCHAR(36) DEFAULT NULL,
        type VARCHAR(20) NOT NULL,
        amount DECIMAL(15, 2) NOT NULL,
        categoryId VARCHAR(50) NOT NULL,
        description TEXT,
        date VARCHAR(50) NOT NULL,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE CASCADE
      )
    `);

    connection.release();

    // Start Express Listener after DB is initialized
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`Coinzy MySQL-backed Express server is running on http://localhost:${PORT}`);
    });

  } catch (error) {
    console.error('CRITICAL: Database initialization failed. Please make sure MySQL is running and credentials in server/.env are correct.', error.message);
  }
})();

// Middleware: Authenticate JWT Token
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ error: 'Access token required.' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid or expired token.' });
    }
    req.userId = decoded.id;
    next();
  });
}

// Helper: Apply balance delta to accounts on transaction modifications
async function adjustAccountBalance(connection, type, amount, accountId, toAccountId, sign) {
  const delta = Number(amount) * sign;
  
  if (type === 'income') {
    await connection.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [delta, accountId]);
  } else if (type === 'expense') {
    await connection.query('UPDATE accounts SET balance = balance - ? WHERE id = ?', [delta, accountId]);
  } else if (type === 'transfer') {
    await connection.query('UPDATE accounts SET balance = balance - ? WHERE id = ?', [delta, accountId]);
    if (toAccountId) {
      await connection.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [delta, toAccountId]);
    }
  }
}

// ==========================================
// AUTH ROUTES
// ==========================================

// Register User
app.post('/api/auth/signup', async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  const emailLower = email.trim().toLowerCase();
  
  try {
    // Check if user exists
    const [existing] = await pool.query('SELECT id FROM users WHERE email = ?', [emailLower]);
    if (existing.length > 0) {
      return res.status(400).json({ error: 'An account with this email already exists.' });
    }

    // Hash password and generate UUID
    const hashedPassword = await bcrypt.hash(password, 10);
    const userId = 'usr_' + Math.random().toString(36).substring(2, 11);

    await pool.query(
      'INSERT INTO users (id, name, email, password) VALUES (?, ?, ?, ?)',
      [userId, name.trim(), emailLower, hashedPassword]
    );

    // Create JWT token
    const token = jwt.sign({ id: userId }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      success: true,
      token,
      user: {
        id: userId,
        name: name.trim(),
        email: emailLower,
      },
    });
  } catch (error) {
    console.error('Signup Error:', error);
    res.status(500).json({ error: 'Internal server error during registration.' });
  }
});

// Login User
app.post('/api/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required.' });
  }

  const emailLower = email.trim().toLowerCase();

  try {
    const [users] = await pool.query('SELECT * FROM users WHERE email = ?', [emailLower]);
    if (users.length === 0) {
      return res.status(400).json({ error: 'No account found with this email.' });
    }

    const user = users[0];
    const isPasswordMatch = await bcrypt.compare(password, user.password);

    if (!isPasswordMatch) {
      return res.status(400).json({ error: 'Incorrect password. Please try again.' });
    }

    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });

    res.json({
      success: true,
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
      },
    });
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ error: 'Internal server error during login.' });
  }
});

// ==========================================
// ACCOUNTS ROUTES
// ==========================================

app.get('/api/accounts', authenticateToken, async (req, res) => {
  try {
    const [accounts] = await pool.query('SELECT * FROM accounts WHERE userId = ?', [req.userId]);
    res.json(accounts);
  } catch (error) {
    console.error('Fetch Accounts Error:', error);
    res.status(500).json({ error: 'Failed to fetch accounts.' });
  }
});

app.post('/api/accounts', authenticateToken, async (req, res) => {
  const { id, name, type, balance, color, icon } = req.body;

  if (!id || !name || !type || !color || !icon) {
    return res.status(400).json({ error: 'Missing required account fields.' });
  }

  try {
    await pool.query(
      'INSERT INTO accounts (id, userId, name, type, balance, color, icon) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [id, req.userId, name, type, balance || 0.0, color, icon]
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Create Account Error:', error);
    res.status(500).json({ error: 'Failed to create account.' });
  }
});

// ==========================================
// BUDGETS ROUTES
// ==========================================

app.get('/api/budgets', authenticateToken, async (req, res) => {
  try {
    const [budgets] = await pool.query('SELECT * FROM budgets WHERE userId = ?', [req.userId]);
    res.json(budgets);
  } catch (error) {
    console.error('Fetch Budgets Error:', error);
    res.status(500).json({ error: 'Failed to fetch budgets.' });
  }
});

app.post('/api/budgets', authenticateToken, async (req, res) => {
  const { id, categoryId, limit, period } = req.body;

  if (!id || !categoryId || limit === undefined) {
    return res.status(400).json({ error: 'Missing required budget fields.' });
  }

  try {
    // Check if category budget already exists
    const [existing] = await pool.query(
      'SELECT id FROM budgets WHERE userId = ? AND categoryId = ?',
      [req.userId, categoryId]
    );

    if (existing.length > 0) {
      await pool.query(
        'UPDATE budgets SET `limit` = ? WHERE userId = ? AND categoryId = ?',
        [limit, req.userId, categoryId]
      );
    } else {
      await pool.query(
        'INSERT INTO budgets (id, userId, categoryId, `limit`, period) VALUES (?, ?, ?, ?, ?)',
        [id, req.userId, categoryId, limit, period || 'monthly']
      );
    }
    res.json({ success: true });
  } catch (error) {
    console.error('Upsert Budget Error:', error);
    res.status(500).json({ error: 'Failed to save budget.' });
  }
});

app.delete('/api/budgets/:categoryId', authenticateToken, async (req, res) => {
  const { categoryId } = req.params;

  try {
    await pool.query('DELETE FROM budgets WHERE userId = ? AND categoryId = ?', [req.userId, categoryId]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete Budget Error:', error);
    res.status(500).json({ error: 'Failed to delete budget.' });
  }
});

// ==========================================
// TRANSACTIONS ROUTES
// ==========================================

app.get('/api/transactions', authenticateToken, async (req, res) => {
  try {
    const [transactions] = await pool.query(
      'SELECT * FROM transactions WHERE userId = ? ORDER BY date DESC',
      [req.userId]
    );
    res.json(transactions);
  } catch (error) {
    console.error('Fetch Transactions Error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions.' });
  }
});

app.post('/api/transactions', authenticateToken, async (req, res) => {
  const { id, accountId, toAccountId, type, amount, categoryId, description, date } = req.body;

  if (!id || !accountId || !type || amount === undefined || !categoryId || !date) {
    return res.status(400).json({ error: 'Missing required transaction fields.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Insert transaction
    await connection.query(
      'INSERT INTO transactions (id, userId, accountId, toAccountId, type, amount, categoryId, description, date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [id, req.userId, accountId, toAccountId || null, type, amount, categoryId, description || '', date]
    );

    // Adjust balance (Add transaction delta)
    await adjustAccountBalance(connection, type, amount, accountId, toAccountId, 1);

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Create Transaction Error:', error);
    res.status(500).json({ error: 'Failed to log transaction.' });
  } finally {
    connection.release();
  }
});

app.put('/api/transactions/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const { accountId, toAccountId, type, amount, categoryId, description, date } = req.body;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Fetch old transaction
    const [txns] = await connection.query('SELECT * FROM transactions WHERE id = ? AND userId = ?', [id, req.userId]);
    if (txns.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Transaction not found.' });
    }
    const existing = txns[0];

    // 2. Revert old balance delta
    await adjustAccountBalance(connection, existing.type, existing.amount, existing.accountId, existing.toAccountId, -1);

    // 3. Update transaction details
    await connection.query(
      'UPDATE transactions SET accountId = ?, toAccountId = ?, type = ?, amount = ?, categoryId = ?, description = ?, date = ? WHERE id = ?',
      [accountId, toAccountId || null, type, amount, categoryId, description || '', date, id]
    );

    // 4. Apply new balance delta
    await adjustAccountBalance(connection, type, amount, accountId, toAccountId, 1);

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Update Transaction Error:', error);
    res.status(500).json({ error: 'Failed to update transaction.' });
  } finally {
    connection.release();
  }
});

app.delete('/api/transactions/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Fetch transaction
    const [txns] = await connection.query('SELECT * FROM transactions WHERE id = ? AND userId = ?', [id, req.userId]);
    if (txns.length === 0) {
      connection.release();
      return res.status(404).json({ error: 'Transaction not found.' });
    }
    const existing = txns[0];

    // 2. Revert balance delta (Subtract transaction delta)
    await adjustAccountBalance(connection, existing.type, existing.amount, existing.accountId, existing.toAccountId, -1);

    // 3. Delete from DB
    await connection.query('DELETE FROM transactions WHERE id = ?', [id]);

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Delete Transaction Error:', error);
    res.status(500).json({ error: 'Failed to delete transaction.' });
  } finally {
    connection.release();
  }
});

// ==========================================
// DATA RESETS
// ==========================================

app.post('/api/data/reset', authenticateToken, async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // Delete user's accounts, budgets, and transactions
    await connection.query('DELETE FROM transactions WHERE userId = ?', [req.userId]);
    await connection.query('DELETE FROM budgets WHERE userId = ?', [req.userId]);
    await connection.query('DELETE FROM accounts WHERE userId = ?', [req.userId]);

    await connection.commit();
    res.json({ success: true });
  } catch (error) {
    await connection.rollback();
    console.error('Reset Data Error:', error);
    res.status(500).json({ error: 'Failed to reset data.' });
  } finally {
    connection.release();
  }
});
