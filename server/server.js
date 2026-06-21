require('dotenv').config();
const express = require('express');
const cors = require('cors');
const nodemailer = require('nodemailer');

const app = express();
const PORT = process.env.PORT || 5000;

// Enable CORS so the mobile app can connect
app.use(cors());
app.use(express.json());

// In-memory store for OTPs
// Key: email (lowercase), Value: { code: string, name: string, expiresAt: number }
const otpStore = new Map();

// Configure the Gmail SMTP transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_PASS, // 16-character App Password
  },
});

// Verify connection configuration on startup
transporter.verify((error) => {
  if (error) {
    console.error('SMTP Connection Error. Please verify your App Password in .env:', error);
  } else {
    console.log('Gmail SMTP transporter is ready to send emails!');
  }
});

// Endpoint: Send OTP
app.post('/api/auth/send-otp', async (req, res) => {
  const { email, name } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  const emailLower = email.trim().toLowerCase();
  
  // Generate a random 6-digit OTP code
  const code = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = Date.now() + 5 * 60 * 1000; // Expires in 5 minutes

  // Save to in-memory store
  otpStore.set(emailLower, { code, name: name ? name.trim() : '', expiresAt });

  console.log(`[AUTH] Generating OTP ${code} for email: ${emailLower}`);

  // If using placeholder credentials, do not attempt to send to avoid crashes, just log
  if (!process.env.GMAIL_USER || !process.env.GMAIL_PASS || process.env.GMAIL_PASS.startsWith('your-')) {
    console.warn('[AUTH] SMTP credentials are not configured. Running in local fallback mode. Code:', code);
    return res.json({ 
      success: true, 
      message: 'OTP generated (SMTP credentials missing; check server terminal logs for the code).' 
    });
  }

  // Compose the email
  const mailOptions = {
    from: `"Coinzy" <${process.env.GMAIL_USER}>`,
    to: emailLower,
    subject: 'Your Coinzy Verification Code 🪙',
    html: `
      <div style="font-family: Arial, sans-serif; padding: 20px; color: #1e293b; max-width: 500px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px;">
        <h2 style="color: #7c3aed; text-align: center;">Welcome to Coinzy</h2>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p>Hello ${name ? name.trim() : 'there'},</p>
        <p>Use the following 6-digit verification code to complete your sign up or log in:</p>
        <div style="background-color: #f1f5f9; padding: 15px; border-radius: 6px; text-align: center; margin: 25px 0;">
          <span style="font-size: 32px; font-weight: bold; letter-spacing: 6px; color: #7c3aed;">${code}</span>
        </div>
        <p style="font-size: 14px; color: #64748b;">This code was requested for logging in to Coinzy. It is valid for the next 5 minutes. If you did not request this, you can safely ignore this email.</p>
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="text-align: center; font-size: 12px; color: #94a3b8;">&copy; ${new Date().getFullYear()} Coinzy Finance Tracker</p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`[AUTH] Verification email sent to: ${emailLower}`);
    res.json({ success: true, message: 'Verification email sent.' });
  } catch (error) {
    console.error('[AUTH] Failed to send email via SMTP:', error);
    res.status(500).json({ error: 'Failed to send verification email. Please check server setup.' });
  }
});

// Endpoint: Verify OTP
app.post('/api/auth/verify-otp', (req, res) => {
  const { email, token } = req.body;

  if (!email || !token) {
    return res.status(400).json({ error: 'Email and verification code are required.' });
  }

  const emailLower = email.trim().toLowerCase();
  const tokenClean = token.trim();
  const savedOtp = otpStore.get(emailLower);

  if (!savedOtp) {
    return res.status(400).json({ error: 'No verification code was sent to this email address.' });
  }

  // Check if expired
  if (Date.now() > savedOtp.expiresAt) {
    otpStore.delete(emailLower);
    return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
  }

  // Check if code matches
  if (savedOtp.code !== tokenClean) {
    return res.status(400).json({ error: 'Invalid verification code. Please enter the correct code.' });
  }

  // Verification successful! Clear the OTP
  otpStore.delete(emailLower);
  console.log(`[AUTH] Verification successful for: ${emailLower}`);

  // Return user session profile
  res.json({
    success: true,
    user: {
      id: 'usr_' + Math.random().toString(36).substr(2, 9),
      name: savedOtp.name || emailLower.split('@')[0] || 'You',
      email: emailLower,
    },
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Coinzy self-hosted auth server is running on http://localhost:${PORT}`);
});
