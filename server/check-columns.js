const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function main() {
  try {
    const tables = ['users', 'accounts', 'transactions', 'budgets', 'savings_goals', 'recurring_transactions'];
    
    for (const table of tables) {
      const res = await pool.query(
        "SELECT column_name, data_type FROM information_schema.columns WHERE table_name = $1",
        [table]
      );
      console.log(`\nTable: ${table}`);
      console.log('--------------------------------------------------');
      res.rows.forEach(row => {
        console.log(`  - ${row.column_name} (${row.data_type})`);
      });
    }
  } catch (err) {
    console.error('Error checking columns:', err);
  } finally {
    await pool.end();
  }
}

main();
