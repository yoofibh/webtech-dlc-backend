const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');

const router = express.Router();

/**
 * POST /api/auth/register
 * Handles creating a new user account.
 * I use this for both students and admin (admin is controlled manually).
 */
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;

    // Basic input check
    if (!name || !email || !password) {
      return res
        .status(400)
        .json({ message: 'Name, email, and password are required.' });
    }

    // Make sure the email is not already taken
    const existingUser = await pool.query(
      'SELECT id FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res
        .status(400)
        .json({ message: 'A user with this email already exists.' });
    }

    // Hash the password before saving it
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    // By default, every new user is a student (I only set admin manually)
    const userRole = role === 'admin' ? 'admin' : 'student';

    // Insert the user into the database
    const insertResult = await pool.query(
      `INSERT INTO users (name, email, password_hash, role)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, email, role, created_at`,
      [name, email, passwordHash, userRole]
    );

    const newUser = insertResult.rows[0];

    // Remove the password hash before sending user back to the frontend
    const { password_hash, ...safeUser } = newUser;

    // Generate a JWT so the user is logged in immediately after registration
    const token = jwt.sign(
      { id: safeUser.id, role: safeUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.status(201).json({
      message: 'User registered successfully.',
      user: safeUser,
      token,
    });
  } catch (error) {
    console.error('Error in /register:', error.message);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

/**
 * POST /api/auth/login
 * Logs a user into the system and returns a signed JWT.
 */
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Quick check for missing fields
    if (!email || !password) {
      return res
        .status(400)
        .json({ message: 'Email and password are required.' });
    }

    // Look up the user by email
    const userResult = await pool.query(
      'SELECT id, name, email, password_hash, role FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    const user = userResult.rows[0];

    // Compare the raw password with the stored hash
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(400).json({ message: 'Invalid email or password.' });
    }

    // Strip out password_hash before sending the user object back
    const { password_hash, ...safeUser } = user;

    // Sign a JWT with the user id and role
    const token = jwt.sign(
      { id: safeUser.id, role: safeUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      message: 'Login successful.',
      user: safeUser,
      token,
    });
  } catch (error) {
    console.error('Error in /login:', error.message);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

module.exports = router;
