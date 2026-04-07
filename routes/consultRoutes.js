const express = require('express');
const router = express.Router();
const db = require('../db');
const nodemailer = require('nodemailer');

// Create transporter for direct email sending
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT) || 587, // Ensure port is an integer
    secure: false, // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// POST /api/consult/book - Handle consultation form submission
router.post('/book', async (req, res) => {
    try {
        const { name, email, phone, concern } = req.body;
        
        // Basic validation
        if (!name || !email || !phone || !concern) {
            return res.status(400).json({ 
                success: false,
                error: "All fields are required" 
            });
        }

        // Save to database first
        const [result] = await db.query(
            "INSERT INTO consultations (name, email, phone, concern) VALUES (?, ?, ?, ?)",
            [name, email, phone, concern]
        );

        // Prepare email notification
        const mailOptions = {
            from: `"Home Remedies" <${process.env.SMTP_USER}>`,
            to: process.env.ADMIN_EMAIL || process.env.SMTP_USER, // Fallback to sender's email if admin email not set
            subject: `New Consultation Request from ${name}`,
            text: `
                New consultation request details:
                Name: ${name}
                Email: ${email}
                Phone: ${phone}
                Concern: ${concern}
                Date: ${new Date().toLocaleString()}
            `,
            html: `
                <h1>New Consultation Request</h1>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Phone:</strong> ${phone}</p>
                <p><strong>Concern:</strong> ${concern}</p>
                <p><strong>Date:</strong> ${new Date().toLocaleString()}</p>
            `
        };

        // Attempt to send email but don't wait for it (prevent 504 timeout)
        transporter.sendMail(mailOptions).then(() => {
            console.log('✅ Consultation email sent.');
        }).catch(mailErr => {
            console.error('📧 Email sending error (booking saved to DB):', mailErr);
        });

        res.json({ 
            success: true, 
            message: "Appointment request received. We'll contact you soon.",
            consultId: result.insertId 
        });

    } catch (err) {
        console.error('❌ Consultation booking error:', err);
        res.status(500).json({ 
            success: false,
            error: "Failed to book appointment",
            details: process.env.NODE_ENV === 'development' ? err.message : null
        });
    }
});

module.exports = router;