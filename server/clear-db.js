require('dotenv').config();
const { pool } = require('./db');

async function clearDatabase() {
  const client = await pool.connect();
  try {
    console.log('🔄 Clearing all tables...');

    // Disable triggers temporarily and truncate in dependency order
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

    // Verify
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
    console.error('❌ Error clearing database:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

clearDatabase();
