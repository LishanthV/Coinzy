const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

// Override pool.query to translate "?" to "$1", "$2", etc. and return array format
const originalPoolQuery = pool.query.bind(pool);
pool.query = async function (sql, params) {
  let index = 1;
  const pgSql = sql.replace(/\?/g, () => `$${index++}`);
  const result = await originalPoolQuery(pgSql, params);
  return [result.rows, result.fields];
};

// Map pool.getConnection to pg pool.connect with transaction wrappers
pool.getConnection = async function () {
  const client = await pool.connect();
  
  // Map client query structure
  const originalClientQuery = client.query.bind(client);
  client.query = async function (sql, params) {
    let index = 1;
    const pgSql = sql.replace(/\?/g, () => `$${index++}`);
    const result = await originalClientQuery(pgSql, params);
    return [result.rows, result.fields];
  };
  
  // Add MySQL transaction handlers
  client.beginTransaction = async function () {
    await originalClientQuery('BEGIN');
  };
  client.commit = async function () {
    await originalClientQuery('COMMIT');
  };
  client.rollback = async function () {
    await originalClientQuery('ROLLBACK');
  };
  
  return client;
};

async function query(sql, params) {
  const [rows, fields] = await pool.query(sql, params);
  return [rows, fields];
}

async function runMigrations() {
  const client = await pool.connect();
  try {
    // ── users ────────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id                  VARCHAR(36)  PRIMARY KEY,
        name                VARCHAR(255) NOT NULL,
        email               VARCHAR(255) NOT NULL UNIQUE,
        password            VARCHAR(255) NOT NULL,
        verified            SMALLINT     DEFAULT 1,
        "verificationToken" VARCHAR(255) NULL,
        created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN IF NOT EXISTS verified SMALLINT DEFAULT 1,
      ADD COLUMN IF NOT EXISTS "verificationToken" VARCHAR(255) NULL;
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);

    // ── pending_registrations ────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS pending_registrations (
        id            VARCHAR(36)  PRIMARY KEY,
        name          VARCHAR(255) NOT NULL,
        email         VARCHAR(255) NOT NULL UNIQUE,
        password      VARCHAR(255) NOT NULL,
        otp           VARCHAR(6)   NOT NULL,
        otp_attempts  SMALLINT     DEFAULT 0,
        resend_count  SMALLINT     DEFAULT 0,
        last_resend   TIMESTAMP    NULL,
        expires_at    TIMESTAMP    NOT NULL
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pending_email ON pending_registrations(email);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pending_expires ON pending_registrations(expires_at);`);

    // ── refresh_tokens ───────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id         VARCHAR(36) PRIMARY KEY,
        userId     VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token      TEXT        NOT NULL,
        expires_at TIMESTAMP   NOT NULL
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_rt_userId ON refresh_tokens(userId);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_rt_expires ON refresh_tokens(expires_at);`);

    // ── accounts ─────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id        VARCHAR(36)    PRIMARY KEY,
        userId    VARCHAR(36)    NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name      VARCHAR(255)   NOT NULL,
        type      VARCHAR(50)    NOT NULL,
        balance   DECIMAL(15,2)  NOT NULL DEFAULT 0,
        color     VARCHAR(50)    NOT NULL DEFAULT '#6366f1',
        icon      VARCHAR(50)    NOT NULL DEFAULT 'wallet',
        currency  VARCHAR(3)     NOT NULL DEFAULT 'INR'
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_accounts_userId ON accounts(userId);`);

    // ── transactions ─────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id             VARCHAR(36)   PRIMARY KEY,
        userId         VARCHAR(36)   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        accountId      VARCHAR(36)   NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        toAccountId    VARCHAR(36)   NULL,
        type           VARCHAR(20)   NOT NULL,
        amount         DECIMAL(15,2) NOT NULL,
        categoryId     VARCHAR(50)   NULL,
        note           TEXT          NULL,
        date           DATE          NOT NULL,
        merchant       VARCHAR(255)  NULL,
        customCategory VARCHAR(255)  NULL,
        items          TEXT          NULL,
        deleted_at     TIMESTAMP     NULL,
        created_at     TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_txn_userId ON transactions(userId);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(date);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_txn_deleted ON transactions(deleted_at);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_txn_category ON transactions(categoryId);`);

    // ── budgets ──────────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS budgets (
        id         VARCHAR(36)   PRIMARY KEY,
        userId     VARCHAR(36)   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        categoryId VARCHAR(50)   NOT NULL,
        "limit"    DECIMAL(15,2) NOT NULL,
        period     VARCHAR(20)   NOT NULL DEFAULT 'monthly',
        CONSTRAINT uq_budget_user_cat UNIQUE (userId, categoryId)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_budgets_userId ON budgets(userId);`);

    // ── savings_goals ────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS savings_goals (
        id            VARCHAR(36)   PRIMARY KEY,
        userId        VARCHAR(36)   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name          VARCHAR(255)  NOT NULL,
        targetAmount  DECIMAL(15,2) NOT NULL,
        currentAmount DECIMAL(15,2) NOT NULL DEFAULT 0,
        targetDate    DATE          NULL,
        updatedAt     BIGINT        NOT NULL DEFAULT 0
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_goals_userId ON savings_goals(userId);`);

    // ── recurring_transactions ───────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS recurring_transactions (
        id            VARCHAR(36)   PRIMARY KEY,
        userId        VARCHAR(36)   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        accountId     VARCHAR(36)   NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        type          VARCHAR(20)   NOT NULL,
        amount        DECIMAL(15,2) NOT NULL,
        categoryId    VARCHAR(50)   NULL,
        note          VARCHAR(255)  NULL,
        merchant      VARCHAR(255)  NULL,
        frequency     VARCHAR(20)   NOT NULL,
        nextDueDate   DATE          NOT NULL,
        lastProcessed DATE          NULL,
        isActive      SMALLINT      NOT NULL DEFAULT 1,
        updatedAt     BIGINT        NOT NULL DEFAULT 0
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_recurring_userId ON recurring_transactions(userId);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_recurring_due ON recurring_transactions(nextDueDate);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_recurring_active ON recurring_transactions(isActive);`);

    // ── error_logs ──────────────────────────────────────────────────────────
    await client.query(`
      CREATE TABLE IF NOT EXISTS error_logs (
        id SERIAL PRIMARY KEY,
        level VARCHAR(10) NOT NULL DEFAULT 'ERROR',
        message TEXT NOT NULL,
        stack TEXT,
        screen VARCHAR(100),
        user_id INT,
        app_version VARCHAR(20),
        platform VARCHAR(10),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_err_level ON error_logs(level);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_err_user ON error_logs(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_err_created ON error_logs(created_at);`);

    console.log('✅ PostgreSQL Migrations complete');
  } finally {
    client.release();
  }
}

module.exports = { query, pool, runMigrations };
