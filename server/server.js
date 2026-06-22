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

console.log('[Database Debug] Configuration:', {
  host: dbConfig.host,
  user: dbConfig.user,
  passwordLength: dbConfig.password ? dbConfig.password.length : 0,
  port: dbConfig.port,
  DB_NAME
});

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
        categoryId VARCHAR(50) DEFAULT NULL,
        note TEXT,
        date VARCHAR(50) NOT NULL,
        merchant VARCHAR(255) DEFAULT NULL,
        items TEXT,
        FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (accountId) REFERENCES accounts(id) ON DELETE CASCADE
      )
    `);

    // Check if we need to run migrations on transactions table (for existing database schemas)
    const [columns] = await connection.query(`SHOW COLUMNS FROM transactions`);
    const columnNames = columns.map(col => col.Field);

    // 1. Rename description to note if description exists and note does not
    if (columnNames.includes('description') && !columnNames.includes('note')) {
      console.log('[Database] Migrating: Renaming transactions.description to transactions.note...');
      await connection.query(`ALTER TABLE transactions CHANGE description note TEXT`);
    } else if (!columnNames.includes('note')) {
      console.log('[Database] Migrating: Adding note column to transactions...');
      await connection.query(`ALTER TABLE transactions ADD COLUMN note TEXT`);
    }

    // 2. Make categoryId nullable to support transfer transactions
    const catCol = columns.find(col => col.Field === 'categoryId');
    if (catCol && catCol.Null === 'NO') {
      console.log('[Database] Migrating: Making transactions.categoryId nullable...');
      await connection.query(`ALTER TABLE transactions MODIFY categoryId VARCHAR(50) DEFAULT NULL`);
    }

    // 3. Add merchant column if missing
    if (!columnNames.includes('merchant')) {
      console.log('[Database] Migrating: Adding merchant column to transactions...');
      await connection.query(`ALTER TABLE transactions ADD COLUMN merchant VARCHAR(255) DEFAULT NULL`);
    }

    // 4. Add items column if missing
    if (!columnNames.includes('items')) {
      console.log('[Database] Migrating: Adding items column to transactions...');
      await connection.query(`ALTER TABLE transactions ADD COLUMN items TEXT`);
    }

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

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      // Insert the user
      await connection.query(
        'INSERT INTO users (id, name, email, password) VALUES (?, ?, ?, ?)',
        [userId, name.trim(), emailLower, hashedPassword]
      );

      // Create default accounts matching frontend seedData colors and icons
      const defaultAccounts = [
        { id: `acc_checking_${userId}`, name: 'Everyday Checking', type: 'checking', balance: 3240.55, color: '#6C6FE0', icon: 'card-outline' },
        { id: `acc_savings_${userId}`, name: 'Savings', type: 'savings', balance: 12850.00, color: '#33C2A1', icon: 'wallet-outline' },
        { id: `acc_credit_${userId}`, name: 'Visa Credit Card', type: 'credit', balance: -482.30, color: '#E2784E', icon: 'card' },
        { id: `acc_cash_${userId}`, name: 'Cash', type: 'cash', balance: 120.00, color: '#E3A23C', icon: 'cash-outline' }
      ];

      for (const acc of defaultAccounts) {
        await connection.query(
          'INSERT INTO accounts (id, userId, name, type, balance, color, icon) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [acc.id, userId, acc.name, acc.type, acc.balance, acc.color, acc.icon]
        );
      }

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      throw err;
    } finally {
      connection.release();
    }

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
    const formatted = accounts.map(a => ({
      ...a,
      balance: Number(a.balance)
    }));
    res.json(formatted);
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
    const formatted = budgets.map(b => ({
      ...b,
      limit: Number(b.limit)
    }));
    res.json(formatted);
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
    const formatted = transactions.map(t => ({
      ...t,
      amount: Number(t.amount),
      note: t.note !== undefined ? t.note : (t.description || ''),
      items: typeof t.items === 'string' ? JSON.parse(t.items) : (t.items || [])
    }));
    res.json(formatted);
  } catch (error) {
    console.error('Fetch Transactions Error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions.' });
  }
});

app.post('/api/transactions', authenticateToken, async (req, res) => {
  const { id, accountId, toAccountId, type, amount, categoryId, note, description, date, merchant, items } = req.body;

  if (!id || !accountId || !type || amount === undefined || !date) {
    return res.status(400).json({ error: 'Missing required transaction fields.' });
  }
  if (type !== 'transfer' && !categoryId) {
    return res.status(400).json({ error: 'Missing category for non-transfer transaction.' });
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const noteVal = note !== undefined ? note : (description || '');
    const itemsVal = items ? (typeof items === 'string' ? items : JSON.stringify(items)) : '[]';
    const merchantVal = merchant || null;

    // Insert transaction
    await connection.query(
      'INSERT INTO transactions (id, userId, accountId, toAccountId, type, amount, categoryId, note, date, merchant, items) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        id,
        req.userId,
        accountId,
        type === 'transfer' ? toAccountId : null,
        type,
        amount,
        type === 'transfer' ? null : categoryId,
        noteVal,
        date,
        merchantVal,
        itemsVal
      ]
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
  const { accountId, toAccountId, type, amount, categoryId, note, description, date, merchant, items } = req.body;

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    // 1. Fetch old transaction
    const [txns] = await connection.query('SELECT * FROM transactions WHERE id = ? AND userId = ?', [id, req.userId]);
    if (txns.length === 0) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }
    const existing = txns[0];

    // 2. Revert old balance delta
    await adjustAccountBalance(connection, existing.type, existing.amount, existing.accountId, existing.toAccountId, -1);

    const noteVal = note !== undefined ? note : (description || '');
    const itemsVal = items ? (typeof items === 'string' ? items : JSON.stringify(items)) : '[]';
    const merchantVal = merchant || null;

    // 3. Update transaction details
    await connection.query(
      'UPDATE transactions SET accountId = ?, toAccountId = ?, type = ?, amount = ?, categoryId = ?, note = ?, date = ?, merchant = ?, items = ? WHERE id = ?',
      [
        accountId,
        type === 'transfer' ? toAccountId : null,
        type,
        amount,
        type === 'transfer' ? null : categoryId,
        noteVal,
        date,
        merchantVal,
        itemsVal,
        id
      ]
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

    const userId = req.userId;

    // Delete user's accounts, budgets, and transactions
    await connection.query('DELETE FROM transactions WHERE userId = ?', [userId]);
    await connection.query('DELETE FROM budgets WHERE userId = ?', [userId]);
    await connection.query('DELETE FROM accounts WHERE userId = ?', [userId]);

    // Recreate default accounts matching frontend seedData with 0 balance
    const defaultAccounts = [
      { id: `acc_checking_${userId}`, name: 'Everyday Checking', type: 'checking', balance: 0.00, color: '#6C6FE0', icon: 'card-outline' },
      { id: `acc_savings_${userId}`, name: 'Savings', type: 'savings', balance: 0.00, color: '#33C2A1', icon: 'wallet-outline' },
      { id: `acc_credit_${userId}`, name: 'Visa Credit Card', type: 'credit', balance: 0.00, color: '#E2784E', icon: 'card' },
      { id: `acc_cash_${userId}`, name: 'Cash', type: 'cash', balance: 0.00, color: '#E3A23C', icon: 'cash-outline' }
    ];

    for (const acc of defaultAccounts) {
      await connection.query(
        'INSERT INTO accounts (id, userId, name, type, balance, color, icon) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [acc.id, userId, acc.name, acc.type, acc.balance, acc.color, acc.icon]
      );
    }

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
