const router = require('express').Router();
const crypto = require('crypto');
const { pool } = require('../db');
const { validate, schemas } = require('../validation');
const { authenticate } = require('../middleware/authenticate');

// ─── GET /transactions (paginated) ───────────────────────────────────────────
router.get('/', authenticate, async (req, res) => {
  try {
    const page     = Math.max(1, parseInt(req.query.page)  || 1);
    const limit    = Math.min(100, parseInt(req.query.limit) || 50);
    const offset   = (page - 1) * limit;
    const category = req.query.category || null;
    const type     = req.query.type     || null;
    const from     = req.query.from     || null;
    const to       = req.query.to       || null;

    // Build WHERE clause dynamically
    const conditions = ['userId = ?', 'deleted_at IS NULL'];
    const params = [req.userId];

    if (category) { conditions.push('categoryId = ?'); params.push(category); }
    if (type)     { conditions.push('type = ?');       params.push(type);     }
    if (from)     { conditions.push('date >= ?');      params.push(from);     }
    if (to)       { conditions.push('date <= ?');      params.push(to);       }

    const where = conditions.join(' AND ');

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM transactions WHERE ${where}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT * FROM transactions WHERE ${where} ORDER BY date DESC, created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );

    return res.json({
      data: rows,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
      },
    });
  } catch (err) {
    console.error('Get transactions error:', err);
    return res.status(500).json({ error: 'Failed to fetch transactions.' });
  }
});

// ─── POST /transactions ───────────────────────────────────────────────────────
router.post('/', authenticate, validate(schemas.transaction), async (req, res) => {
  const {
    id, accountId, toAccountId, type, amount,
    categoryId, note, date, merchant, customCategory, items,
  } = req.validated;

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    // Verify account belongs to user
    const [accCheck] = await conn.query(
      'SELECT userId FROM accounts WHERE id = ?',
      [accountId]
    );
    if (accCheck.length === 0 || accCheck[0].userId !== req.userId) {
      await conn.rollback();
      return res.status(403).json({ error: 'Account does not belong to this user.' });
    }

    const txnId = id || crypto.randomUUID();
    await conn.query(
      `INSERT INTO transactions
         (id, userId, accountId, toAccountId, type, amount, categoryId, note, date, merchant, customCategory, items)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [txnId, req.userId, accountId, toAccountId || null, type, amount,
       categoryId || null, note || null, date, merchant || null, customCategory || null, items || null]
    );

    // Update account balance
    if (type === 'income') {
      await conn.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [amount, accountId]);
    } else if (type === 'expense') {
      await conn.query('UPDATE accounts SET balance = balance - ? WHERE id = ?', [amount, accountId]);
    } else if (type === 'transfer' && toAccountId) {
      await conn.query('UPDATE accounts SET balance = balance - ? WHERE id = ?', [amount, accountId]);
      await conn.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [amount, toAccountId]);
    }

    await conn.commit();
    return res.status(200).json({ success: true, id: txnId });
  } catch (err) {
    await conn.rollback();
    console.error('Create transaction error:', err);
    return res.status(500).json({ error: 'Failed to create transaction.' });
  } finally {
    conn.release();
  }
});

// ─── DELETE /transactions/:id (soft delete) ───────────────────────────────────
router.delete('/:id', authenticate, async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [rows] = await conn.query(
      'SELECT * FROM transactions WHERE id = ? AND userId = ? AND deleted_at IS NULL',
      [req.params.id, req.userId]
    );
    if (rows.length === 0) {
      await conn.rollback();
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    const txn = rows[0];

    // Soft delete
    await conn.query(
      'UPDATE transactions SET deleted_at = NOW() WHERE id = ?',
      [req.params.id]
    );

    // Reverse the balance effect
    if (txn.type === 'income') {
      await conn.query('UPDATE accounts SET balance = balance - ? WHERE id = ?', [txn.amount, txn.accountId]);
    } else if (txn.type === 'expense') {
      await conn.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [txn.amount, txn.accountId]);
    } else if (txn.type === 'transfer' && txn.toAccountId) {
      await conn.query('UPDATE accounts SET balance = balance + ? WHERE id = ?', [txn.amount, txn.accountId]);
      await conn.query('UPDATE accounts SET balance = balance - ? WHERE id = ?', [txn.amount, txn.toAccountId]);
    }

    await conn.commit();
    return res.json({ deleted: true });
  } catch (err) {
    await conn.rollback();
    console.error('Delete transaction error:', err);
    return res.status(500).json({ error: 'Failed to delete transaction.' });
  } finally {
    conn.release();
  }
});

module.exports = router;
