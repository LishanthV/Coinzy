const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function query(sql, params) {
  const result = await pool.query(sql, params);
  return result;
}

async function runMigrations() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id         VARCHAR(36)  PRIMARY KEY,
        name       VARCHAR(255) NOT NULL,
        email      VARCHAR(255) NOT NULL UNIQUE,
        password   VARCHAR(255) NOT NULL,
        verified   SMALLINT     DEFAULT 1,
        created_at TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS pending_registrations (
        id           VARCHAR(36)  PRIMARY KEY,
        name         VARCHAR(255) NOT NULL,
        email        VARCHAR(255) NOT NULL UNIQUE,
        password     VARCHAR(255) NOT NULL,
        otp          VARCHAR(6)   NOT NULL,
        otp_attempts SMALLINT     DEFAULT 0,
        resend_count SMALLINT     DEFAULT 0,
        last_resend  TIMESTAMP    NULL,
        expires_at   TIMESTAMP    NOT NULL
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pending_email ON pending_registrations(email);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_pending_expires ON pending_registrations(expires_at);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS refresh_tokens (
        id         VARCHAR(36) PRIMARY KEY,
        user_id    VARCHAR(36) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token      TEXT        NOT NULL,
        expires_at TIMESTAMP   NOT NULL
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_rt_user_id ON refresh_tokens(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_rt_expires ON refresh_tokens(expires_at);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id       VARCHAR(36)   PRIMARY KEY,
        user_id  VARCHAR(36)   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name     VARCHAR(255)  NOT NULL,
        type     VARCHAR(50)   NOT NULL,
        balance  DECIMAL(15,2) NOT NULL DEFAULT 0,
        color    VARCHAR(50)   NOT NULL DEFAULT '#6366f1',
        icon     VARCHAR(50)   NOT NULL DEFAULT 'wallet',
        currency VARCHAR(3)    NOT NULL DEFAULT 'INR'
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_accounts_user_id ON accounts(user_id);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id              VARCHAR(36)   PRIMARY KEY,
        user_id         VARCHAR(36)   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        account_id      VARCHAR(36)   NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        to_account_id   VARCHAR(36)   NULL,
        type            VARCHAR(20)   NOT NULL,
        amount          DECIMAL(15,2) NOT NULL,
        category_id     VARCHAR(50)   NULL,
        note            TEXT          NULL,
        date            DATE          NOT NULL,
        merchant        VARCHAR(255)  NULL,
        custom_category VARCHAR(255)  NULL,
        items           TEXT          NULL,
        deleted_at      TIMESTAMP     NULL,
        created_at      TIMESTAMP     DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_txn_user_id ON transactions(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_txn_date ON transactions(date);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_txn_deleted ON transactions(deleted_at);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_txn_category ON transactions(category_id);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS budgets (
        id          VARCHAR(36)   PRIMARY KEY,
        user_id     VARCHAR(36)   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        category_id VARCHAR(50)   NOT NULL,
        "limit"     DECIMAL(15,2) NOT NULL,
        period      VARCHAR(20)   NOT NULL DEFAULT 'monthly',
        CONSTRAINT uq_budget_user_cat UNIQUE (user_id, category_id)
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_budgets_user_id ON budgets(user_id);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS savings_goals (
        id             VARCHAR(36)   PRIMARY KEY,
        user_id        VARCHAR(36)   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name           VARCHAR(255)  NOT NULL,
        target_amount  DECIMAL(15,2) NOT NULL,
        current_amount DECIMAL(15,2) NOT NULL DEFAULT 0,
        target_date    DATE          NULL,
        updated_at     BIGINT        NOT NULL DEFAULT 0
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_goals_user_id ON savings_goals(user_id);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS recurring_transactions (
        id             VARCHAR(36)   PRIMARY KEY,
        user_id        VARCHAR(36)   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        account_id     VARCHAR(36)   NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        type           VARCHAR(20)   NOT NULL,
        amount         DECIMAL(15,2) NOT NULL,
        category_id    VARCHAR(50)   NULL,
        note           VARCHAR(255)  NULL,
        merchant       VARCHAR(255)  NULL,
        frequency      VARCHAR(20)   NOT NULL,
        next_due_date  DATE          NOT NULL,
        last_processed DATE          NULL,
        is_active      SMALLINT      NOT NULL DEFAULT 1,
        updated_at     BIGINT        NOT NULL DEFAULT 0
      );
    `);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_recurring_user_id ON recurring_transactions(user_id);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_recurring_due ON recurring_transactions(next_due_date);`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_recurring_active ON recurring_transactions(is_active);`);

    await client.query(`
      CREATE TABLE IF NOT EXISTS error_logs (
        id          SERIAL       PRIMARY KEY,
        level       VARCHAR(10)  NOT NULL DEFAULT 'ERROR',
        message     TEXT         NOT NULL,
        stack       TEXT,
        screen      VARCHAR(100),
        user_id     VARCHAR(36),
        app_version VARCHAR(20),
        platform    VARCHAR(10),
        created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
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