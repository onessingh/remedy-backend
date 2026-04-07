const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

dotenv.config();

async function setupDatabase() {
    console.log('🚀 Database setup start ho raha hai...');

    const connection = await mysql.createConnection({
        host: process.env.DB_HOST,
        port: process.env.DB_PORT || 22403,
        user: process.env.DB_USER,
        password: process.env.DB_PASSWORD,
        database: process.env.DB_DATABASE,
        ssl: {
            rejectUnauthorized: false
        },
        multipleStatements: true // ✅ Ek saath saari queries run karne ke liye
    });

    try {
        // SQL file read karna (auth_system.sql jo project root mein hai)
        const sqlPath = path.join(__dirname, '..', 'auth_system.sql');
        
        if (!fs.existsSync(sqlPath)) {
            console.error('❌ Error: auth_system.sql file nahi mili! Check karein ki file project root mein hai ya nahi.');
            return;
        }

        const sql = fs.readFileSync(sqlPath, 'utf8');

        console.log('⏳ Tables create ho rahi hain... (Isme thoda time lag sakta hai)');
        
        // SQL queries execute karna
        await connection.query(sql);

        console.log('✅ Sab kuch set hai! Saari tables successfully migrate ho gayi hain.');
        console.log('🎉 Ab aap Signup/Login try kar sakte hain.');

    } catch (error) {
        console.error('❌ Database setup mein error aaya:', error.message);
        if (error.message.includes('Access denied')) {
            console.log('💡 Tip: Apna .env mein DB_PASSWORD sahi se check karein.');
        }
    } finally {
        await connection.end();
        process.exit();
    }
}

setupDatabase();
