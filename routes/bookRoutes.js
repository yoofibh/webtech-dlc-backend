const express = require('express');
const pool = require('../config/db');
const { verifyToken, requireAdmin } = require('../middleware/auth');

const router = express.Router();

/**
 * GET /api/books
 * Public route – list all books with optional filters.
 *
 * Query params:
 *  - search   → matches title or author (case-insensitive)
 *  - category → filter by category
 *  - status   → "available" or "borrowed"
 *
 * I also join with borrow_records to show the current due date
 * for any book that is currently borrowed.
 */
router.get('/', async (req, res) => {
  try {
    const { search, category, status } = req.query;

    let baseQuery = `
      SELECT
        b.*,
        br.due_date AS current_due_date
      FROM books b
      LEFT JOIN borrow_records br
        ON br.book_id = b.id
       AND br.returned_at IS NULL
    `;

    const conditions = [];
    const values = [];

    if (search) {
      conditions.push(
        '(LOWER(b.title) LIKE $' +
          (values.length + 1) +
          ' OR LOWER(b.author) LIKE $' +
          (values.length + 1) +
          ')'
      );
      values.push(`%${search.toLowerCase()}%`);
    }

    if (category) {
      conditions.push('LOWER(b.category) = $' + (values.length + 1));
      values.push(category.toLowerCase());
    }

    if (status) {
      conditions.push('LOWER(b.status) = $' + (values.length + 1));
      values.push(status.toLowerCase());
    }

    if (conditions.length > 0) {
      baseQuery += ' WHERE ' + conditions.join(' AND ');
    }

    baseQuery += ' ORDER BY b.created_at DESC';

    const result = await pool.query(baseQuery, values);

    res.json({
      count: result.rows.length,
      books: result.rows,
    });
  } catch (error) {
    console.error('Error in GET /api/books:', error.message);
    res.status(500).json({ message: 'Server error fetching books.' });
  }
});

/**
 * GET /api/books/:id
 * Public route – fetch details for a single book by id.
 * Also returns current_due_date if it is borrowed.
 */
router.get('/:id', async (req, res) => {
  try {
    const bookId = req.params.id;

    const result = await pool.query(
      `
      SELECT
        b.*,
        br.due_date AS current_due_date
      FROM books b
      LEFT JOIN borrow_records br
        ON br.book_id = b.id
       AND br.returned_at IS NULL
      WHERE b.id = $1
      `,
      [bookId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'Book not found.' });
    }

    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error in GET /api/books/:id:', error.message);
    res.status(500).json({ message: 'Server error fetching book.' });
  }
});

/**
 * POST /api/books
 * Protected – admin only.
 * Adds a new book record into the catalogue.
 */
router.post('/', verifyToken, requireAdmin, async (req, res) => {
  try {
    const { title, author, isbn, category, description, status } = req.body;

    if (!title || !author) {
      return res
        .status(400)
        .json({ message: 'Title and author are required.' });
    }

    const bookStatus = status || 'available';

    const insertResult = await pool.query(
      `INSERT INTO books (title, author, isbn, category, description, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [title, author, isbn || null, category || null, description || null, bookStatus]
    );

    res.status(201).json({
      message: 'Book created successfully.',
      book: insertResult.rows[0],
    });
  } catch (error) {
    console.error('Error in POST /api/books:', error.message);
    res.status(500).json({ message: 'Server error creating book.' });
  }
});

/**
 * PUT /api/books/:id
 * Protected – admin only.
 * Updates an existing book. If a field is not sent,
 * I keep the old value from the database.
 */
router.put('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const bookId = req.params.id;
    const { title, author, isbn, category, description, status } = req.body;

    // Check that the book exists first
    const existing = await pool.query('SELECT * FROM books WHERE id = $1', [
      bookId,
    ]);

    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Book not found.' });
    }

    const original = existing.rows[0];

    const updateResult = await pool.query(
      `UPDATE books
       SET title = $1,
           author = $2,
           isbn = $3,
           category = $4,
           description = $5,
           status = $6
       WHERE id = $7
       RETURNING *`,
      [
        title || original.title,
        author || original.author,
        isbn !== undefined ? isbn : original.isbn,
        category !== undefined ? category : original.category,
        description !== undefined ? description : original.description,
        status || original.status,
        bookId,
      ]
    );

    res.json({
      message: 'Book updated successfully.',
      book: updateResult.rows[0],
    });
  } catch (error) {
    console.error('Error in PUT /api/books/:id:', error.message);
    res.status(500).json({ message: 'Server error updating book.' });
  }
});

/**
 * DELETE /api/books/:id
 * Protected – admin only.
 * Completely removes a book from the catalogue.
 */
router.delete('/:id', verifyToken, requireAdmin, async (req, res) => {
  try {
    const bookId = req.params.id;

    // Check if book exists before deleting
    const existing = await pool.query('SELECT id FROM books WHERE id = $1', [
      bookId,
    ]);

    if (existing.rows.length === 0) {
      return res.status(404).json({ message: 'Book not found.' });
    }

    await pool.query('DELETE FROM books WHERE id = $1', [bookId]);

    res.json({ message: 'Book deleted successfully.' });
  } catch (error) {
    console.error('Error in DELETE /api/books/:id:', error.message);
    res.status(500).json({ message: 'Server error deleting book.' });
  }
});

/**
 * POST /api/books/:id/borrow
 * Protected – logged-in users only.
 * A student borrows a book if it is currently available.
 * I also create a borrow_records entry with a 7-day due date.
 */
router.post('/:id/borrow', verifyToken, async (req, res) => {
  const bookId = req.params.id;
  const userId = req.user.id; // from verifyToken

  try {
    // 1. Check the book exists
    const bookResult = await pool.query(
      'SELECT id, status FROM books WHERE id = $1',
      [bookId]
    );

    if (bookResult.rows.length === 0) {
      return res.status(404).json({ message: 'Book not found.' });
    }

    const book = bookResult.rows[0];

    // 2. Only allow borrowing if status is "available"
    if (book.status !== 'available') {
      return res
        .status(400)
        .json({ message: 'Book is not available for borrowing.' });
    }

    // 3. Insert new borrow record with a 7-day due date
    const borrowedAt = new Date();
    const dueDate = new Date();
    dueDate.setDate(borrowedAt.getDate() + 7);

    await pool.query(
      `INSERT INTO borrow_records (user_id, book_id, borrowed_at, due_date)
       VALUES ($1, $2, $3, $4)`,
      [userId, bookId, borrowedAt, dueDate]
    );

    // 4. Update the book status
    await pool.query(
      `UPDATE books SET status = 'borrowed' WHERE id = $1`,
      [bookId]
    );

    res.json({
      message: 'Book borrowed successfully.',
      dueDate,
    });
  } catch (error) {
    console.error('Error in POST /books/:id/borrow:', error.message);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

/**
 * POST /api/books/:id/return
 * Protected – logged-in users only.
 *
 * Who can return:
 *  - The student who borrowed the book, OR
 *  - Any admin user
 *
 * This route:
 *  - Finds the active borrow_records row
 *  - Marks returned_at
 *  - Sets the book status back to "available"
 */
router.post('/:id/return', verifyToken, async (req, res) => {
  const bookId = req.params.id;
  const userId = req.user.id;
  const userRole = req.user.role;

  try {
    // 1. Find active borrow record for this book (no returned_at yet)
    const borrowResult = await pool.query(
      `SELECT id, user_id FROM borrow_records
       WHERE book_id = $1 AND returned_at IS NULL
       ORDER BY borrowed_at DESC
       LIMIT 1`,
      [bookId]
    );

    if (borrowResult.rows.length === 0) {
      return res
        .status(400)
        .json({ message: 'No active borrow record for this book.' });
    }

    const borrow = borrowResult.rows[0];

    // 2. Only the borrower or an admin can mark it as returned
    if (userRole !== 'admin' && borrow.user_id !== userId) {
      return res
        .status(403)
        .json({ message: 'You are not allowed to return this book.' });
    }

    const now = new Date();

    // 3. Mark the borrow record as returned
    await pool.query(
      `UPDATE borrow_records
       SET returned_at = $1
       WHERE id = $2`,
      [now, borrow.id]
    );

    // 4. Change book status back to "available"
    await pool.query(
      `UPDATE books SET status = 'available' WHERE id = $1`,
      [bookId]
    );

    res.json({ message: 'Book returned successfully.' });
  } catch (error) {
    console.error('Error in POST /books/:id/return:', error.message);
    res.status(500).json({ message: 'Server error. Please try again.' });
  }
});

module.exports = router;
