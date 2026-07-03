const rateLimit = require('express-rate-limit');

const isTest = process.env.NODE_ENV === 'test';
const passThrough = (req, res, next) => next();

const handler = (req, res) => {
  res.status(429).json({ error: 'Too many requests. Please try again later.' });
};

const authLimiter = isTest ? passThrough : rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  keyGenerator: (req) => {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
    return ip + ':' + (req.body?.email || '');
  },
});

const otpLimiter = isTest ? passThrough : rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  keyGenerator: (req) => {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
    return ip + ':otp:' + (req.body?.email || '');
  },
});

const resendLimiter = isTest ? passThrough : rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
  keyGenerator: (req) => {
    const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').toString();
    return ip + ':resend:' + (req.body?.email || '');
  },
});

const apiLimiter = isTest ? passThrough : rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler,
});

module.exports = { authLimiter, otpLimiter, resendLimiter, apiLimiter };