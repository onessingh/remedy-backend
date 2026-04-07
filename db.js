const mysql = require('mysql2/promise'); // ✅ Promise version use karo
const dotenv = require('dotenv');

dotenv.config();

const pool = mysql.createPool({   // ✅ createPool use karo better for multiple connections
    host: process.env.DB_HOST,
    port: process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_DATABASE,
    ssl: {
        rejectUnauthorized: false // ✅ Required for Aiven/Cloud MySQL
    },
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

module.exports = pool;