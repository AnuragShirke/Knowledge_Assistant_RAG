import { createHash } from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { getDatabase } from '../lib/database.js';

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
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(422).json({
        error: 'ValidationError',
        detail: 'Email and password are required',
        status_code: 422,
        timestamp: new Date().toISOString()
      });
    }

    const db = await getDatabase();
    
    // Check if user already exists
    const existingUser = await db.get(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existingUser) {
      return res.status(400).json({
        error: 'UserAlreadyExistsError',
        detail: `User with email ${email} already exists`,
        status_code: 400,
        timestamp: new Date().toISOString(),
        registration_error: true
      });
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(password, 12);
    const userId = uuidv4();
    const now = new Date().toISOString();

    // Create user
    await db.run(
      `INSERT INTO users (id, email, hashed_password, is_active, is_superuser, is_verified, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, email, hashedPassword, 1, 0, 0, now, now]
    );

    // Generate JWT token
    const token = jwt.sign(
      { sub: userId, email: email },
      JWT_SECRET,
      { expiresIn: JWT_LIFETIME_SECONDS }
    );

    return res.status(201).json({
      id: userId,
      email: email,
      is_active: true,
      is_superuser: false,
      is_verified: false,
      created_at: now,
      updated_at: now,
      access_token: token,
      token_type: 'bearer'
    });

  } catch (error) {
    console.error('Registration error:', error);
    return res.status(500).json({
      error: 'InternalServerError',
      detail: 'An unexpected error occurred during registration',
      status_code: 500,
      timestamp: new Date().toISOString()
    });
  }
}