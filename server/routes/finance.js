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
    const result = await pool.query(
      'SELECT * FROM accounts WHERE user_id = $1 ORDER BY name ASC',
      [req.userId]
    );
    const mapped = result.rows.map(row => ({
      id: row.id,
      name: row.name,
      type: row.type,
      balance: Number(row.balance),
      color: row.color,
      icon: row.icon,
      currency: row.currency,
    }));
    return res.json(mapped);
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
      'INSERT INTO accounts (id, user_id, name, type, balance, color, icon, currency) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
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
    const check = await pool.query(
      'SELECT id FROM accounts WHERE id = $1 AND user_id = $2',
      [req.params.id, req.userId]
    );
    if (check.rows.length === 0) return res.status(404).json({ error: 'Account not found.' });

    await pool.query('DELETE FROM accounts WHERE id = $1 AND user_id = $2', [req.params.id, req.userId]);
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
    const result = await pool.query(
      'SELECT id, name, email, created_at FROM users WHERE id = $1',
      [req.userId]
    );
    if (result.rows.length === 0) return res.status(404).json({ error: 'User not found.' });
    return res.json(result.rows[0]);
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
    const result = await pool.query(
      'SELECT * FROM budgets WHERE user_id = $1',
      [req.userId]
    );
    const mapped = result.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      categoryId: row.category_id,
      limit: Number(row.limit),
      period: row.period
    }));
    return res.json(mapped);
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
      `INSERT INTO budgets (id, user_id, category_id, "limit", period)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (user_id, category_id) DO UPDATE SET "limit" = EXCLUDED."limit", period = EXCLUDED.period`,
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
    // Supports deleting either by UUID (id) or by Category ID (category_id)
    await pool.query(
      'DELETE FROM budgets WHERE (id = $1 OR category_id = $1) AND user_id = $2',
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
    const result = await pool.query(
      'SELECT * FROM savings_goals WHERE user_id = $1 ORDER BY updated_at DESC',
      [req.userId]
    );
    const formatted = result.rows.map((g) => ({
      id: g.id,
      userId: g.user_id,
      name: g.name,
      targetAmount: Number(g.target_amount),
      currentAmount: Number(g.current_amount),
      targetDate: g.target_date ? (g.target_date instanceof Date ? g.target_date.toISOString().split('T')[0] : g.target_date) : null,
      updatedAt: g.updated_at ? Number(g.updated_at) : 0,
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
      `INSERT INTO savings_goals (id, user_id, name, target_amount, current_amount, target_date, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, target_amount = EXCLUDED.target_amount,
         current_amount = EXCLUDED.current_amount, target_date = EXCLUDED.target_date,
         updated_at = EXCLUDED.updated_at`,
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
      'DELETE FROM savings_goals WHERE id = $1 AND user_id = $2',
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
    const result = await pool.query(
      'SELECT * FROM recurring_transactions WHERE user_id = $1 AND is_active = 1 ORDER BY next_due_date ASC',
      [req.userId]
    );
    const mapped = result.rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      accountId: row.account_id,
      type: row.type,
      amount: Number(row.amount),
      categoryId: row.category_id,
      note: row.note,
      merchant: row.merchant,
      frequency: row.frequency,
      nextDueDate: row.next_due_date ? (row.next_due_date instanceof Date ? row.next_due_date.toISOString().split('T')[0] : row.next_due_date) : row.next_due_date,
      lastProcessed: row.last_processed ? (row.last_processed instanceof Date ? row.last_processed.toISOString().split('T')[0] : row.last_processed) : row.last_processed,
      isActive: row.is_active,
      updatedAt: row.updated_at ? Number(row.updated_at) : 0,
    }));
    return res.json(mapped);
  } catch (err) {
    console.error('Get recurring error:', err);
    return res.status(500).json({ error: 'Failed to fetch recurring transactions.' });
  }
});

router.post('/recurring', authenticate, validate(schemas.recurringTransaction), async (req, res) => {
  const { id, accountId, type, amount, categoryId, note, merchant, frequency, nextDueDate } = req.validated;
  const recId = id || ('rec_' + crypto.randomUUID());
  try {
    const accCheck = await pool.query(
      'SELECT user_id FROM accounts WHERE id = $1',
      [accountId]
    );
    if (accCheck.rows.length === 0 || accCheck.rows[0].user_id !== req.userId) {
      return res.status(403).json({ error: 'Account does not belong to this user.' });
    }

    await pool.query(
      `INSERT INTO recurring_transactions
         (id, user_id, account_id, type, amount, category_id, note, merchant, frequency, next_due_date, is_active, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 1, $11)
       ON CONFLICT (id) DO UPDATE SET
         amount = EXCLUDED.amount, category_id = EXCLUDED.category_id, note = EXCLUDED.note,
         merchant = EXCLUDED.merchant, frequency = EXCLUDED.frequency,
         next_due_date = EXCLUDED.next_due_date, is_active = 1, updated_at = EXCLUDED.updated_at`,
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
      'UPDATE recurring_transactions SET is_active = 0 WHERE id = $1 AND user_id = $2',
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
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const dueResult = await client.query(
      'SELECT * FROM recurring_transactions WHERE user_id = $1 AND is_active = 1 AND next_due_date <= $2',
      [req.userId, today]
    );
    const due = dueResult.rows;

    const created = [];
    for (const rule of due) {
      const txnId = 'txn_' + crypto.randomUUID();
      await client.query(
        `INSERT INTO transactions
           (id, user_id, account_id, type, amount, category_id, note, merchant, date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [txnId, req.userId, rule.account_id, rule.type, rule.amount,
         rule.category_id, rule.note, rule.merchant, today]
      );

      // Update balance
      if (rule.type === 'income') {
        await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [rule.amount, rule.account_id]);
      } else if (rule.type === 'expense') {
        await client.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [rule.amount, rule.account_id]);
      }

      // Advance next due date
      const next = new Date(rule.next_due_date);
      if (rule.frequency === 'daily')        next.setDate(next.getDate() + 1);
      else if (rule.frequency === 'weekly')  next.setDate(next.getDate() + 7);
      else if (rule.frequency === 'monthly') next.setMonth(next.getMonth() + 1);
      else if (rule.frequency === 'yearly')  next.setFullYear(next.getFullYear() + 1);

      await client.query(
        'UPDATE recurring_transactions SET next_due_date = $1, last_processed = $2, updated_at = $3 WHERE id = $4',
        [next.toISOString().slice(0, 10), today, Date.now(), rule.id]
      );
      created.push({ txnId, ruleId: rule.id, amount: rule.amount, type: rule.type });
    }

    await client.query('COMMIT');
    return res.json({ success: true, processed: created.length, transactions: created });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Process recurring error:', err);
    return res.status(500).json({ error: 'Failed to process recurring transactions.' });
  } finally {
    client.release();
  }
});

module.exports = router;
