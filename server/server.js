require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const { runMigrations } = require('./db');
const { apiLimiter }    = require('./middleware/rateLimiter');
const authRoutes        = require('./routes/auth');
const transactionRoutes = require('./routes/transactions');
const financeRoutes     = require('./routes/finance');
const logsRoutes        = require('./routes/logs');
const { validate, schemas } = require('./validation');

const app = express();

// ─── Global middleware ────────────────────────────────────────────────────────
app.use(cors({
  origin: [
    'https://coinzy-badr.onrender.com',
    'http://localhost:5000',
    'http://10.224.237.42:5000',
  ],
  credentials: true,
}));
app.use(express.json({ limit: '2mb' }));
app.use(apiLimiter); // Global rate limit — 120 req/min per IP

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api', financeRoutes);

// Also support routes without /api prefix (backwards compat with frontend)
app.use('/auth', authRoutes);
app.use('/transactions', transactionRoutes);
app.use('/logs', logsRoutes);
app.use('/', financeRoutes);

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found.' });
});

// ─── Global error handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  // Never expose internal error details to client
  res.status(500).json({ error: 'An unexpected error occurred. Please try again.' });
});

// ─── Cleanup job ──────────────────────────────────────────────────────────────
const { pool } = require('./db');
let cleanupInterval;
if (process.env.NODE_ENV !== 'test') {
  cleanupInterval = setInterval(async () => {
    try {
      await pool.query('DELETE FROM refresh_tokens WHERE expires_at < NOW()');
      await pool.query('DELETE FROM pending_registrations WHERE expires_at < NOW()');
      console.log('🧹 Expired tokens cleaned');
    } catch (err) {
      console.error('Cleanup error:', err);
    }
  }, 24 * 60 * 60 * 1000);
}

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
if (process.env.NODE_ENV !== 'test') {
  runMigrations()
    .then(() => {
      app.listen(PORT, () => console.log(`🚀 Coinzy server running on port ${PORT}`));
    })
    .catch((err) => {
      console.error('❌ Migration failed:', err);
      process.exit(1);
    });
}

module.exports = app;
