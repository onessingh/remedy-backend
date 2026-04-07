const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendOTP, sendPasswordResetConfirmation } = require('../utils/mailer');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const passport = require('passport');

// Send password reset link
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    if (!email) {
        return res.status(400).json({ message: 'Email is required' });
    }

    try {
        // Check if user exists
        const [users] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (users.length === 0) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Generate a secure token
        const token = crypto.randomBytes(32).toString('hex');
        const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiry

        // Store token in password_reset_tokens
        await db.query(
            'INSERT INTO password_reset_tokens (email, token, expires_at) VALUES (?, ?, ?)',
            [email, token, expiresAt]
        );

        // Send reset link via email
        const resetLink = `http://localhost:5000/reset-password/${token}`; // Use localhost for development
        const mailOptions = {
            from: process.env.SMTP_USER,
            to: email,
            subject: 'Password Reset Request',
            text: `Click this link to reset your password: ${resetLink}\nThis link will expire in 1 hour.`,
        };

        await sendOTP(email, mailOptions);

        res.json({ message: 'Password reset link sent successfully' });
    } catch (err) {
        console.error('Forgot password error:', err);
        res.status(500).json({ message: 'Failed to send reset link' });
    }
});

// Reset password and log in user
router.post('/reset-password/:token', async (req, res, next) => {
    const { token } = req.params;
    const { password } = req.body;

    if (!token || !password) {
        return res.status(400).json({ message: 'Missing token or password' });
    }

    try {
        const [rows] = await db.query(
            'SELECT * FROM password_reset_tokens WHERE token = ? AND expires_at > NOW()',
            [token]
        );

        if (rows.length === 0) {
            return res.status(400).json({ message: 'Invalid or expired reset link' });
        }

        const email = rows[0].email;
        const hashedPassword = await bcrypt.hash(password, 10);

        // Update the user's password
        await db.query('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, email]);

        // Delete the reset token
        await db.query('DELETE FROM password_reset_tokens WHERE token = ?', [token]);

        // Send confirmation email
        sendPasswordResetConfirmation(email).catch(err => {
            console.error('Failed to send password reset confirmation:', err);
        });

        // Fetch the user to log them in
        const [userRows] = await db.query('SELECT * FROM users WHERE email = ?', [email]);
        if (userRows.length === 0) {
            return res.status(500).json({ message: 'User not found after password reset' });
        }

        const user = userRows[0];

        // Log the user in using Passport.js
        req.login(user, (err) => {
            if (err) {
                console.error('Login error after password reset:', err);
                return res.status(500).json({ message: 'Failed to log in after reset' });
            }

            res.status(200).json({
                message: 'Password reset and login successful',
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    photo: user.photo,
                    provider: user.provider,
                },
            });
        });
    } catch (err) {
        console.error('Reset password error:', err);
        res.status(500).json({ message: 'Something went wrong' });
    }
});

module.exports = router;