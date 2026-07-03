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

    // Build WHERE clause dynamically with $n placeholders
    const conditions = ['user_id = $1', 'deleted_at IS NULL'];
    const params = [req.userId];
    let idx = 2;

    if (category) { conditions.push(`category_id = $${idx++}`); params.push(category); }
    if (type)     { conditions.push(`type = $${idx++}`);        params.push(type);     }
    if (from)     { conditions.push(`date >= $${idx++}`);       params.push(from);     }
    if (to)       { conditions.push(`date <= $${idx++}`);       params.push(to);       }

    const where = conditions.join(' AND ');

    const countResult = await pool.query(
      `SELECT COUNT(*) AS total FROM transactions WHERE ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0].total, 10);

    const dataResult = await pool.query(
      `SELECT * FROM transactions WHERE ${where} ORDER BY date DESC, created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    const mappedData = dataResult.rows.map(row => ({
      id: row.id,
      userId: row.user_id,
      accountId: row.account_id,
      toAccountId: row.to_account_id,
      type: row.type,
      amount: Number(row.amount),
      categoryId: row.category_id,
      note: row.note,
      date: row.date ? (row.date instanceof Date ? row.date.toISOString().split('T')[0] : row.date) : row.date,
      merchant: row.merchant,
      customCategory: row.custom_category,
      items: row.items ? (typeof row.items === 'string' ? JSON.parse(row.items) : row.items) : null,
      updatedAt: row.updated_at ? Number(row.updated_at) : 0,
    }));

    return res.json({
      data: mappedData,
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

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Verify account belongs to user
    const accCheck = await client.query(
      'SELECT user_id FROM accounts WHERE id = $1',
      [accountId]
    );
    if (accCheck.rows.length === 0 || accCheck.rows[0].user_id !== req.userId) {
      await client.query('ROLLBACK');
      return res.status(403).json({ error: 'Account does not belong to this user.' });
    }

    const txnId = id || crypto.randomUUID();
    await client.query(
      `INSERT INTO transactions
         (id, user_id, account_id, to_account_id, type, amount, category_id, note, date, merchant, custom_category, items)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [txnId, req.userId, accountId, toAccountId || null, type, amount,
       categoryId || null, note || null, date, merchant || null, customCategory || null, items || null]
    );

    // Update account balance
    if (type === 'income') {
      await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [amount, accountId]);
    } else if (type === 'expense') {
      await client.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [amount, accountId]);
    } else if (type === 'transfer' && toAccountId) {
      await client.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [amount, accountId]);
      await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [amount, toAccountId]);
    }

    await client.query('COMMIT');
    return res.status(200).json({ success: true, id: txnId });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Create transaction error:', err);
    return res.status(500).json({ error: 'Failed to create transaction.' });
  } finally {
    client.release();
  }
});

// ─── DELETE /transactions/:id (soft delete) ───────────────────────────────────
router.delete('/:id', authenticate, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const result = await client.query(
      'SELECT * FROM transactions WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL',
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Transaction not found.' });
    }

    const txn = result.rows[0];

    // Soft delete
    await client.query(
      'UPDATE transactions SET deleted_at = NOW() WHERE id = $1',
      [req.params.id]
    );

    // Reverse the balance effect
    if (txn.type === 'income') {
      await client.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [txn.amount, txn.account_id]);
    } else if (txn.type === 'expense') {
      await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [txn.amount, txn.account_id]);
    } else if (txn.type === 'transfer' && txn.to_account_id) {
      await client.query('UPDATE accounts SET balance = balance + $1 WHERE id = $2', [txn.amount, txn.account_id]);
      await client.query('UPDATE accounts SET balance = balance - $1 WHERE id = $2', [txn.amount, txn.to_account_id]);
    }

    await client.query('COMMIT');
    return res.json({ deleted: true });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Delete transaction error:', err);
    return res.status(500).json({ error: 'Failed to delete transaction.' });
  } finally {
    client.release();
  }
});

module.exports = router;
