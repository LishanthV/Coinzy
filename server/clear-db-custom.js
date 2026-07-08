require('dotenv').config();
const { Pool } = require('pg');

async function run() {
  console.log("Starting DB clear script...");
  
  let pool;
  let client;
  
  // Try with SSL first
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    client = await pool.connect();
    console.log("✅ Connected using SSL!");
  } catch (err) {
    console.log("⚠️ SSL connection failed, trying non-SSL...", err.message);
    if (pool) await pool.end();
    
    // Try without SSL
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: false
    });
    client = await pool.connect();
    console.log("✅ Connected without SSL!");
  }

  try {
    console.log('🔄 Clearing all tables...');
    await client.query(`
      TRUNCATE TABLE
        error_logs,
        device_accounts,
        recurring_transactions,
        savings_goals,
        budgets,
        transactions,
        accounts,
        refresh_tokens,
        pending_registrations,
        users
      RESTART IDENTITY CASCADE;
    `);
    console.log('✅ All tables cleared successfully.');
    
    // Print verify count
    const tables = [
      'users', 'pending_registrations', 'accounts', 'transactions',
      'budgets', 'savings_goals', 'recurring_transactions',
      'refresh_tokens', 'error_logs', 'device_accounts'
    ];
    console.log('\n📊 Row counts after clear:');
    for (const table of tables) {
      const res = await client.query(`SELECT COUNT(*) FROM ${table}`);
      console.log(`  ${table}: ${res.rows[0].count} rows`);
    }
  } catch (err) {
    console.error('❌ Error executing clear query:', err.message);
  } finally {
    if (client) client.release();
    if (pool) await pool.end();
  }
}

run();
