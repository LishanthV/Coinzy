process.env.NODE_ENV = 'test';
require('dotenv').config();

// Mock ../db BEFORE requiring app to prevent actual DB connection/migrations in tests
jest.mock('../db', () => {
  const mockConnection = {
    query: jest.fn().mockImplementation((sql, params) => {
      if (sql.includes('SELECT userId FROM accounts')) {
        return Promise.resolve([[{ userId: 'usr_test123' }]]);
      }
      if (sql.includes('SELECT * FROM transactions')) {
        return Promise.resolve([[
          { id: 'txn_1', userId: 'usr_test123', accountId: 'acc_checking', type: 'expense', amount: 25.50, date: '2026-06-25T12:00:00Z', note: 'Whole Foods', updatedAt: Date.now() }
        ]]);
      }
      if (sql.includes('SELECT * FROM transaction_items')) {
        return Promise.resolve([[]]);
      }
      return Promise.resolve([[]]);
    }),
    beginTransaction: jest.fn().mockResolvedValue(true),
    commit: jest.fn().mockResolvedValue(true),
    rollback: jest.fn().mockResolvedValue(true),
    end: jest.fn().mockResolvedValue(true),
    release: jest.fn()
  };

  const mockPool = {
    query: jest.fn().mockImplementation((sql, params) => {
      if (sql.includes('SELECT id FROM users WHERE email = ?')) {
        if (params && params[0] === 'existing@example.com') {
          return Promise.resolve([[{ id: 'usr_existing' }]]);
        }
        return Promise.resolve([[]]);
      }
      if (sql.includes('SELECT * FROM users WHERE email = ?')) {
        if (params && params[0] === 'unverified@example.com') {
          const bcrypt = require('bcryptjs');
          return Promise.resolve([[{
            id: 'usr_unverified',
            name: 'Unverified User',
            email: 'unverified@example.com',
            password: bcrypt.hashSync('password123', 10),
            verified: 0,
            verificationToken: 'vtf_unverified'
          }]]);
        }
        if (params && params[0] === 'verified@example.com') {
          const bcrypt = require('bcryptjs');
          return Promise.resolve([[{
            id: 'usr_test123',
            name: 'Verified User',
            email: 'verified@example.com',
            password: bcrypt.hashSync('password123', 10),
            verified: 1,
            verificationToken: null
          }]]);
        }
        return Promise.resolve([[]]);
      }
      if (sql.includes('SELECT id, name FROM users WHERE verificationToken = ?')) {
        if (params && params[0] === 'vtf_valid') {
          return Promise.resolve([[{ id: 'usr_test123', name: 'Verified User' }]]);
        }
        return Promise.resolve([[]]);
      }
      return Promise.resolve([[]]);
    }),
    getConnection: jest.fn().mockResolvedValue(mockConnection),
    release: jest.fn()
  };

  return {
    query: mockPool.query,
    pool: mockPool,
    runMigrations: jest.fn().mockResolvedValue(true)
  };
});

const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../server');

describe('Zod Schema and Auth Logic Endpoints', () => {
  describe('POST /api/auth/signup', () => {
    it('should reject signup with missing fields', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({});
      
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
      expect(res.body.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ field: 'name' }),
          expect.objectContaining({ field: 'email' }),
          expect.objectContaining({ field: 'password' })
        ])
      );
    });

    it('should reject signup with invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ name: 'Test User', email: 'invalidemail', password: 'password123' });

      expect(res.status).toBe(400);
      expect(res.body.details[0].field).toBe('email');
    });

    it('should reject signup with too short password', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ name: 'Test User', email: 'test@example.com', password: '123' });

      expect(res.status).toBe(400);
      expect(res.body.details[0].field).toBe('password');
    });

    it('should successfully register a new user as unverified without returning tokens', async () => {
      const res = await request(app)
        .post('/api/auth/signup')
        .send({ name: 'New User', email: 'new@example.com', password: 'password123' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeUndefined();
      expect(res.body.refreshToken).toBeUndefined();
      expect(res.body.user).toBeDefined();
    });
  });

  describe('GET /api/auth/verify', () => {
    it('should reject verification when token query parameter is missing', async () => {
      const res = await request(app)
        .get('/api/auth/verify');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Verification token is required.');
    });

    it('should reject invalid verification token', async () => {
      const res = await request(app)
        .get('/api/auth/verify')
        .query({ token: 'vtf_invalid' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Invalid or expired verification token.');
    });

    it('should successfully verify a user with a valid token', async () => {
      const res = await request(app)
        .get('/api/auth/verify')
        .query({ token: 'vtf_valid' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('Account verified successfully');
    });
  });

  describe('POST /api/auth/login', () => {
    it('should reject login with invalid email format', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'bad-email', password: 'password123' });

      expect(res.status).toBe(400);
      expect(res.body.details[0].field).toBe('email');
    });

    it('should reject login for unverified user', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'unverified@example.com', password: 'password123' });

      expect(res.status).toBe(403);
      expect(res.body.error).toBe('Please verify your email first before logging in.');
    });

    it('should accept login for verified user and return tokens', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: 'verified@example.com', password: 'password123' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.token).toBeDefined();
      expect(res.body.refreshToken).toBeDefined();
    });
  });

  describe('POST /api/accounts', () => {
    let token;
    beforeAll(() => {
      token = jwt.sign({ id: 'usr_test123' }, process.env.JWT_SECRET || 'coinzy_secret_key_12345');
    });

    it('should reject account creation without authentication token', async () => {
      const res = await request(app)
        .post('/api/accounts')
        .send({ id: 'acc_1', name: 'Savings', type: 'savings', balance: 100, color: 'blue', icon: 'wallet' });

      expect(res.status).toBe(401);
    });

    it('should reject account creation with missing fields', async () => {
      const res = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 'acc_1' });

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('Validation failed');
    });

    it('should reject account creation with invalid type', async () => {
      const res = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 'acc_1', name: 'Checking', type: 'invalid_type', balance: 50, color: 'blue', icon: 'card' });

      expect(res.status).toBe(400);
      expect(res.body.details[0].field).toBe('type');
    });

    it('should accept valid account structure', async () => {
      const res = await request(app)
        .post('/api/accounts')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 'acc_1', name: 'Checking', type: 'checking', balance: 50, color: 'blue', icon: 'card' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
    });
  });

  describe('POST /api/budgets', () => {
    let token;
    beforeAll(() => {
      token = jwt.sign({ id: 'usr_test123' }, process.env.JWT_SECRET || 'coinzy_secret_key_12345');
    });

    it('should reject budget with negative limit', async () => {
      const res = await request(app)
        .post('/api/budgets')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 'bud_1', categoryId: 'cat_groceries', limit: -10 });

      expect(res.status).toBe(400);
      expect(res.body.details[0].field).toBe('limit');
    });

    it('should accept valid budget structure', async () => {
      const res = await request(app)
        .post('/api/budgets')
        .set('Authorization', `Bearer ${token}`)
        .send({ id: 'bud_1', categoryId: 'cat_groceries', limit: 100 });

      expect(res.status).toBe(200);
    });
  });

  describe('POST /api/transactions', () => {
    let token;
    beforeAll(() => {
      token = jwt.sign({ id: 'usr_test123' }, process.env.JWT_SECRET || 'coinzy_secret_key_12345');
    });

    it('should reject transaction with negative/zero amount', async () => {
      const res = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          id: 'txn_1',
          accountId: 'acc_checking',
          type: 'expense',
          amount: 0,
          categoryId: 'cat_groceries',
          date: '2026-06-25T12:00:00Z'
        });

      expect(res.status).toBe(400);
      expect(res.body.details[0].field).toBe('amount');
    });

    it('should reject non-transfer transaction without categoryId', async () => {
      const res = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          id: 'txn_1',
          accountId: 'acc_checking',
          type: 'expense',
          amount: 25.50,
          date: '2026-06-25T12:00:00Z'
        });

      expect(res.status).toBe(400);
      expect(res.body.details[0].field).toBe('categoryId');
    });

    it('should accept valid transaction', async () => {
      const res = await request(app)
        .post('/api/transactions')
        .set('Authorization', `Bearer ${token}`)
        .send({
          id: 'txn_1',
          accountId: 'acc_checking',
          type: 'expense',
          amount: 25.50,
          categoryId: 'cat_groceries',
          date: '2026-06-25T12:00:00Z',
          note: 'Whole Foods'
        });

      expect(res.status).toBe(200);
    });
  });
});

