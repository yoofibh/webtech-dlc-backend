const jwt = require('jsonwebtoken');

/*
  This middleware checks whether a valid JWT token was sent with the request.
  I use this to protect routes like borrowing books, updating books, etc.
*/
const verifyToken = (req, res, next) => {
  // Tokens come in the Authorization header as: "Bearer <token>"
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'No token provided. Authorization denied.' });
  }

  const token = authHeader.split(' ')[1]; // Extract the actual token

  try {
    // Decode and verify token using my secret key
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Attach the user info from the token to the request
    req.user = decoded; // Example: { id, role, iat, exp }

    next();
  } catch (error) {
    console.error('JWT verification error:', error.message);
    return res.status(401).json({ message: 'Invalid or expired token.' });
  }
};

/*
  This middleware ensures that only an admin can access certain routes.
  I mainly use it for book creation, updates, and deletion.
*/
const requireAdmin = (req, res, next) => {
  // req.user is set in verifyToken()
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin access required.' });
  }

  next();
};

module.exports = {
  verifyToken,
  requireAdmin,
};
