process.env.NODE_ENV = 'test';
require('dotenv').config();

// Mock sib-api-v3-sdk BEFORE requiring app
jest.mock('sib-api-v3-sdk', () => {
  return {
    ApiClient: {
      instance: {
        authentications: {
          'api-key': {}
        }
      }
    },
    TransactionalEmailsApi: jest.fn().mockImplementation(() => {
      return {
        sendTransacEmail: jest.fn().mockResolvedValue(true)
      };
    }),
    SendSmtpEmail: jest.fn().mockImplementation(() => {
      return {};
    })
  };
});

// Mock ../db BEFORE requiring app to prevent actual DB connection/migrations in tests
jest.mock('../db', () => {
  const pendingDb = {};
  const usersDb = {};

  const queryMock = jest.fn().mockImplementation((sql, params) => {
    if (sql.includes('SELECT * FROM pending_registrations WHERE email = ?')) {
      const email = params[0];
      const row = pendingDb[email];
      return Promise.resolve([row ? [{ ...row }] : []]);
    }
    if (sql.includes('DELETE FROM pending_registrations WHERE email = ?')) {
      const email = params[0];
      delete pendingDb[email];
      return Promise.resolve([[]]);
    }
    if (sql.includes('UPDATE pending_registrations SET otp_attempts = otp_attempts + 1 WHERE email = ?')) {
      const email = params[0];
      if (pendingDb[email]) {
        pendingDb[email].otp_attempts += 1;
      }
      return Promise.resolve([[]]);
    }
    if (sql.includes('INSERT INTO users (id, name, email, password)')) {
      const [id, name, email, password] = params;
      usersDb[email] = { id, name, email, password };
      return Promise.resolve([[]]);
    }
    if (sql.includes('UPDATE pending_registrations SET otp = ?, otp_attempts = 0, resend_count = resend_count + 1')) {
      const [otp, expiresAt, email] = params;
      if (pendingDb[email]) {
        pendingDb[email].otp = otp;
        pendingDb[email].otp_attempts = 0;
        pendingDb[email].resend_count += 1;
        pendingDb[email].last_resend = new Date().toISOString();
        pendingDb[email].expires_at = expiresAt;
      }
      return Promise.resolve([[]]);
    }
    return Promise.resolve([[]]);
  });

  return {
    query: queryMock,
    pool: {
      query: queryMock,
      getConnection: jest.fn()
    },
    runMigrations: jest.fn().mockResolvedValue(true),
    __setPending: (email, data) => {
      pendingDb[email] = data;
    },
    __getPending: (email) => pendingDb[email],
    __getUser: (email) => usersDb[email],
    __clearAll: () => {
      for (const k in pendingDb) delete pendingDb[k];
      for (const k in usersDb) delete usersDb[k];
    }
  };
});

const dbMock = require('../db');
const request = require('supertest');
const app = require('../server');

describe('OTP Verification & Resend Endpoints', () => {
  beforeEach(() => {
    dbMock.__clearAll();
  });

  describe('POST /api/auth/verify-otp', () => {
    // 1. Reject if email is missing
    it('should reject OTP verification when email is missing', async () => {
      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({ otp: '123456' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Email and OTP are required.');
    });

    // 2. Reject if otp is missing
    it('should reject OTP verification when otp code is missing', async () => {
      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({ email: 'test@example.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Email and OTP are required.');
    });

    // 3. Reject if registration does not exist
    it('should reject OTP verification when registration does not exist', async () => {
      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({ email: 'nonexistent@example.com', otp: '123456' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No pending registration found. Please register again.');
    });

    // 4. Reject if OTP is incorrect
    it('should reject OTP verification when OTP is incorrect', async () => {
      dbMock.__setPending('test@example.com', {
        id: 'pending_123',
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword',
        otp: '123456',
        otp_attempts: 0,
        resend_count: 0,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      });

      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({ email: 'test@example.com', otp: '654321' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Incorrect OTP');
    });

    // 5. Increment attempts on incorrect OTP
    it('should increment otp_attempts on incorrect OTP', async () => {
      dbMock.__setPending('test@example.com', {
        id: 'pending_123',
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword',
        otp: '123456',
        otp_attempts: 2,
        resend_count: 0,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      });

      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({ email: 'test@example.com', otp: '654321' });

      expect(res.status).toBe(400);
      expect(dbMock.__getPending('test@example.com').otp_attempts).toBe(3);
      expect(res.body.error).toBe('Incorrect OTP. 2 attempt(s) remaining.');
    });

    // 6. Reject if OTP has expired
    it('should reject OTP verification when OTP has expired', async () => {
      dbMock.__setPending('test@example.com', {
        id: 'pending_123',
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword',
        otp: '123456',
        otp_attempts: 0,
        resend_count: 0,
        expires_at: new Date(Date.now() - 1000).toISOString() // Expired 1 second ago
      });

      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({ email: 'test@example.com', otp: '123456' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('OTP has expired. Please register again.');
      expect(dbMock.__getPending('test@example.com')).toBeUndefined(); // deleted
    });

    // 7. Delete registration when attempts exceed 5
    it('should delete pending registration and block verification when attempts are 5 or more', async () => {
      dbMock.__setPending('test@example.com', {
        id: 'pending_123',
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword',
        otp: '123456',
        otp_attempts: 5,
        resend_count: 0,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      });

      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({ email: 'test@example.com', otp: '123456' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Too many incorrect attempts. Please register again.');
      expect(dbMock.__getPending('test@example.com')).toBeUndefined(); // deleted
    });

    // 8. Successful verification returns tokens
    it('should successfully verify user and return tokens when valid OTP is provided', async () => {
      dbMock.__setPending('test@example.com', {
        id: 'pending_123',
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword',
        otp: '123456',
        otp_attempts: 0,
        resend_count: 0,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      });

      const res = await request(app)
        .post('/api/auth/verify-otp')
        .send({ email: 'test@example.com', otp: '123456' });

      expect(res.status).toBe(201);
      expect(res.body.accessToken).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
      expect(res.body.userId).toBeDefined();
      expect(res.body.name).toBe('Test User');
    });

    // 9. Successful verification deletes pending registration
    it('should delete pending registration upon successful verification', async () => {
      dbMock.__setPending('test@example.com', {
        id: 'pending_123',
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword',
        otp: '123456',
        otp_attempts: 0,
        resend_count: 0,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      });

      await request(app)
        .post('/api/auth/verify-otp')
        .send({ email: 'test@example.com', otp: '123456' });

      expect(dbMock.__getPending('test@example.com')).toBeUndefined();
    });

    // 10. Successful verification registers user in users table
    it('should register a new user in the users table upon successful verification', async () => {
      dbMock.__setPending('test@example.com', {
        id: 'pending_123',
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword',
        otp: '123456',
        otp_attempts: 0,
        resend_count: 0,
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      });

      await request(app)
        .post('/api/auth/verify-otp')
        .send({ email: 'test@example.com', otp: '123456' });

      const user = dbMock.__getUser('test@example.com');
      expect(user).toBeDefined();
      expect(user.name).toBe('Test User');
      expect(user.password).toBe('hashedpassword');
    });
  });

  describe('POST /api/auth/resend-otp', () => {
    // 11. Reject if email is missing
    it('should reject OTP resend when email is missing', async () => {
      const res = await request(app)
        .post('/api/auth/resend-otp')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Email is required.');
    });

    // 12. Reject if pending registration does not exist
    it('should reject OTP resend when no pending registration is found', async () => {
      const res = await request(app)
        .post('/api/auth/resend-otp')
        .send({ email: 'nonexistent@example.com' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('No pending registration found. Please register again.');
    });

    // 13. Throttle if requested within 60 seconds
    it('should throttle OTP resend if requested within 60 seconds of last resend', async () => {
      dbMock.__setPending('test@example.com', {
        id: 'pending_123',
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword',
        otp: '123456',
        otp_attempts: 0,
        resend_count: 1,
        last_resend: new Date(Date.now() - 30 * 1000).toISOString(), // 30 seconds ago
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      });

      const res = await request(app)
        .post('/api/auth/resend-otp')
        .send({ email: 'test@example.com' });

      expect(res.status).toBe(429);
      expect(res.body.error).toContain('Please wait');
    });

    // 14. Block after 3 resends
    it('should block OTP resend after 3 resend attempts', async () => {
      dbMock.__setPending('test@example.com', {
        id: 'pending_123',
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword',
        otp: '123456',
        otp_attempts: 0,
        resend_count: 3,
        last_resend: new Date(Date.now() - 120 * 1000).toISOString(), // 2 minutes ago
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      });

      const res = await request(app)
        .post('/api/auth/resend-otp')
        .send({ email: 'test@example.com' });

      expect(res.status).toBe(429);
      expect(res.body.error).toBe('Maximum resend limit reached. Please register again after 15 minutes.');
    });

    // 15. Successfully resend if eligible
    it('should successfully resend OTP and generate a new code if throttle period is passed', async () => {
      dbMock.__setPending('test@example.com', {
        id: 'pending_123',
        name: 'Test User',
        email: 'test@example.com',
        password: 'hashedpassword',
        otp: '123456',
        otp_attempts: 0,
        resend_count: 1,
        last_resend: new Date(Date.now() - 70 * 1000).toISOString(), // 70 seconds ago
        expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString()
      });

      const res = await request(app)
        .post('/api/auth/resend-otp')
        .send({ email: 'test@example.com' });

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('New OTP sent to your email.');
      expect(dbMock.__getPending('test@example.com').otp).not.toBe('123456'); // new OTP generated
    });
  });
});
