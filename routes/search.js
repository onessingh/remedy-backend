// ✅ UPDATED search.js
const express = require('express');
const router = express.Router();
const db = require('../db');

// Search endpoint
router.get('/search', async (req, res) => {
    const { q: query, type } = req.query;

    if (!query || !type) {
        return res.status(400).json({ success: false, error: 'Query and type are required' });
    }

    try {
        let results = [];

        if (type === 'location') {
            const [blogs] = await db.query(
                `SELECT b.*, u.profileName, u.profileImage
                 FROM blogs b
                 JOIN users u ON b.user_id = u.id
                 WHERE b.location LIKE ? AND (b.status = 'publish' OR (b.status = 'schedule' AND b.scheduleDate <= NOW()))
                 ORDER BY b.created_at DESC`,
                [`%${query}%`]
            );
            results = blogs;

        } else if (type === 'category') {
            const [blogs] = await db.query(
                `SELECT b.*, u.profileName, u.profileImage
                 FROM blogs b
                 JOIN users u ON b.user_id = u.id
                 WHERE b.category LIKE ? AND (b.status = 'publish' OR (b.status = 'schedule' AND b.scheduleDate <= NOW()))
                 ORDER BY b.created_at DESC`,
                [`%${query}%`]
            );
            results = blogs;

        } else if (type === 'user') {
            const [users] = await db.query(
                `SELECT id, profileName, profileImage
                 FROM users
                 WHERE profileName LIKE ?
                 ORDER BY profileName ASC`,
                [`%${query}%`]
            );
            return res.json({ success: true, results: users });

        } else if (type === 'all') {
            const [blogs] = await db.query(
                `SELECT b.*, u.profileName, u.profileImage
                 FROM blogs b
                 JOIN users u ON b.user_id = u.id
                 WHERE (b.title LIKE ? OR b.location LIKE ? OR b.category LIKE ?)
                   AND (b.status = 'publish' OR (b.status = 'schedule' AND b.scheduleDate <= NOW()))
                 ORDER BY b.created_at DESC`,
                [`%${query}%`, `%${query}%`, `%${query}%`]
            );
            results = blogs;

        } else {
            return res.status(400).json({ success: false, error: 'Invalid search type' });
        }

        // Normalize blog results with media
        if (type !== 'user') {
            const allowedCategories = ['tech', 'food', 'news', 'travel'];
            const categoryMap = {
                'technology': 'tech',
                'foods': 'food',
                'new': 'news',
                'travels': 'travel'
            };

            for (let post of results) {
                post.category = allowedCategories.includes(post.category?.toLowerCase())
                    ? post.category.toLowerCase()
                    : categoryMap[post.category?.toLowerCase()] || 'tech';

                post.location = post.location ? post.location.trim() : null;

                const [mediaRows] = await db.query(
                    `SELECT media_url AS url, media_type, is_thumbnail FROM blog_media WHERE blog_id = ? ORDER BY is_thumbnail DESC, created_at ASC`,
                    [post.id]
                );
                post.media = mediaRows.map(media => ({
                    url: media.url,
                    type: media.media_type,
                    isThumbnail: media.is_thumbnail
                }));

                post.author = {
                    name: post.profileName || 'Unknown',
                    image: post.profileImage || '/Uploads/default.jpg'
                };
            }
        }

        res.json({ success: true, results });
    } catch (err) {
        console.error('Search error:', err);
        res.status(500).json({ success: false, error: 'Server error' });
    }
});

module.exports = router;
