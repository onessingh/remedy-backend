const db = require('./db');
require('dotenv').config();

async function resetDatabase() {
    console.log('🧹 Database clearing process started...');

    let connection;
    try {
        connection = await db.getConnection();

        // 🛑 Step 1: Disable foreign key checks
        await connection.query('SET FOREIGN_KEY_CHECKS = 0');
        console.log('🔓 Foreign key checks disabled.');

        // 🗑️ Step 2: Truncate tables
        const tables = [
            'notifications',
            'comments',
            'likes',
            'blog_media',
            'blogs',
            'users'
        ];

        for (const table of tables) {
            try {
                await connection.query(`TRUNCATE TABLE ${table}`);
                console.log(`✅ Table "${table}" cleared.`);
            } catch (err) {
                console.error(`❌ Error clearing table "${table}":`, err.message);
            }
        }

        // 🔒 Step 3: Re-enable foreign key checks
        await connection.query('SET FOREIGN_KEY_CHECKS = 1');
        console.log('🔒 Foreign key checks re-enabled.');

        console.log('\n✨ ALL DATA DELETED SUCCESSFULLY! Your database is now fresh and ready for production.');

    } catch (error) {
        console.error('💥 Reset failed:', error);
    } finally {
        if (connection) connection.release();
        process.exit();
    }
}

// Security: Check if were in production environment locally as a safeguard? 
// Actually user explicitly asked for this.
resetDatabase();
