const router = require('express').Router();
const crypto = require('crypto');
const { pool } = require('../db');
const { validate, schemas } = require('../validation');
const { authenticate } = require('../middleware/authenticate');

// ══════════════════════════════════════════════════════════════════════════════
// ACCOUNTS
// ══════════════════════════════════════════════════════════════════════════════

router.get('/accounts', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM accounts WHERE userId = ? ORDER BY name ASC',
      [req.userId]
    );
    return res.json(rows);
  } catch (err) {
    console.error('Get accounts error:', err);
    return res.status(500).json({ error: 'Failed to fetch accounts.' });
  }
});

router.post('/accounts', authenticate, validate(schemas.account), async (req, res) => {
  const { id, name, type, balance, color, icon, currency } = req.validated;
  const accountId = id || crypto.randomUUID();
  try {
    await pool.query(
      'INSERT INTO accounts (id, userId, name, type, balance, color, icon, currency) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [accountId, req.userId, name, type, balance, color, icon, currency || 'INR']
    );
    return res.status(200).json({ success: true, id: accountId });
  } catch (err) {
    console.error('Create account error:', err);
    return res.status(500).json({ error: 'Failed to create account.' });
  }
});

router.delete('/accounts/:id', authenticate, async (req, res) => {
  try {
    const [check] = await pool.query(
      'SELECT id FROM accounts WHERE id = ? AND userId = ?',
      [req.params.id, req.userId]
    );
    if (check.length === 0) return res.status(404).json({ error: 'Account not found.' });

    await pool.query('DELETE FROM accounts WHERE id = ? AND userId = ?', [req.params.id, req.userId]);
    return res.json({ deleted: true });
  } catch (err) {
    console.error('Delete account error:', err);
    return res.status(500).json({ error: 'Failed to delete account.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// USER PROFILE
// ══════════════════════════════════════════════════════════════════════════════

router.get('/user', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT id, name, email, created_at FROM users WHERE id = ?',
      [req.userId]
    );
    if (rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    return res.json(rows[0]);
  } catch (err) {
    console.error('Get user error:', err);
    return res.status(500).json({ error: 'Failed to fetch user.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// BUDGETS
// ══════════════════════════════════════════════════════════════════════════════

router.get('/budgets', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM budgets WHERE userId = ?',
      [req.userId]
    );
    return res.json(rows);
  } catch (err) {
    console.error('Get budgets error:', err);
    return res.status(500).json({ error: 'Failed to fetch budgets.' });
  }
});

router.post('/budgets', authenticate, validate(schemas.budget), async (req, res) => {
  const { id, categoryId, limit, period } = req.validated;
  const budgetId = id || crypto.randomUUID();
  try {
    await pool.query(
      `INSERT INTO budgets (id, userId, categoryId, \`limit\`, period)
       VALUES (?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE \`limit\` = VALUES(\`limit\`), period = VALUES(period)`,
      [budgetId, req.userId, categoryId, limit, period || 'monthly']
    );
    return res.status(200).json({ success: true, id: budgetId });
  } catch (err) {
    console.error('Create budget error:', err);
    return res.status(500).json({ error: 'Failed to create budget.' });
  }
});

router.delete('/budgets/:id', authenticate, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM budgets WHERE id = ? AND userId = ?',
      [req.params.id, req.userId]
    );
    return res.json({ deleted: true });
  } catch (err) {
    console.error('Delete budget error:', err);
    return res.status(500).json({ error: 'Failed to delete budget.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// SAVINGS GOALS
// ══════════════════════════════════════════════════════════════════════════════

router.get('/goals', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM savings_goals WHERE userId = ? ORDER BY updatedAt DESC',
      [req.userId]
    );
    const formatted = rows.map((g) => ({
      ...g,
      targetAmount: Number(g.targetAmount),
      currentAmount: Number(g.currentAmount),
    }));
    return res.json(formatted);
  } catch (err) {
    console.error('Get goals error:', err);
    return res.status(500).json({ error: 'Failed to fetch goals.' });
  }
});

router.post('/goals', authenticate, validate(schemas.savingsGoal), async (req, res) => {
  const { id, name, targetAmount, currentAmount, targetDate } = req.validated;
  const goalId = id || crypto.randomUUID();
  try {
    await pool.query(
      `INSERT INTO savings_goals (id, userId, name, targetAmount, currentAmount, targetDate, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         name = VALUES(name), targetAmount = VALUES(targetAmount),
         currentAmount = VALUES(currentAmount), targetDate = VALUES(targetDate),
         updatedAt = VALUES(updatedAt)`,
      [goalId, req.userId, name, targetAmount, currentAmount || 0, targetDate || null, Date.now()]
    );
    return res.status(201).json({ id: goalId });
  } catch (err) {
    console.error('Create goal error:', err);
    return res.status(500).json({ error: 'Failed to create goal.' });
  }
});

router.delete('/goals/:id', authenticate, async (req, res) => {
  try {
    await pool.query(
      'DELETE FROM savings_goals WHERE id = ? AND userId = ?',
      [req.params.id, req.userId]
    );
    return res.json({ deleted: true });
  } catch (err) {
    console.error('Delete goal error:', err);
    return res.status(500).json({ error: 'Failed to delete goal.' });
  }
});

// ══════════════════════════════════════════════════════════════════════════════
// RECURRING TRANSACTIONS
// ══════════════════════════════════════════════════════════════════════════════

router.get('/recurring', authenticate, async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM recurring_transactions WHERE userId = ? AND isActive = 1 ORDER BY nextDueDate ASC',
      [req.userId]
    );
    return res.json(rows.map((r) => ({ ...r, amount: Number(r.amount) })));
  } catch (err) {
    console.error('Get recurring error:', err);
    return res.status(500).json({ error: 'Failed to fetch recurring transactions.' });
  }
});

router.post('/recurring', authenticate, validate(schemas.recurringTransaction), async (req, res) => {
  const { id, accountId, type, amount, categoryId, note, merchant, frequency, nextDueDate } = req.validated;
  const recId = id || ('rec_' + crypto.randomUUID());
  try {
    const [accCheck] = await pool.query(
      'SELECT userId FROM accounts WHERE id = ?',
      [accountId]
    );
    if (accCheck.length === 0 || accCheck[0].userId !== req.userId) {
      return res.status(403).json({ error: 'Account does not belong to this user.' });
    }

    await pool.query(
      `INSERT INTO recurring_transactions
         (id, userId, accountId, type, amount, categoryId, note, merchant, frequency, nextDueDate, isActive, updatedAt)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
       ON DUPLICATE KEY UPDATE
         amount=VALUES(amount), categoryId=VALUES(categoryId), note=VALUES(note),
         merchant=VALUES(merchant), frequency=VALUES(frequency),
         nextDueDate=VALUES(nextDueDate), isActive=1, updatedAt=VALUES(updatedAt)`,
      [recId, req.userId, accountId, type, amount,
       categoryId || null, note || '', merchant || '',
       frequency, nextDueDate, Date.now()]
    );
    return res.json({ success: true, id: recId });
  } catch (err) {
    console.error('Create recurring error:', err);
    return res.status(500).json({ error: 'Failed to create recurring transaction.' });
  }
});

router.delete('/recurring/:id', authenticate, async (req, res) => {
  try {
    await pool.query(
      'UPDATE recurring_transactions SET isActive = 0 WHERE id = ? AND userId = ?',
      [req.params.id, req.userId]
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('Delete recurring error:', err);
    return res.status(500).json({ error: 'Failed to delete recurring transaction.' });
  }
});

// Process due recurring transactions
router.post('/recurring/process', authenticate, async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [due] = await conn.query(
      'SELECT * FROM recurring_transactions WHERE userId = ? AND isActive = 1 AND nextDueDate <= ?',
      [req.userId, today]
    );

    const created = [];
    for (const rule of due) {
      const txnId = 'txn_' + crypto.randomUUID();
      await conn.query(
        `INSERT INTO transactions
           (id, userId, accountId, type, amount, categoryId, note, merchant, date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [txnId, req.userId, rule.accountId, rule.type, rule.amount,
         rule.categoryId, rule.note, rule.merchant, today]
      );

      // Update balance
      if (rule.type === 'income') {
        await conn.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [rule.amount, rule.accountId]);
      } else if (rule.type === 'expense') {
        await conn.query('UPDATE accounts SET balance = balance - ? WHERE id = ?', [rule.amount, rule.accountId]);
      }

      // Advance next due date
      const next = new Date(rule.nextDueDate);
      if (rule.frequency === 'daily')        next.setDate(next.getDate() + 1);
      else if (rule.frequency === 'weekly')  next.setDate(next.getDate() + 7);
      else if (rule.frequency === 'monthly') next.setMonth(next.getMonth() + 1);
      else if (rule.frequency === 'yearly')  next.setFullYear(next.getFullYear() + 1);

      await conn.query(
        'UPDATE recurring_transactions SET nextDueDate = ?, lastProcessed = ?, updatedAt = ? WHERE id = ?',
        [next.toISOString().slice(0, 10), today, Date.now(), rule.id]
      );
      created.push({ txnId, ruleId: rule.id, amount: rule.amount, type: rule.type });
    }

    await conn.commit();
    return res.json({ success: true, processed: created.length, transactions: created });
  } catch (err) {
    await conn.rollback();
    console.error('Process recurring error:', err);
    return res.status(500).json({ error: 'Failed to process recurring transactions.' });
  } finally {
    conn.release();
  }
});

module.exports = router;
