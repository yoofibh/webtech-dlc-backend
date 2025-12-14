const pool = require('./db');
const bcrypt = require('bcryptjs');

/**
 * This runs when the server starts.
 * 1. Checks if the system already has an admin.
 * 2. If not, it creates a default admin account so I never get locked out.
 * I only seed an admin once — after that, the check prevents duplicates.
 */
const seedAdmin = async () => {
  try {
    // Check if an admin already exists
    const result = await pool.query(
      "SELECT id FROM users WHERE role = 'admin' LIMIT 1"
    );

    if (result.rows.length > 0) {
      console.log('✔ Admin already exists, skipping admin seed.');
      return;
    }

    // No admin found → create a default one
    const name = 'System Admin';
    const email = 'ybh@example.com';
    const plainPassword = 'ybh123!';

    const passwordHash = await bcrypt.hash(plainPassword, 10);

    await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)`,
      [name, email, passwordHash, 'admin']
    );

    console.log('✔ Default admin account created successfully.');
    console.log(`   Email: ${email}`);
    console.log(`   Password: ${plainPassword}`);
  } catch (error) {
    console.error(' Error seeding admin user:', error.message);
  }
};

module.exports = seedAdmin;
