// routes/auth.js

const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db');
const passport = require('passport');

// ========== SIGNUP ==========
router.post('/signup', async (req, res) => {
  try {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Please fill all fields' });
    }

    // Validate password (match frontend regex)
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({ message: 'Password must be at least 8 characters long and contain at least one letter, one number, and one special character' });
    }

    const [existingUsers] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (existingUsers.length > 0) {
      return res.status(400).json({ message: 'User already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    await db.query('INSERT INTO users (name, email, password) VALUES (?, ?, ?)', [name, email, hashedPassword]);

    // Return 201 status for successful signup
    return res.status(201).json({ message: 'User registered successfully' });

  } catch (err) {
    console.error("❌ Signup error:", err);
    return res.status(500).json({ message: 'Server Error' });
  }
});

// ========== LOGIN ==========
router.post('/login', async (req, res, next) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: 'Please fill all fields' });
    }

    const [results] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
    if (results.length === 0) {
      return res.status(400).json({ message: 'User not found' });
    }

    const user = results[0];
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: 'Incorrect password' });
    }

    req.login(user, (err) => {
      if (err) {
        return next(err); // Passport.js error handling
      }

      // ✅ JSON response bhejo frontend ko
      return res.json({
        message: 'Logged in successfully',
        user: {
          name: user.name,
          email: user.email,
          photo: user.photo,
          provider: user.provider
        }
      });
    });

  } catch (err) {
    console.error("❌ Login error:", err);
    return res.status(500).json({ message: 'Server Error' });
  }
});

// ========== GOOGLE AUTH ==========
router.get('/auth/google', passport.authenticate('google', { scope: ['profile', 'email'] }));

router.get('/auth/google/callback',
  passport.authenticate('google', { failureRedirect: `${process.env.FRONTEND_URL || ''}/signin-page/signin.html` }),
  (req, res) => {
    res.redirect(`${process.env.FRONTEND_URL || ''}/signin-page/signin.html?social=google`);
  }
);

// ========== FACEBOOK AUTH ==========
router.get('/auth/facebook', passport.authenticate('facebook', { scope: ['email'] }));

router.get('/auth/facebook/callback',
  passport.authenticate('facebook', { failureRedirect: `${process.env.FRONTEND_URL || ''}/signin-page/signin.html` }),
  (req, res) => {
    res.redirect(`${process.env.FRONTEND_URL || ''}/signin-page/signin.html?social=facebook`);
  }
);

// ========== GET LOGGED-IN USER ==========
router.get('/me', (req, res) => {
  if (req.isAuthenticated()) {
    const { id, name, email, photo, provider } = req.user;
    return res.json({ 
      authenticated: true,
      user: { id, name, email, photo, provider }
    });
  } else {
    return res.json({ 
      authenticated: false 
    });
  }
});

module.exports = router;