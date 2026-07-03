const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const otpGenerator = require('otp-generator');
const { pool } = require('../db');
const { validate, schemas } = require('../validation');
const { authLimiter, otpLimiter, resendLimiter } = require('../middleware/rateLimiter');

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

function generateAccessToken(userId) {
  return jwt.sign({ userId }, ACCESS_SECRET, { expiresIn: '15m' });
}

function generateRefreshToken(userId) {
  return jwt.sign({ userId }, REFRESH_SECRET, { expiresIn: '30d' });
}

async function storeRefreshToken(userId, token) {
  const id = crypto.randomUUID();
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await pool.query(
    'INSERT INTO refresh_tokens (id, user_id, token, expires_at) VALUES ($1, $2, $3, $4)',
    [id, userId, token, expiresAt]
  );
}

async function sendOTPEmail(email, name, otp) {
  const SibApiV3Sdk = require('sib-api-v3-sdk');
  const defaultClient = SibApiV3Sdk.ApiClient.instance;
  const apiKey = defaultClient.authentications['api-key'];
  apiKey.apiKey = process.env.BREVO_API_KEY;
  const apiInstance = new SibApiV3Sdk.TransactionalEmailsApi();
  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
  sendSmtpEmail.subject = 'Your Coinzy Verification Code';
  sendSmtpEmail.htmlContent = `
    <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
      <h2 style="color:#6366f1">Coinzy</h2>
      <p>Hi ${name},</p>
      <p>Your verification code is:</p>
      <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#6366f1;margin:24px 0">${otp}</div>
      <p style="color:#666">This code expires in <strong>10 minutes</strong>.</p>
      <p style="color:#999;font-size:12px">If you didn't request this, ignore this email.</p>
    </div>
  `;
  sendSmtpEmail.sender = { name: 'Coinzy', email: 'coinzy05@gmail.com' };
  sendSmtpEmail.to = [{ email: email, name: name }];
  await apiInstance.sendTransacEmail(sendSmtpEmail);
}

// ─── Register ────────────────────────────────────────────────────────────────
router.post('/register', authLimiter, validate(schemas.register), async (req, res) => {
  const { name, email, password } = req.validated;
  const deviceId = req.body.deviceId || null;
  try {
    // Check device account limit (max 4 accounts per device)
    if (deviceId) {
      const { rows: deviceRows } = await pool.query(
        'SELECT COUNT(*) as count FROM device_accounts WHERE device_id = $1',
        [deviceId]
      );
      if (parseInt(deviceRows[0].count) >= 4) {
        return res.status(403).json({ error: 'device_limit_reached', message: 'This device has reached the maximum of 4 accounts.' });
      }
    }

    const { rows: existing } = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.length > 0) {
      return res.status(409).json({ error: 'An account with this email already exists.' });
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    const otp = otpGenerator.generate(6, {
      digits: true, lowerCaseAlphabets: false, upperCaseAlphabets: false, specialChars: false,
    });
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    const id = crypto.randomUUID();
    await pool.query(
      `INSERT INTO pending_registrations (id, name, email, password, otp, otp_attempts, resend_count, expires_at)
       VALUES ($1, $2, $3, $4, $5, 0, 0, $6)
       ON CONFLICT (email) DO UPDATE SET
         name = EXCLUDED.name, password = EXCLUDED.password,
         otp = EXCLUDED.otp, otp_attempts = 0,
         resend_count = 0, expires_at = EXCLUDED.expires_at`,
      [id, name, email, hashedPassword, otp, expiresAt]
    );
    await sendOTPEmail(email, name, otp);
    return res.status(200).json({ message: 'OTP sent to your email.' });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

// ─── Verify OTP ──────────────────────────────────────────────────────────────
router.post('/verify-otp', otpLimiter, async (req, res) => {
  const { email, otp, deviceId } = req.body;
  if (!email || !otp) {
    return res.status(400).json({ error: 'Email and OTP are required.' });
  }
  try {
    const { rows } = await pool.query('SELECT * FROM pending_registrations WHERE email = $1', [email]);
    if (rows.length === 0) {
      return res.status(400).json({ error: 'No pending registration found. Please register again.' });
    }
    const pending = rows[0];
    if (new Date() > new Date(pending.expires_at)) {
      await pool.query('DELETE FROM pending_registrations WHERE email = $1', [email]);
      return res.status(400).json({ error: 'OTP has expired. Please register again.' });
    }
    if (pending.otp_attempts >= 5) {
      await pool.query('DELETE FROM pending_registrations WHERE email = $1', [email]);
      return res.status(400).json({ error: 'Too many incorrect attempts. Please register again.' });
    }
    if (pending.otp !== String(otp).trim()) {
      await pool.query('UPDATE pending_registrations SET otp_attempts = otp_attempts + 1 WHERE email = $1', [email]);
      const remaining = 5 - (pending.otp_attempts + 1);
      return res.status(400).json({ error: `Incorrect OTP. ${remaining} attempt(s) remaining.` });
    }
    const userId = crypto.randomUUID();
    await pool.query('INSERT INTO users (id, name, email, password) VALUES ($1, $2, $3, $4)', [userId, pending.name, pending.email, pending.password]);
    await pool.query('DELETE FROM pending_registrations WHERE email = $1', [email]);

    // Record device-account mapping if deviceId was provided
    if (deviceId) {
      const deviceAccountId = crypto.randomUUID();
      await pool.query(
        'INSERT INTO device_accounts (id, device_id, user_id) VALUES ($1, $2, $3) ON CONFLICT (device_id, user_id) DO NOTHING',
        [deviceAccountId, deviceId, userId]
      );
    }

    const accessToken = generateAccessToken(userId);
    const refreshToken = generateRefreshToken(userId);
    await storeRefreshToken(userId, refreshToken);
    return res.status(201).json({ accessToken, refreshToken, userId, name: pending.name, email: pending.email });
  } catch (err) {
    console.error('Verify OTP error:', err);
    return res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
});

// ─── Resend OTP ──────────────────────────────────────────────────────────────
router.post('/resend-otp', resendLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email is required.' });
  try {
    const { rows } = await pool.query('SELECT * FROM pending_registrations WHERE email = $1', [email]);
    if (rows.length === 0) {
      return res.status(400).json({ error: 'No pending registration found. Please register again.' });
    }
    const pending = rows[0];
    if (pending.resend_count >= 3) {
      return res.status(429).json({ error: 'Maximum resend limit reached. Please register again after 15 minutes.' });
    }
    if (pending.last_resend) {
      const secondsSince = (Date.now() - new Date(pending.last_resend).getTime()) / 1000;
      if (secondsSince < 60) {
        const wait = Math.ceil(60 - secondsSince);
        return res.status(429).json({ error: `Please wait ${wait} seconds before requesting a new OTP.` });
      }
    }
    const otp = otpGenerator.generate(6, { digits: true, lowerCaseAlphabets: false, upperCaseAlphabets: false, specialChars: false });
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
    await pool.query(
      `UPDATE pending_registrations SET otp = $1, otp_attempts = 0, resend_count = resend_count + 1, last_resend = NOW(), expires_at = $2 WHERE email = $3`,
      [otp, expiresAt, email]
    );
    await sendOTPEmail(email, pending.name, otp);
    return res.json({ message: 'New OTP sent to your email.' });
  } catch (err) {
    console.error('Resend OTP error:', err);
    return res.status(500).json({ error: 'Failed to resend OTP.' });
  }
});

// ─── Login ───────────────────────────────────────────────────────────────────
router.post('/login', authLimiter, validate(schemas.login), async (req, res) => {
  const { email, password } = req.validated;
  try {
    const { rows } = await pool.query('SELECT * FROM users WHERE email = $1', [email]);
    if (rows.length === 0) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const user = rows[0];
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }
    const accessToken = generateAccessToken(user.id);
    const refreshToken = generateRefreshToken(user.id);
    await storeRefreshToken(user.id, refreshToken);
    return res.json({ accessToken, refreshToken, userId: user.id, name: user.name, email: user.email });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

// ─── Refresh Token ───────────────────────────────────────────────────────────
router.post('/refresh', validate(schemas.refreshToken), async (req, res) => {
  const { refreshToken } = req.validated;
  try {
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, REFRESH_SECRET);
    } catch {
      return res.status(401).json({ error: 'Invalid or expired refresh token.' });
    }
    const { rows } = await pool.query('SELECT * FROM refresh_tokens WHERE user_id = $1 AND expires_at > NOW()', [decoded.userId]);
    const match = rows.find((r) => r.token === refreshToken);
    if (!match) {
      return res.status(401).json({ error: 'Refresh token not recognised.' });
    }
    await pool.query('DELETE FROM refresh_tokens WHERE id = $1', [match.id]);
    const newAccessToken = generateAccessToken(decoded.userId);
    const newRefreshToken = generateRefreshToken(decoded.userId);
    await storeRefreshToken(decoded.userId, newRefreshToken);
    return res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error('Refresh error:', err);
    return res.status(500).json({ error: 'Token refresh failed.' });
  }
});

// ─── Logout ──────────────────────────────────────────────────────────────────
router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;
  const header = req.headers.authorization;
  if (!header) return res.json({ message: 'Logged out.' });
  try {
    if (refreshToken) {
      await pool.query('DELETE FROM refresh_tokens WHERE token = $1', [refreshToken]);
    }
    return res.json({ message: 'Logged out.' });
  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ error: 'Logout failed.' });
  }
});

module.exports = router;