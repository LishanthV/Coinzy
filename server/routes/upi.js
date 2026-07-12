const router = require('express').Router();
const crypto = require('crypto');
const { pool } = require('../db');
const { authenticate } = require('../middleware/authenticate');

// ══════════════════════════════════════════════════════════════════════════════
// UPI SMS PARSING HELPERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Parse a raw UPI SMS message into a structured transaction object.
 * Handles common formats from HDFC, SBI, ICICI, Paytm, PhonePe, GPay, etc.
 */
function parseUpiSms(raw) {
  const text = raw.trim();

  // ── Amount extraction ──────────────────────────────────────────────────────
  const amountPatterns = [
    /(?:INR|Rs\.?|₹)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /([\d,]+(?:\.\d{1,2})?)\s*(?:INR|Rs\.?|₹)/i,
  ];
  let amount = null;
  for (const pat of amountPatterns) {
    const m = text.match(pat);
    if (m) { amount = parseFloat(m[1].replace(/,/g, '')); break; }
  }
  if (!amount || isNaN(amount)) return null;

  // ── Transaction type ───────────────────────────────────────────────────────
  const isDebit =
    /\b(debited|debit|paid|sent|charged|withdrawn|payment\s+of|spent)\b/i.test(text);
  const isCredit =
    /\b(credited|credit|received|refund|cashback|deposited)\b/i.test(text);
  const type = isDebit ? 'expense' : isCredit ? 'income' : 'expense'; // default expense

  // ── Merchant / sender extraction ──────────────────────────────────────────
  let merchant = null;
  const merchantPatterns = [
    /(?:to|at|paid\s+to|sent\s+to)\s+([A-Za-z0-9 &'.\-]+?)(?:\s+on|\s+via|\s+UPI|\.|\n|$)/i,
    /(?:from|received\s+from)\s+([A-Za-z0-9 &'.\-]+?)(?:\s+on|\s+via|\s+UPI|\.|\n|$)/i,
    /(?:VPA|UPI ID):\s*([^\s]+)/i,
  ];
  for (const pat of merchantPatterns) {
    const m = text.match(pat);
    if (m) { merchant = m[1].trim(); break; }
  }

  // ── Date extraction ────────────────────────────────────────────────────────
  let date = new Date().toISOString().slice(0, 10); // default today
  const datePatterns = [
    /(\d{2}[\/\-]\d{2}[\/\-]\d{2,4})/,
    /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{2,4})/i,
  ];
  for (const pat of datePatterns) {
    const m = text.match(pat);
    if (m) {
      const parsed = new Date(m[1]);
      if (!isNaN(parsed.getTime())) {
        date = parsed.toISOString().slice(0, 10);
        break;
      }
    }
  }

  // ── UPI Ref / Transaction ID ───────────────────────────────────────────────
  let upiRef = null;
  const refPatterns = [
    /(?:UPI\s*Ref|Ref(?:erence)?\.?\s*(?:No\.?|ID)?|Txn\s*ID|Transaction\s*ID)[\s:#]*([A-Z0-9]+)/i,
    /\b(\d{12})\b/, // 12-digit ref common in UPI
  ];
  for (const pat of refPatterns) {
    const m = text.match(pat);
    if (m) { upiRef = m[1]; break; }
  }

  return { amount, type, merchant, date, upiRef, rawSms: text };
}

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES
// ══════════════════════════════════════════════════════════════════════════════

// POST /api/upi/parse
// Parse one or more SMS messages and return structured data (preview, no DB write)
router.post('/parse', authenticate, async (req, res) => {
  try {
    const { messages } = req.body;
    if (!Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages array is required.' });
    }
    if (messages.length > 200) {
      return res.status(400).json({ error: 'Maximum 200 messages per request.' });
    }

    const parsed = messages
      .map((msg) => parseUpiSms(typeof msg === 'string' ? msg : msg.body || ''))
      .filter(Boolean);

    res.json({ parsed, total: parsed.length });
  } catch (err) {
    console.error('UPI parse error:', err);
    res.status(500).json({ error: 'Failed to parse messages.' });
  }
});

// POST /api/upi/sync
// Save parsed UPI transactions to upi_transactions table (deduped by upi_ref)
router.post('/sync', authenticate, async (req, res) => {
  try {
    const { transactions, accountId } = req.body;
    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ error: 'transactions array is required.' });
    }
    if (!accountId) {
      return res.status(400).json({ error: 'accountId is required.' });
    }

    // Verify the account belongs to this user
    const accCheck = await pool.query(
      'SELECT id FROM accounts WHERE id = $1 AND user_id = $2',
      [accountId, req.userId]
    );
    if (accCheck.rows.length === 0) {
      return res.status(403).json({ error: 'Account not found or access denied.' });
    }

    let imported = 0;
    let skipped = 0;

    for (const txn of transactions) {
      const { amount, type, merchant, date, upiRef, rawSms } = txn;
      if (!amount || !date) { skipped++; continue; }

      const id = crypto.randomUUID();

      try {
        // Deduplicate by upi_ref if present
        if (upiRef) {
          const exists = await pool.query(
            'SELECT id FROM upi_transactions WHERE user_id = $1 AND upi_ref = $2',
            [req.userId, upiRef]
          );
          if (exists.rows.length > 0) { skipped++; continue; }
        }

        await pool.query(
          `INSERT INTO upi_transactions
             (id, user_id, account_id, amount, type, merchant, date, upi_ref, raw_sms, synced_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())`,
          [id, req.userId, accountId, amount, type, merchant || null, date, upiRef || null, rawSms || null]
        );
        imported++;
      } catch (innerErr) {
        console.error('UPI insert error:', innerErr.message);
        skipped++;
      }
    }

    res.json({ imported, skipped, total: transactions.length });
  } catch (err) {
    console.error('UPI sync error:', err);
    res.status(500).json({ error: 'Failed to sync UPI transactions.' });
  }
});

// GET /api/upi/history
// Fetch all UPI-synced transactions for this user
router.get('/history', authenticate, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = parseInt(req.query.offset) || 0;

    const result = await pool.query(
      `SELECT id, account_id, amount, type, merchant, date, upi_ref, synced_at
       FROM upi_transactions
       WHERE user_id = $1
       ORDER BY date DESC, synced_at DESC
       LIMIT $2 OFFSET $3`,
      [req.userId, limit, offset]
    );

    res.json({ transactions: result.rows, total: result.rows.length });
  } catch (err) {
    console.error('UPI history error:', err);
    res.status(500).json({ error: 'Failed to fetch UPI history.' });
  }
});

// DELETE /api/upi/:id
// Remove a specific UPI-synced transaction
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const result = await pool.query(
      'DELETE FROM upi_transactions WHERE id = $1 AND user_id = $2 RETURNING id',
      [req.params.id, req.userId]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Transaction not found.' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('UPI delete error:', err);
    res.status(500).json({ error: 'Failed to delete UPI transaction.' });
  }
});

module.exports = router;
