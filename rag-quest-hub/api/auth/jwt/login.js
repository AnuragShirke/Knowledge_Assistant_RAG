import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getDatabase } from '../../lib/database.js';

const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-jwt-key-here';
const JWT_LIFETIME_SECONDS = parseInt(process.env.JWT_LIFETIME_SECONDS || '3600');

export default async function handler(req, res) {
  // Set CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({
      error: 'MethodNotAllowed',
      detail: 'Method not allowed',
      status_code: 405,
      timestamp: new Date().toISOString()
    });
  }

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(422).json({
        error: 'ValidationError',
        detail: 'Username and password are required',
        status_code: 422,
        timestamp: new Date().toISOString()
      });
    }

    const db = await getDatabase();
    
    // Find user by email
    const user = await db.get(
      'SELECT id, email, hashed_password, is_active, is_superuser, is_verified, created_at, updated_at FROM users WHERE email = ?',
      [username]
    );

    if (!user) {
      return res.status(400).json({
        error: 'InvalidCredentialsError',
        detail: 'Invalid email or password',
        status_code: 400,
        timestamp: new Date().toISOString(),
        auth_required: true
      });
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(password, user.hashed_password);
    if (!isValidPassword) {
      return res.status(400).json({
        error: 'InvalidCredentialsError',
        detail: 'Invalid email or password',
        status_code: 400,
        timestamp: new Date().toISOString(),
        auth_required: true
      });
    }

    // Check if user is active
    if (!user.is_active) {
      return res.status(400).json({
        error: 'InactiveUserError',
        detail: 'User account is inactive',
        status_code: 400,
        timestamp: new Date().toISOString(),
        auth_required: true
      });
    }

    // Generate JWT token
    const token = jwt.sign(
      { sub: user.id, email: user.email },
      JWT_SECRET,
      { expiresIn: JWT_LIFETIME_SECONDS }
    );

    return res.status(200).json({
      access_token: token,
      token_type: 'bearer'
    });

  } catch (error) {
    console.error('Login error:', error);
    return res.status(500).json({
      error: 'InternalServerError',
      detail: 'An unexpected error occurred during login',
      status_code: 500,
      timestamp: new Date().toISOString()
    });
  }
}