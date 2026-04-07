const express = require('express');
const router = express.Router();
const db = require('../db');

// Get blog by ID with author info
router.get('/blogs/:id', (req, res) => {
    const blogId = req.params.id;

    const blogQuery = `
        SELECT blogs.*, users.name AS author
        FROM blogs
        JOIN users ON blogs.user_id = users.id
        WHERE blogs.id = ?
    `;

    db.query(blogQuery, [blogId], (err, blogResults) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        if (blogResults.length === 0) return res.status(404).json({ error: 'Blog not found' });

        const blog = blogResults[0];

        const commentQuery = `
            SELECT comments.*, users.name AS commenter
            FROM comments
            JOIN users ON comments.user_id = users.id
            WHERE comments.blog_id = ?
            ORDER BY comments.created_at DESC
        `;

        db.query(commentQuery, [blogId], (err, commentResults) => {
            if (err) return res.status(500).json({ error: 'Error fetching comments' });
            res.json({ blog, comments: commentResults });
        });
    });
});

// Post a comment
router.post('/blogs/:id/comments', (req, res) => {
    const blogId = req.params.id;
    const { user_id, comment } = req.body;

    const insertQuery = 'INSERT INTO comments (blog_id, user_id, comment) VALUES (?, ?, ?)';
    db.query(insertQuery, [blogId, user_id, comment], (err, result) => {
        if (err) return res.status(500).json({ error: 'Error posting comment' });
        res.json({ message: 'Comment posted successfully' });
    });
});

module.exports = router;