async function sendOTPEmail(email, name, otp) {
  const nodemailer = require('nodemailer');
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 5000,
    greetingTimeout: 5000,
    socketTimeout: 5000,
  });
  await transporter.sendMail({
    from: `"Coinzy" <${process.env.SMTP_FROM}>`,
    to: email,
    subject: 'Your Coinzy Verification Code',
    html: `
      <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
        <h2 style="color:#6366f1">Coinzy</h2>
        <p>Hi ${name},</p>
        <p>Your verification code is:</p>
        <div style="font-size:36px;font-weight:bold;letter-spacing:8px;color:#6366f1;margin:24px 0">${otp}</div>
        <p style="color:#666">This code expires in <strong>10 minutes</strong>.</p>
        <p style="color:#999;font-size:12px">If you didn't request this, ignore this email.</p>
      </div>
    `,
  });
}