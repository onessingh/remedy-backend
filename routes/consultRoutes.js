const express = require('express');
const router = express.Router();
const db = require('../db');
const { sendConsultationEmails } = require('../utils/mailer');

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

        // Attempt to send emails but don't wait for them (prevent 504 timeout)
        sendConsultationEmails(name, email, phone, concern).then(() => {
            console.log('✅ Consultation emails sent (Admin + Customer).');
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