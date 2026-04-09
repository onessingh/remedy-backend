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
  callbackURL: (process.env.FRONTEND_URL || 'http://localhost:5000') + '/auth/google/callback',
  proxy: true // ✅ Trust Proxy for Render/Proxy environments
}, async (accessToken, refreshToken, profile, done) => {
  try {
    const email = profile.emails?.[0]?.value;
    const photo = profile.photos?.[0]?.value; // ✅ Extract Google profile photo
    if (!email) return done(new Error('Google email not available'));

    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

    if (users.length > 0) {
      // ✅ Sync profile images only if current image is NOT a manual upload (data URL)
      const currentImg = users[0].profileImage || users[0].photo;
      const isManualUpload = currentImg && currentImg.startsWith('data:');

      if (photo && !isManualUpload && (users[0].photo !== photo || users[0].profileImage !== photo)) {
        await db.query('UPDATE users SET photo = ?, profileImage = ? WHERE id = ?', [photo, photo, users[0].id]);
        users[0].photo = photo;
        users[0].profileImage = photo;
      }
      done(null, users[0]);
    } else {
      const hashed = await bcrypt.hash('SOCIAL_LOGIN', 10);
      const newUser = {
        name: profile.displayName,
        email,
        provider: 'google',
        password: hashed,
        photo, // ✅ Save profile photo URL
        profileImage: photo // ✅ Save to profileImage too (frontend expects this)
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
  callbackURL: (process.env.FRONTEND_URL || 'http://localhost:5000') + '/auth/facebook/callback',
  profileFields: ['id', 'displayName', 'emails', 'photos'], // ✅ Ensure photos are requested
  proxy: true // ✅ Trust Proxy for Render/Proxy environments
}, async (accessToken, refreshToken, profile, done) => {
  try {
    let email = profile.emails?.[0]?.value;
    const photo = profile.photos?.[0]?.value; // ✅ Extract Facebook profile photo

    // ✅ Fallback email if not provided
    if (!email) {
      email = `${profile.id}@facebook.com`; // pseudo-email
    }

    const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);

    if (users.length > 0) {
      // ✅ Sync profile images only if current image is NOT a manual upload (data URL)
      const currentImg = users[0].profileImage || users[0].photo;
      const isManualUpload = currentImg && currentImg.startsWith('data:');

      if (photo && !isManualUpload && (users[0].photo !== photo || users[0].profileImage !== photo)) {
        await db.query('UPDATE users SET photo = ?, profileImage = ? WHERE id = ?', [photo, photo, users[0].id]);
        users[0].photo = photo;
        users[0].profileImage = photo;
      }
      done(null, users[0]);
    } else {
      const hashed = await bcrypt.hash('SOCIAL_LOGIN', 10);
      const newUser = {
        name: profile.displayName,
        email,
        provider: 'facebook',
        password: hashed,
        photo, // ✅ Save profile photo URL
        profileImage: photo // ✅ Save to profileImage too (frontend expects this)
      };
      const [result] = await db.query('INSERT INTO users SET ?', newUser);
      newUser.id = result.insertId;
      done(null, newUser);
    }
  } catch (err) {
    done(err);
  }
}));