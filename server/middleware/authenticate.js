const jwt = require('jsonwebtoken');
const { pool } = require('../db');

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET || 'coinzy_secret_key_12345';

async function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ code: 'AUTH_REQUIRED', error: 'Authentication required' });
  }
  const token = header.slice(7);
  try {
    const decoded = jwt.verify(token, ACCESS_SECRET);
    const userId = decoded.userId || decoded.id;

    // Check if user still exists in database
    const { rows } = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
    if (rows.length === 0) {
      return res.status(401).json({ code: 'USER_NOT_FOUND', error: 'User not found. Please log in again.' });
    }

    req.userId = userId;
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ code: 'TOKEN_EXPIRED', error: 'Token expired' });
    }
    return res.status(401).json({ code: 'INVALID_TOKEN', error: 'Invalid token' });
  }
}

module.exports = { authenticate };
