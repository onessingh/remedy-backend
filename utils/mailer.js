const https = require('https');
const dotenv = require('dotenv');

dotenv.config();

/**
 * Core function to send emails via Brevo HTTP API
 * This bypasses Render's SMTP port restrictions.
 */
function sendEmailViaBrevo({ to, subject, htmlContent, textContent }) {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
        const err = '❌ BREVO_API_KEY is missing in environment variables';
        console.error(err);
        return Promise.reject(new Error(err));
    }

    const data = JSON.stringify({
        sender: { name: "Remedy & Blog Hub", email: "rajthakur221206@gmail.com" },
        to: Array.isArray(to) ? to.map(email => ({ email })) : [{ email: to }],
        subject: subject,
        htmlContent: htmlContent,
        textContent: textContent || (htmlContent ? htmlContent.replace(/<[^>]+>/g, '') : '')
    });

    const options = {
        hostname: 'api.brevo.com',
        port: 443,
        path: '/v3/smtp/email',
        method: 'POST',
        headers: {
            'api-key': apiKey,
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Content-Length': Buffer.byteLength(data)
        }
    };

    return new Promise((resolve, reject) => {
        const req = https.request(options, (res) => {
            let responseBody = '';
            res.on('data', (chunk) => responseBody += chunk);
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    console.log(`✅ Brevo Email Sent: ${subject} to ${Array.isArray(to) ? to.join(', ') : to}`);
                    resolve(responseBody ? JSON.parse(responseBody) : {});
                } else {
                    console.error('❌ Brevo API Error:', responseBody);
                    reject(new Error(`Brevo API returned ${res.statusCode}: ${responseBody}`));
                }
            });
        });

        req.on('error', (err) => {
            console.error('❌ Network Error calling Brevo API:', err);
            reject(err);
        });

        req.write(data);
        req.end();
    });
}

// 1. OTP / Password Reset Link Email
function sendOTP(email, mailOptions) {
    if (mailOptions) {
        return sendEmailViaBrevo({
            to: email,
            subject: mailOptions.subject,
            htmlContent: mailOptions.html || mailOptions.text,
            textContent: mailOptions.text
        });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    return sendEmailViaBrevo({
        to: email,
        subject: 'Password Reset OTP',
        htmlContent: `<p>Your OTP for password reset is: <strong>${otp}</strong></p>`,
        textContent: `Your OTP for password reset is: ${otp}`
    });
}

// 2. Password Reset Confirmation
function sendPasswordResetConfirmation(email) {
    return sendEmailViaBrevo({
        to: email,
        subject: 'Password Reset Successful',
        htmlContent: `<p>Your password has been successfully reset. You are now logged in. If this wasn't you, please contact support immediately.</p>`,
        textContent: 'Your password has been successfully reset.'
    });
}

// 3. Notification Emails (Newsletter, Likes, Follows)
function sendNotificationEmail(email, type, details = {}) {
    let subject, htmlContent;

    switch (type) {
        case 'newsletter_subscribe':
            subject = 'Newsletter Subscription Confirmation';
            htmlContent = '<p>Thank you for subscribing to our newsletter!</p>';
            break;
        case 'newsletter_unsubscribe':
            subject = 'Newsletter Unsubscription Confirmation';
            htmlContent = '<p>You have unsubscribed from our newsletter.</p>';
            break;
        case 'follow':
            subject = 'New Follower';
            htmlContent = `<p>${details.actorName || 'Someone'} is now following you!</p>`;
            break;
        case 'like':
            subject = 'New Like on Your Blog';
            htmlContent = `<p>${details.actorName || 'Someone'} liked your blog: <strong>"${details.blogTitle || 'Untitled'}"</strong></p>`;
            break;
        case 'comment':
            subject = 'New Comment on Your Blog';
            htmlContent = `<p>${details.actorName || 'Someone'} commented: <em>"${details.commentText || ''}"</em></p>`;
            break;
        default:
            return Promise.reject(new Error('Invalid notification type'));
    }

    return sendEmailViaBrevo({ to: email, subject, htmlContent });
}

// 4. Consultation Emails (Admin Notification + Customer Confirmation)
function sendConsultationEmails(name, email, phone, concern) {
    const adminEmail = process.env.ADMIN_EMAIL || 'rajthakur221206@gmail.com';
    const date = new Date().toLocaleString();

    const adminPromise = sendEmailViaBrevo({
        to: adminEmail,
        subject: `🚨 New Consultation Request from ${name}`,
        htmlContent: `
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
    });

    const customerPromise = sendEmailViaBrevo({
        to: email,
        subject: `Confirmation: Appointment Request Received`,
        htmlContent: `
            <div style="font-family: sans-serif; padding: 20px;">
                <h2 style="color: #27ae60;">Hello ${name},</h2>
                <p>Thank you for reaching out to us. We have received your consultation request regarding: <strong>"${concern}"</strong>.</p>
                <p>Our team will review your details and contact you via phone (<strong>${phone}</strong>) or email shortly to confirm your appointment time.</p>
                <br>
                <p>Best Regards,</p>
                <p><strong>Remedy & Blog Hub Team</strong></p>
            </div>
        `
    });

    return Promise.all([adminPromise, customerPromise]);
}

module.exports = { 
    sendEmailViaBrevo,
    sendOTP, 
    sendPasswordResetConfirmation, 
    sendNotificationEmail,
    sendConsultationEmails 
};