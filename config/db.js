/**
 * Database connection + table setup for the DLC System
 * -----------------------------------------------------
 * This file handles:
 *  - Connecting to PostgreSQL (local or Render)
 *  - Creating all required tables on startup
 *  - Exporting the pool so other files can run queries
 */

const { Pool } = require('pg');

// Create a new PostgreSQL connection pool.
// In production (Render), DATABASE_URL comes from the environment.
// SSL is enabled because Render requires it.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

/* -------------------------------------------------------
   TABLE DEFINITIONS
   These are created automatically when the server starts.
   I designed them to be simple but enough for the system:
   - users:   stores student/admin accounts
   - books:   stores all book records
   - borrow_records: tracks borrowing history
------------------------------------------------------- */

const createUsersTableQuery = `
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    email VARCHAR(150) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'student',
    created_at TIMESTAMP DEFAULT NOW()
  );
`;

const createBooksTableQuery = `
  CREATE TABLE IF NOT EXISTS books (
    id SERIAL PRIMARY KEY,
    title VARCHAR(200) NOT NULL,
    author VARCHAR(150) NOT NULL,
    isbn VARCHAR(50),
    category VARCHAR(100),
    description TEXT,
    status VARCHAR(20) NOT NULL DEFAULT 'available',
    created_at TIMESTAMP DEFAULT NOW()
  );
`;

const createBorrowRecordsTableQuery = `
  CREATE TABLE IF NOT EXISTS borrow_records (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id INTEGER NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    borrowed_at TIMESTAMP DEFAULT NOW(),
    due_date TIMESTAMP NOT NULL,
    returned_at TIMESTAMP
  );
`;

/* -------------------------------------------------------
   INIT FUNCTION – runs once when the server boots.
   It ensures all tables exist before requests start hitting
   the system. This prevents runtime errors.
------------------------------------------------------- */

const createTables = async () => {
  try {
    await pool.query(createUsersTableQuery);
    await pool.query(createBooksTableQuery);
    await pool.query(createBorrowRecordsTableQuery);

    console.log('✅ Tables "users", "books", and "borrow_records" are ready.');
  } catch (err) {
    console.error('❌ Database setup error:', err.message);
  }
};

// Run table creation immediately at startup
createTables();

/* -------------------------------------------------------
   Handle unexpected database errors so the app doesn't crash
------------------------------------------------------- */
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL client error:', err.message);
});

// Export so the rest of the app can run queries using: pool.query(...)
module.exports = pool;
