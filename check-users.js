require('dotenv').config();
const { pool } = require('./db');

(async () => {
  try {
    const result = await pool.query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'users' AND table_schema = 'public'"
    );
    console.log(result.rows);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
})();