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

module.exports = { sendOTP, sendPasswordResetConfirmation, sendNotificationEmail };