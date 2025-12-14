const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

// Load all my environment variables from the .env file
dotenv.config();

const pool = require('./config/db');
// Helper that makes sure there is always at least one admin in the system
const seedAdmin = require('./config/seedAdmin');

const app = express();

// Global middleware
// Allow requests from the frontend (helpful when I deploy)
app.use(cors());
// Parse incoming JSON bodies (for login, register, book forms, etc.)
app.use(express.json());

// Serve my frontend (HTML, CSS, JS) from the public folder
app.use(express.static('public'));

// Grouped API routes for auth and books
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/books', require('./routes/bookRoutes'));

// Use PORT from .env in production, fall back to 5000 for local dev
const PORT = process.env.PORT || 5000;

app.listen(PORT, async () => {
  console.log(`Server is running on http://localhost:${PORT}`);

  // On startup, I seed an admin user so I always have at least one admin account
  await seedAdmin();
});
