// ✅ profilecontroller.js (Final with Forgot Password)
const db = require('../db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const { sendOTP } = require('../utils/mailer');

exports.updateProfile = async (req, res) => {
  try {
    const name = req.body?.name?.trim() || req.user.name;
    const photo = req.file ? req.file.filename : req.user.photo;

    await db.query('UPDATE users SET name = ?, photo = ?, profileImage = ? WHERE email = ?', [
      name,
      photo,
      photo, // Sync profileImage with photo
      req.user.email
    ]);

    res.json({ message: 'Profile updated successfully', name, photoUrl: photo });
  } catch (err) {
    console.error('Error updating profile:', err);
    res.status(500).json({ message: 'Profile update failed' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const [rows] = await db.query('SELECT * FROM users WHERE email = ?', [req.user.email]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    const user = rows[0];
    const isMatch = await bcrypt.compare(oldPassword, user.password);

    if (!isMatch) {
      return res.status(400).json({ message: 'Old password is incorrect' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await db.query('UPDATE users SET password = ? WHERE email = ?', [hashedPassword, req.user.email]);

    res.json({ message: 'Password updated successfully' });
  } catch (err) {
    console.error('Error changing password:', err);
    res.status(500).json({ message: 'Password update failed' });
  }
};


exports.forgotPassword = async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ message: "Please enter your email" });

  try {
    // Check if email exists in users table
    const [rows] = await db.query("SELECT * FROM users WHERE email = ?", [email]);
    if (rows.length === 0) {
      return res.status(404).json({ message: "No user found with this email" });
    }

    // Generate secure token and expiry time (15 minutes)
    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

    // Save token to password_reset_tokens table
    await db.query(
      "INSERT INTO password_reset_tokens (email, token, expires_at) VALUES (?, ?, ?)",
      [email, token, expiresAt]
    );

    // Create reset link
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:5000';
    const resetLink = `${backendUrl}/reset-password/${token}`;


    // Send email using optimized Brevo mailer in background
    const mailOptions = {
      subject: "Reset Your Password",
      html: `
        <p>Hi ${rows[0].name},</p>
        <p>Click below to reset your password:</p>
        <a href="${resetLink}">${resetLink}</a>
        <p>This link will expire in 15 minutes.</p>
      `,
      text: `Hi ${rows[0].name}, Click here to reset your password: ${resetLink}. This link will expire in 15 minutes.`
    };

    sendOTP(email, mailOptions).catch(err => {
      console.error("❌ Background Email Error (profilecontroller):", err);
    });

    res.status(200).json({ message: "Reset email sent successfully!" });
  } catch (err) {
    console.error("Error in forgotPassword:", err);
    res.status(500).json({ message: "Something went wrong" });
  }
};
