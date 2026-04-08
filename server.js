const express = require('express');
const session = require('express-session');
const passport = require('passport');
const dotenv = require('dotenv');
const path = require('path');
const cors = require('cors');
const https = require('https');
const http = require('http');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const forgotPasswordRoutes = require('./routes/forgotpassword');
const authStatusRoutes = require('./routes/authStatus');
const blogRoutes = require('./routes/blogRoutes');
const userRoutes = require('./routes/userRoutes');
const db = require('./db');
const nodemailer = require("nodemailer");
const consultRoutes = require('./routes/consultRoutes');
const searchRoutes = require('./routes/search');

// Load environment variables
dotenv.config();

// Passport config
require('./config/passport');

const app = express();

// ✅ Trust Proxy for Render (required for secure cookies/sessions over HTTPS)
app.set('trust proxy', 1);

// ✅ Increase JSON payload size to avoid 413 Payload Too Large
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ✅ CORS Setup - Use FRONTEND_URL environment variable if available
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5500',
    credentials: true
}));

// ✅ Session config
app.use(session({
    secret: process.env.SESSION_SECRET || 'keyboardcat',
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        maxAge: 1000 * 60 * 60 * 24, // 1 day
        sameSite: 'lax' // ✅ Better for proxied setups
    }
}));

// ✅ Passport init
app.use(passport.initialize());
app.use(passport.session());

// ✅ Static files
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(path.join(__dirname, '..', 'public')));

// ✅ Home route
app.get('/', (req, res) => {
    if (req.isAuthenticated()) {
        res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
    } else {
        res.redirect('/signin');
    }
});

// ✅ Routes
app.use('/', authRoutes);
app.use('/profile', profileRoutes);
app.use('/forgot-password', forgotPasswordRoutes);
app.use(authStatusRoutes);
app.use('/api/blogs', blogRoutes);
app.use('/api/user', userRoutes);
app.use('/api/consult', consultRoutes); 
app.use('/api/user', searchRoutes);
// ✅ Logout route
app.post('/logout', (req, res, next) => {
    req.logout(err => {
        if (err) return next(err);
        req.session.destroy(() => {
            res.clearCookie('connect.sid');
            res.status(200).json({ message: 'Logged out' });
        });
    });
});

// ✅ Reset Password Page
app.get("/reset-password/:token", (req, res) => {
    res.sendFile(path.join(__dirname, "..", "public", "resetpassword", "reset-password.html"));
});

// ✅ Health Check Route (Required for keep-alive pings)
app.get('/api/health', (req, res) => {
    res.status(200).send('OK');
});

// ✅ Email Test Route
app.get("/test-email", async (req, res) => {
    const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT),
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    });

    try {
        await transporter.sendMail({
            from: `"Remedy & Blog Hub" <${process.env.SMTP_USER}>`,
            to: "rajthakur221206@gmail.com",
            subject: "✅ Test Email",
            html: "<p>This is a test email from your Remedy & Blog Hub server setup.</p>"
        });
        res.send("✅ Test email sent! Check your inbox.");
    } catch (err) {
        console.error("❌ Test email error:", err);
        res.status(500).send("❌ Failed to send test email.");
    }
});

// ✅ DB Connection Test
(async () => {
    try {
        const connection = await db.getConnection();
        console.log('✅ Connected to MySQL database!');
        connection.release();
    } catch (error) {
        console.error('❌ Database connection failed:', error);
    }
})();

// ✅ Server start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);

    // ✅ Keep-alive pinging (Every 14 minutes to reset Render's 15m sleep timer)
    setInterval(() => {
        http.get(`http://localhost:${PORT}/api/health`, (res) => {
            console.log(`🔄 Local self-ping status: ${res.statusCode}`);
        }).on('error', (err) => {
            console.error(`❌ Local self-ping error: ${err.message}`);
        });
    }, 14 * 60 * 1000); // 14 mins

    // ✅ Database Keep-alive (Every 10 minutes to prevent hibernation)
    setInterval(async () => {
        try {
            await db.query('SELECT 1');
            console.log('📦 Database keep-alive ping successful');
        } catch (err) {
            console.error('❌ Database keep-alive ping failed:', err.message);
        }
    }, 10 * 60 * 1000); // 10 minutes
});