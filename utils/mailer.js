const nodemailer = require('nodemailer');
const dotenv = require('dotenv');

dotenv.config();

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

// OTP Email
function sendOTP(email, mailOptions) {
    if (!mailOptions) {
        const otp = Math.floor(100000 + Math.random() * 900000).toString();
        mailOptions = {
            from: process.env.SMTP_USER,
            to: email,
            subject: 'Password Reset OTP',
            text: `Your OTP for password reset is: ${otp}`,
            html: `<p>Your OTP for password reset is: <strong>${otp}</strong></p>`
        };
    }

    return transporter.sendMail(mailOptions);
}

// Password Reset Confirmation
function sendPasswordResetConfirmation(email) {
    const mailOptions = {
        from: process.env.SMTP_USER,
        to: email,
        subject: 'Password Reset Successful',
        text: 'Your password has been successfully reset.',
        html: `<p>Your password has been successfully reset. You are now logged in. If this wasn't you, please contact support immediately.</p>`
    };

    return transporter.sendMail(mailOptions);
}

// Notification Emails
function sendNotificationEmail(email, type, details = {}) {
    let mailOptions = {
        from: process.env.SMTP_USER,
        to: email
    };

    switch (type) {
        case 'newsletter_subscribe':
            mailOptions.subject = 'Newsletter Subscription Confirmation';
            mailOptions.text = 'Thank you for subscribing to our newsletter!';
            mailOptions.html = '<p>Thank you for subscribing to our newsletter!</p>';
            break;
        case 'newsletter_unsubscribe':
            mailOptions.subject = 'Newsletter Unsubscription Confirmation';
            mailOptions.text = 'You have unsubscribed from our newsletter.';
            mailOptions.html = '<p>You have unsubscribed from our newsletter.</p>';
            break;
        case 'follow':
            mailOptions.subject = 'New Follower';
            mailOptions.text = `${details.actorName || 'Someone'} is now following you!`;
            mailOptions.html = `<p>${details.actorName || 'Someone'} is now following you!</p>`;
            break;
        case 'like':
            mailOptions.subject = 'New Like on Your Blog';
            mailOptions.text = `${details.actorName || 'Someone'} liked your blog: "${details.blogTitle || 'Untitled'}"`;
            mailOptions.html = `<p>${details.actorName || 'Someone'} liked your blog: <strong>"${details.blogTitle || 'Untitled'}"</strong></p>`;
            break;
        case 'comment':
            mailOptions.subject = 'New Comment on Your Blog';
            mailOptions.text = `${details.actorName || 'Someone'} commented: "${details.commentText || ''}"`;
            mailOptions.html = `<p>${details.actorName || 'Someone'} commented: <em>"${details.commentText || ''}"</em></p>`;
            break;
        default:
            throw new Error('Invalid notification type');
    }

    return transporter.sendMail(mailOptions);
}

// Consultation Emails (Admin Notification + Customer Confirmation)
function sendConsultationEmails(name, email, phone, concern) {
    const adminEmail = process.env.ADMIN_EMAIL || process.env.SMTP_USER;
    const date = new Date().toLocaleString();

    // 1. Notification to Admin
    const adminMailOptions = {
        from: `"Remedy & Blog Hub" <${process.env.SMTP_USER}>`,
        to: adminEmail,
        subject: `🚨 New Consultation Request from ${name}`,
        text: `
            New consultation request received:
            Name: ${name}
            Email: ${email}
            Phone: ${phone}
            Concern: ${concern}
            Date: ${date}
        `,
        html: `
            <div style="font-family: sans-serif; border: 1px solid #ddd; padding: 20px; border-radius: 10px;">
                <h2 style="color: #2c3e50;">New Consultation Request</h2>
                <hr>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> ${email}</p>
                <p><strong>Phone:</strong> ${phone}</p>
                <p><strong>Concern:</strong> ${concern}</p>
                <p><strong>Date:</strong> ${date}</p>
                <hr>
                <p style="font-size: 0.9em; color: #7f8c8d;">Please contact the patient as soon as possible.</p>
            </div>
        `
    };

    // 2. Confirmation to Customer
    const customerMailOptions = {
        from: `"Home Remedies" <${process.env.SMTP_USER}>`,
        to: email,
        subject: `Confirmation: Appointment Request Received`,
        html: `
            <div style="font-family: sans-serif; padding: 20px;">
                <h2 style="color: #27ae60;">Hello ${name},</h2>
                <p>Thank you for reaching out to us. We have received your consultation request regarding: <strong>"${concern}"</strong>.</p>
                <p>Our team will review your details and contact you via phone (<strong>${phone}</strong>) or email shortly to confirm your appointment time.</p>
                <br>
                <p>Best Regards,</p>
                <p><strong>Remedy & Blog Hub Team</strong></p>
            </div>
        `
    };

    // Send both
    const adminPromise = transporter.sendMail(adminMailOptions);
    const customerPromise = transporter.sendMail(customerMailOptions);

    return Promise.all([adminPromise, customerPromise]);
}

module.exports = { 
    sendOTP, 
    sendPasswordResetConfirmation, 
    sendNotificationEmail,
    sendConsultationEmails 
};