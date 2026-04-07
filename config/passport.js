const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const db = require('../db');
const bcrypt = require('bcryptjs');
require('dotenv').config();
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// ✅ Serialize user to session
passport.serializeUser((user, done) => {
  done(null, user.id);
});

// ✅ Deserialize user from session
passport.deserializeUser(async (id, done) => {
  try {
    const [rows] = await db.query('SELECT * FROM users WHERE id = ?', [id]);
    if (rows.length === 0) return done(null, false);
    return done(null, rows[0]);
  } catch (err) {
    return done(err);
  }
});

// ✅ Google Strategy
passport.use(new GoogleStrategy({
  clientID: process.env.GOOGLE_CLIENT_ID,
  clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  callbackURL: (process.env.BACKEND_URL || 'http://localhost:5000') + '/auth/google/callback',
  proxy: true // ✅ Trust Proxy for Render/Proxy environments
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails?.[0]?.value;
    if (!email) return done(new Error('Google email not available'));

    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

    if (users.length > 0) {
      done(null, users[0]);
    } else {
      const hashed = await bcrypt.hash('SOCIAL_LOGIN', 10);
      const newUser = {
        name: profile.displayName,
        email,
        provider: 'google',
        password: hashed
      };
      const [result] = await db.query('INSERT INTO users SET ?', newUser);
      newUser.id = result.insertId;
      done(null, newUser);
    }
  } catch (err) {
    done(err);
  }
}));

// ✅ Facebook Strategy
passport.use(new FacebookStrategy({
  clientID: process.env.FACEBOOK_APP_ID,
  clientSecret: process.env.FACEBOOK_APP_SECRET,
  callbackURL: (process.env.BACKEND_URL || 'http://localhost:5000') + '/auth/facebook/callback',
  profileFields: ['id', 'displayName', 'emails'], // Ensure email is requested
  proxy: true // ✅ Trust Proxy for Render/Proxy environments
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let email = profile.emails?.[0]?.value;

    // ✅ Fallback email if not provided
    if (!email) {
      email = `${profile.id}@facebook.com`; // pseudo-email
    }

    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

    if (users.length > 0) {
      done(null, users[0]);
    } else {
      const hashed = await bcrypt.hash('SOCIAL_LOGIN', 10);
      const newUser = {
        name: profile.displayName,
        email,
        provider: 'facebook',
        password: hashed
      };
      const [result] = await db.query('INSERT INTO users SET ?', newUser);
      newUser.id = result.insertId;
      done(null, newUser);
    }
  } catch (err) {
    done(err);
  }
}));