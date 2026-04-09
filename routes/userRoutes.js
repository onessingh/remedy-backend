const express = require('express');
const router = express.Router();
const db = require('../db');
const multer = require('multer');
const sanitizeHtml = require('sanitize-html');
const { sendNotificationEmail } = require('../utils/mailer');

const storage = multer.memoryStorage();
const upload = multer({ storage });

// Simple in-memory queue for async email sending
const emailQueue = [];
function processEmailQueue() {
    if (emailQueue.length === 0) return;
    const { email, type, data } = emailQueue.shift();
    sendNotificationEmail(email, type, data).catch(err => {
        console.error(`Async email error for ${email}, type ${type}:`, err);
    });
    setImmediate(processEmailQueue); // Process next email
}

// Helper function to safely parse JSON
function safeParseJSON(value, defaultValue = []) {
    if (!value) return defaultValue;
    try {
        const parsed = JSON.parse(value);
        return Array.isArray(parsed) ? parsed : defaultValue;
    } catch (err) {
        console.warn(`Invalid JSON in tags: ${value}`);
        return defaultValue;
    }
}

// Middleware: Check if user is authenticated
function ensureAuthenticated(req, res, next) {
    if (req.isAuthenticated() && req.user) {
        return next();
    }
    res.status(401).json({ error: 'Not authenticated' });
}

// Sanitize content to remove unwanted HTML tags and attributes
function sanitizeContent(content) {
    return sanitizeHtml(content, {
        allowedTags: [
            'p', 'strong', 'em', 'a', 'ul', 'ol', 'li', 'br', 'div', 
            'span', 'u', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 
            'blockquote', 'font', 'b', 'i'
        ],
        allowedAttributes: {
            'a': ['href', 'target', 'rel'],
            'span': ['style', 'class'],
            'p': ['style', 'class'],
            'div': ['style', 'class'],
            'font': ['color', 'size', 'face'],
            '*': ['style'] // Allow inline styles for colors, alignment, etc.
        },
        allowedStyles: {
            '*': {
                'color': [/.*/],
                'background-color': [/.*/],
                'text-align': [/.*/],
                'font-size': [/.*/],
                'font-family': [/.*/],
                'font-weight': [/.*/],
                'text-decoration': [/.*/]
            }
        }
    });
}

// GET /api/user - Basic user info
router.get('/', (req, res) => {
    if (req.isAuthenticated() && req.user) {
        const profileImage = req.user.profileImage || req.user.photo;
        return res.json({
            id: req.user.id,
            name: req.user.name,
            email: req.user.email,
            photo: req.user.photo,
            profileName: req.user.profileName,
            profileImage: profileImage
        });
    }
    res.status(401).json({ error: 'Not authenticated' });
});

// GET /api/user/drafts - Get user's drafts
router.get('/drafts', ensureAuthenticated, async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT b.*, u.profileName, u.profileImage,
                   b.theme_color, b.font_family, b.template, b.layout,
                   COALESCE(b.status, 'draft') as status,
                   b.scheduleDate, b.updated_at
            FROM blogs b
            LEFT JOIN users u ON b.user_id = u.id
            WHERE b.user_id = ? AND b.status = 'draft'
            ORDER BY b.created_at DESC
        `, [req.user.id]);

        const draftsWithMedia = await Promise.all(rows.map(async (blog) => {
            const [mediaRows] = await db.query(
                `SELECT media_url, media_type, is_thumbnail FROM blog_media WHERE blog_id = ? ORDER BY is_thumbnail DESC, created_at ASC`,
                [blog.id]
            );
            const thumbnailMedia = mediaRows.find(media => media.is_thumbnail) || mediaRows[0];

            // Normalize category
            const allowedCategories = ['tech', 'food', 'news', 'travel'];
            const categoryMap = {
                'technology': 'tech',
                'foods': 'food',
                'new': 'news',
                'travels': 'travel'
            };
            const normalizedCategory = allowedCategories.includes(blog.category?.toLowerCase()) 
                ? blog.category.toLowerCase() 
                : categoryMap[blog.category?.toLowerCase()] || 'tech';

            // Normalize location
            const normalizedLocation = blog.location ? blog.location.trim() : null;

            return {
                ...blog,
                category: normalizedCategory,
                location: normalizedLocation,
                author: {
                    name: blog.profileName || "Unknown",
                    image: blog.profileImage || "/Uploads/default.jpg"
                },
                thumbnail_url: thumbnailMedia ? thumbnailMedia.media_url : "/Uploads/default.jpg",
                thumbnail_type: thumbnailMedia ? thumbnailMedia.media_type : null,
                media: mediaRows.map(media => ({
                    url: media.media_url,
                    type: media.media_type,
                    isThumbnail: media.is_thumbnail
                })),
                tags: safeParseJSON(blog.tags),
                theme_color: blog.theme_color || '#4de4ff',
                font_family: blog.font_family || 'Roboto',
                template: blog.template || 'modern',
                layout: blog.layout || 'standard',
                status: blog.status || 'draft',
                scheduleDate: blog.scheduleDate || null
            };
        }));

        res.json(draftsWithMedia);

    } catch (err) {
        console.error(`Drafts fetch error for user ${req.user.id}:`, err);
        res.status(500).json({ error: "Failed to load drafts" });
    }
});

// GET /api/user/profile - Blog profile data
router.get('/profile', ensureAuthenticated, async (req, res) => {
    const requestedUserId = req.query.id || req.user.id;

    try {
        const [userRows] = await db.query(
            `SELECT id, profileName, COALESCE(profileImage, photo) as profileImage, photo, bio, achievements, 
                    linkedin, github, twitter 
             FROM users WHERE id = ?`, 
            [requestedUserId]
        );

        const [blogRows] = await db.query(
            `SELECT b.id, b.title, b.content, b.created_at as date, b.category, b.location, b.tags, 
                    b.theme_color, b.font_family, b.template, b.layout,
                    COALESCE(b.status, 'publish') as status, 
                    b.scheduleDate, b.updated_at
             FROM blogs b
             WHERE b.user_id = ? 
               AND (b.status = 'publish' OR (b.status = 'schedule' AND b.scheduleDate <= NOW()))
             ORDER BY b.created_at DESC`,
            [requestedUserId]
        );

        // Fetch media for each blog
        const blogsWithMedia = await Promise.all(blogRows.map(async (blog) => {
            const [mediaRows] = await db.query(
                `SELECT media_url, media_type, is_thumbnail FROM blog_media WHERE blog_id = ? ORDER BY created_at ASC`,
                [blog.id]
            );

            // Normalize category
            const allowedCategories = ['tech', 'food', 'news', 'travel'];
            const categoryMap = {
                'technology': 'tech',
                'foods': 'food',
                'new': 'news',
                'travels': 'travel'
            };
            const normalizedCategory = allowedCategories.includes(blog.category?.toLowerCase()) 
                ? blog.category.toLowerCase() 
                : categoryMap[blog.category?.toLowerCase()] || 'tech';

            // Normalize location
            const normalizedLocation = blog.location ? blog.location.trim() : null;

            return {
                ...blog,
                category: normalizedCategory,
                location: normalizedLocation,
                tags: safeParseJSON(blog.tags),
                theme_color: blog.theme_color || '#4de4ff',
                font_family: blog.font_family || 'Roboto',
                template: blog.template || 'modern',
                layout: blog.layout || 'standard',
                status: blog.status || 'publish',
                scheduleDate: blog.scheduleDate || null,
                media: mediaRows.map(media => ({
                    url: media.media_url,
                    type: media.media_type,
                    isThumbnail: media.is_thumbnail
                }))
            };
        }));

        if (!userRows.length) {
            return res.status(404).json({ error: "User not found" });
        }

        res.json({
            success: true,
            user: userRows[0],
            blogs: blogsWithMedia
        });

    } catch (err) {
        console.error(`Profile load error for user ${requestedUserId}:`, err);
        res.status(500).json({ 
            error: "Failed to load profile",
            details: process.env.NODE_ENV === 'development' ? err.message : null
        });
    }
});

// PUT /api/user/profile - Update blog profile
router.put('/profile', ensureAuthenticated, upload.single('profileImage'), async (req, res) => {
    const { profileName, bio, achievements, linkedin, github, twitter } = req.body;

    try {
        const updates = {};
        if (profileName !== undefined) updates.profileName = profileName.trim();
        if (bio !== undefined) updates.bio = bio.trim();
        if (achievements !== undefined) updates.achievements = achievements.trim();
        if (linkedin !== undefined) updates.linkedin = linkedin.trim();
        if (github !== undefined) updates.github = github.trim();
        if (twitter !== undefined) updates.twitter = twitter.trim();

        if (req.file) {
            updates.profileImage = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
        }

        if (Object.keys(updates).length === 0 && !req.file) {
            return res.status(400).json({ error: "No fields to update" });
        }

        await db.query(`UPDATE users SET ? WHERE id = ?`, [updates, req.user.id]);
        res.json({ success: true, message: "Profile updated" });

    } catch (err) {
        console.error(`Profile update error for user ${req.user.id}:`, err);
        res.status(500).json({ 
            error: "Failed to update profile",
            details: process.env.NODE_ENV === 'development' ? err.message : null
        });
    }
});

// BLOG ROUTES
router.get('/blogs/recent', async (req, res) => {
    try {
        const [rows] = await db.query(`
            SELECT b.*, u.profileName, u.profileImage,
                   b.theme_color, b.font_family, b.template, b.layout,
                   COALESCE(b.status, 'publish') as status,
                   b.scheduleDate, b.updated_at
            FROM blogs b
            LEFT JOIN users u ON b.user_id = u.id
            WHERE b.status = 'publish' OR (b.status = 'schedule' AND b.scheduleDate <= NOW())
            ORDER BY b.created_at DESC LIMIT 6
        `);

        const blogsWithMedia = await Promise.all(rows.map(async (blog) => {
            const [mediaRows] = await db.query(
                `SELECT media_url, media_type, is_thumbnail FROM blog_media WHERE blog_id = ? ORDER BY is_thumbnail DESC, created_at ASC`,
                [blog.id]
            );
            const thumbnailMedia = mediaRows.find(media => media.is_thumbnail) || mediaRows[0];

            // Normalize category
            const allowedCategories = ['tech', 'food', 'news', 'travel'];
            const categoryMap = {
                'technology': 'tech',
                'foods': 'food',
                'new': 'news',
                'travels': 'travel'
            };
            const normalizedCategory = allowedCategories.includes(blog.category?.toLowerCase()) 
                ? blog.category.toLowerCase() 
                : categoryMap[blog.category?.toLowerCase()] || 'tech';

            // Normalize location
            const normalizedLocation = blog.location ? blog.location.trim() : null;

            return {
                ...blog,
                category: normalizedCategory,
                location: normalizedLocation,
                author: {
                    name: blog.profileName || "Unknown",
                    image: blog.profileImage || "/Uploads/default.jpg"
                },
                thumbnail_url: thumbnailMedia ? thumbnailMedia.media_url : "/Uploads/default.jpg",
                thumbnail_type: thumbnailMedia ? thumbnailMedia.media_type : null,
                media: mediaRows.map(media => ({
                    url: media.media_url,
                    type: media.media_type,
                    isThumbnail: media.is_thumbnail
                })),
                tags: safeParseJSON(blog.tags),
                theme_color: blog.theme_color || '#4de4ff',
                font_family: blog.font_family || 'Roboto',
                template: blog.template || 'modern',
                layout: blog.layout || 'standard',
                status: blog.status || 'publish',
                scheduleDate: blog.scheduleDate || null
            };
        }));

        res.json(blogsWithMedia);

    } catch (err) {
        console.error("Recent blogs error:", err);
        res.status(500).json({ error: "Failed to load recent blogs" });
    }
});

// GET /api/user/blogs/:id - Get specific blog
router.get('/blogs/:id', async (req, res) => {
    try {
        const blogId = parseInt(req.params.id, 10);
        if (isNaN(blogId)) {
            return res.status(400).json({ error: "Invalid blog ID" });
        }

        const [blogRows] = await db.query(
            `SELECT b.*, u.profileName, u.profileImage
             FROM blogs b
             LEFT JOIN users u ON b.user_id = u.id
             WHERE b.id = ?`,
            [blogId]
        );

        if (!blogRows.length) {
            return res.status(404).json({ error: "Blog not found" });
        }

        const blog = blogRows[0];
        const [mediaRows] = await db.query(
            `SELECT media_url, media_type, is_thumbnail FROM blog_media WHERE blog_id = ? ORDER BY is_thumbnail DESC, created_at ASC`,
            [blog.id]
        );

        // Normalize category
        const allowedCategories = ['tech', 'food', 'news', 'travel'];
        const categoryMap = {
            'technology': 'tech',
            'foods': 'food',
            'new': 'news',
            'travels': 'travel'
        };
        const normalizedCategory = allowedCategories.includes(blog.category?.toLowerCase()) 
            ? blog.category.toLowerCase() 
            : categoryMap[blog.category?.toLowerCase()] || 'tech';

        // Normalize location
        const normalizedLocation = blog.location ? blog.location.trim() : null;

        res.json({
            ...blog,
            category: normalizedCategory,
            location: normalizedLocation,
            author: {
                name: blog.profileName || "Unknown",
                image: blog.profileImage || "/Uploads/default.jpg"
            },
            tags: safeParseJSON(blog.tags),
            theme_color: blog.theme_color || '#4de4ff',
            font_family: blog.font_family || 'Roboto',
            template: blog.template || 'modern',
            layout: blog.layout || 'standard',
            status: blog.status || 'publish',
            scheduleDate: blog.scheduleDate || null,
            media: mediaRows.map(media => ({
                url: media.media_url,
                type: media.media_type,
                isThumbnail: media.is_thumbnail
            }))
        });

    } catch (err) {
        console.error(`Blog fetch error for blog ${req.params.id}:`, err);
        res.status(500).json({ 
            error: "Failed to fetch blog",
            details: process.env.NODE_ENV === 'development' ? err.message : null
        });
    }
});

// POST /api/user/blogs - Create new blog
router.post('/blogs', ensureAuthenticated, upload.array('media'), async (req, res) => {
    const startTime = Date.now();
    try {
        const { title, content, category, location, tags, theme_color, font_family, template, layout, status, scheduleDate } = req.body;
        if (!title || !content || !category) {
            return res.status(400).json({ error: "Title, content, and category are required" });
        }

        // Validate category
        const allowedCategories = ['tech', 'food', 'news', 'travel'];
        const validCategory = allowedCategories.includes(category.toLowerCase()) ? category.toLowerCase() : 'tech';

        // Validate location (optional, max 100 characters)
        const validLocation = location && location.trim().length <= 100 ? location.trim() : null;

        // Sanitize content
        const sanitizedContent = sanitizeContent(content.trim());

        // Validate tags
        let parsedTags = safeParseJSON(tags);

        // Validate theme_color
        const themeColorRegex = /^#[0-9A-Fa-f]{6}$/;
        const validThemeColor = theme_color && themeColorRegex.test(theme_color) ? theme_color : '#4de4ff';

        // Validate font_family
        const allowedFonts = ['Arial', 'Roboto', 'Montserrat', 'Lora', 'Poppins', 'Open Sans', 
                            'Playfair Display', 'Raleway', 'Merriweather', 'Nunito', 
                            'Oswald', 'Quicksand', 'Source Sans Pro', 'Ubuntu', 
                            'Varela Round', 'Work Sans', 'Cabin', 'Dosis', 
                            'Fira Sans', 'Josefin Sans'];
        const validFontFamily = font_family && allowedFonts.includes(font_family) ? font_family : 'Roboto';

        // Validate template
        const allowedTemplates = ['minimal', 'modern', 'magazine', 'creative', 'vintage', 'futuristic', 'cosmic', 'nature', 'urban', 'retro', 'elegant', 'playful', 'monochrome', 'industrial', 'bohemian', 'nautical', 'pastel', 'neon', 'rustic', 'artdeco'];
        const validTemplate = template && allowedTemplates.includes(template) ? template : 'modern';

        // Validate layout
        const allowedLayouts = ['standard', 'featured-left', 'featured-right', 'full-width'];
        const validLayout = layout && allowedLayouts.includes(layout) ? layout : 'standard';

        // Validate status
        const allowedStatuses = ['publish', 'draft', 'schedule'];
        const validStatus = status && allowedStatuses.includes(status) ? status : 'publish';

        // Validate scheduleDate
        let validScheduleDate = null;
        if (validStatus === 'schedule' && scheduleDate) {
            const date = new Date(scheduleDate);
            if (!isNaN(date.getTime())) {
                validScheduleDate = date;
            } else {
                return res.status(400).json({ error: 'Invalid schedule date' });
            }
        }

        const blogData = {
            user_id: req.user.id,
            title: title.trim(),
            content: sanitizedContent,
            category: validCategory,
            location: validLocation,
            tags: JSON.stringify(parsedTags),
            theme_color: validThemeColor,
            font_family: validFontFamily,
            template: validTemplate,
            layout: validLayout,
            status: validStatus,
            scheduleDate: validScheduleDate,
            created_at: new Date(),
            updated_at: new Date()
        };

        const [result] = await db.query("INSERT INTO blogs SET ?", [blogData]);
        const blogId = result.insertId;

        // Handle media uploads
        if (req.files && req.files.length) {
            for (let i = 0; i < req.files.length; i++) {
                const file = req.files[i];
                const mediaType = req.body[`media_${i}_type`] || file.mimetype;
                const isThumbnail = req.body[`media_${i}_isThumbnail`] === 'true';
                const mediaUrl = `data:${mediaType};base64,${file.buffer.toString('base64')}`;

                await db.query(
                    `INSERT INTO blog_media (blog_id, media_url, media_type, is_thumbnail, created_at) 
                     VALUES (?, ?, ?, ?, NOW())`,
                    [blogId, mediaUrl, mediaType, isThumbnail ? 1 : 0]
                );
            }
        }

        // Log performance
        const duration = Date.now() - startTime;
        if (duration > 200) {
            console.warn(`Blog create slow: ${duration}ms for user ${req.user.id}, blog ${blogId}`);
        }

        res.json({ success: true, message: "Blog created", blogId });

    } catch (err) {
        console.error(`Blog create error for user ${req.user.id}:`, err);
        res.status(500).json({ 
            error: "Failed to create blog",
            details: process.env.NODE_ENV === 'development' ? err.message : null
        });
    }
});

// PUT /api/user/blogs/:id - Update blog
router.put('/blogs/:id', ensureAuthenticated, upload.array('media'), async (req, res) => {
    const startTime = Date.now();
    try {
        const { title, content, category, location, tags, theme_color, font_family, template, layout, status, scheduleDate } = req.body;
        const updates = {};

        if (title) updates.title = title.trim();
        if (content) updates.content = sanitizeContent(content.trim());
        if (category) {
            const allowedCategories = ['tech', 'food', 'news', 'travel'];
            updates.category = allowedCategories.includes(category.toLowerCase()) ? category.toLowerCase() : 'tech';
        }
        if (location !== undefined) {
            updates.location = location && location.trim().length <= 100 ? location.trim() : null;
        }
        if (tags) {
            updates.tags = JSON.stringify(safeParseJSON(tags));
        }
        if (theme_color) {
            const themeColorRegex = /^#[0-9A-Fa-f]{6}$/;
            updates.theme_color = themeColorRegex.test(theme_color) ? theme_color : '#4de4ff';
        }
        if (font_family) {
            const allowedFonts = ['Arial', 'Roboto', 'Montserrat', 'Lora', 'Poppins', 'Open Sans', 
                                'Playfair Display', 'Raleway', 'Merriweather', 'Nunito', 
                                'Oswald', 'Quicksand', 'Source Sans Pro', 'Ubuntu', 
                                'Varela Round', 'Work Sans', 'Cabin', 'Dosis', 
                                'Fira Sans', 'Josefin Sans'];
            updates.font_family = allowedFonts.includes(font_family) ? font_family : 'Roboto';
        }
        if (template) {
            const allowedTemplates = ['minimal', 'modern', 'magazine', 'creative', 'vintage', 'futuristic', 'cosmic', 'nature', 'urban', 'retro', 'elegant', 'playful', 'monochrome', 'industrial', 'bohemian', 'nautical', 'pastel', 'neon', 'rustic', 'artdeco'];
            updates.template = allowedTemplates.includes(template) ? template : 'modern';
        }
        if (layout) {
            const allowedLayouts = ['standard', 'featured-left', 'featured-right', 'full-width'];
            updates.layout = allowedLayouts.includes(layout) ? layout : 'standard';
        }
        if (status) {
            const allowedStatuses = ['publish', 'draft', 'schedule'];
            updates.status = allowedStatuses.includes(status) ? status : 'publish';
        }
        updates.scheduleDate = status === 'schedule' && scheduleDate ? new Date(scheduleDate) : null;
        updates.updated_at = new Date();

        // Verify blog ownership
        const [blog] = await db.query("SELECT user_id FROM blogs WHERE id = ?", [req.params.id]);
        if (!blog.length || blog[0].user_id !== req.user.id) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        // Update blog data
        if (Object.keys(updates).length > 0) {
            await db.query("UPDATE blogs SET ? WHERE id = ?", [updates, req.params.id]);
        }

        // Handle media uploads
        if (req.files && req.files.length) {
            // Clear existing media
            await db.query("DELETE FROM blog_media WHERE blog_id = ?", [req.params.id]);

            for (let i = 0; i < req.files.length; i++) {
                const file = req.files[i];
                const mediaType = req.body[`media_${i}_type`] || file.mimetype;
                const isThumbnail = req.body[`media_${i}_isThumbnail`] === 'true';
                const mediaUrl = `data:${mediaType};base64,${file.buffer.toString('base64')}`;

                await db.query(
                    `INSERT INTO blog_media (blog_id, media_url, media_type, is_thumbnail, created_at) 
                     VALUES (?, ?, ?, ?, NOW())`,
                    [req.params.id, mediaUrl, mediaType, isThumbnail ? 1 : 0]
                );
            }
        }

        // Log performance
        const duration = Date.now() - startTime;
        if (duration > 200) {
            console.warn(`Blog update slow: ${duration}ms for user ${req.user.id}, blog ${req.params.id}`);
        }

        res.json({ success: true, message: "Blog updated" });

    } catch (err) {
        console.error(`Blog update error for blog ${req.params.id}:`, err);
        res.status(500).json({ 
            error: "Failed to update blog",
            details: process.env.NODE_ENV === 'development' ? err.message : null
        });
    }
});

// DELETE /api/user/blogs/:id - Delete blog
router.delete('/blogs/:id', ensureAuthenticated, async (req, res) => {
    try {
        const [blog] = await db.query("SELECT user_id FROM blogs WHERE id = ?", [req.params.id]);
        if (!blog.length) return res.status(404).json({ error: "Blog not found" });
        if (blog[0].user_id !== req.user.id) {
            return res.status(403).json({ error: "Unauthorized" });
        }

        await db.query("DELETE FROM blog_media WHERE blog_id = ?", [req.params.id]);
        await db.query("DELETE FROM blogs WHERE id = ?", [req.params.id]);
        res.json({ success: true, message: "Blog deleted" });

    } catch (err) {
        console.error(`Blog delete error for blog ${req.params.id}:`, err);
        res.status(500).json({ error: "Failed to delete blog" });
    }
});

// LIKE ROUTES
router.post('/like/:blogId', ensureAuthenticated, async (req, res) => {
    const startTime = Date.now();
    try {
        // Validate blogId
        const blogId = parseInt(req.params.blogId, 10);
        if (isNaN(blogId)) {
            return res.status(400).json({ error: "Invalid blog ID" });
        }

        // Check blog existence and get owner info
        const [blog] = await db.query(
            "SELECT b.user_id, b.title, u.email FROM blogs b LEFT JOIN users u ON b.user_id = u.id WHERE b.id = ?",
            [blogId]
        );
        if (!blog.length) {
            return res.status(404).json({ error: "Blog not found" });
        }

        // Check if already liked
        const [existing] = await db.query(
            "SELECT id FROM likes WHERE user_id = ? AND blog_id = ?",
            [req.user.id, blogId]
        );

        if (existing.length > 0) {
            // Unlike: Remove the like
            await db.query(
                "DELETE FROM likes WHERE user_id = ? AND blog_id = ?",
                [req.user.id, blogId]
            );
            res.json({ success: true, liked: false });
        } else {
            // Like: Add the like
            await db.query(
                "INSERT INTO likes (user_id, blog_id, created_at) VALUES (?, ?, NOW())",
                [req.user.id, blogId]
            );

            // Send notifications only if not self-liking
            if (blog[0].user_id !== req.user.id) {
                // In-app notification
                await db.query(
                    "INSERT INTO notifications (user_id, actor_id, type, reference_id, created_at) VALUES (?, ?, 'like', ?, NOW())",
                    [blog[0].user_id, req.user.id, blogId]
                );

                // Queue email notification
                if (blog[0].email) {
                    emailQueue.push({
                        email: blog[0].email,
                        type: 'like',
                        data: {
                            actorName: req.user.profileName || req.user.name || 'Someone',
                            blogTitle: blog[0].title || 'Untitled'
                        }
                    });
                    setImmediate(processEmailQueue);
                }
            }
            res.json({ success: true, liked: true });
        }

        // Log performance
        const duration = Date.now() - startTime;
        if (duration > 200) {
            console.warn(`Like route slow: ${duration}ms for user ${req.user.id}, blog ${blogId}`);
        }

    } catch (err) {
        console.error(`Like error for blog ${req.params.blogId}:`, err);
        res.status(500).json({ error: "Failed to update like" });
    }
});

// GET /api/user/blogs/:id/likes - Get like count
router.get('/blogs/:id/likes', async (req, res) => {
    try {
        const blogId = parseInt(req.params.id, 10);
        if (isNaN(blogId)) {
            return res.status(400).json({ error: "Invalid blog ID" });
        }

        const [[{ count }]] = await db.query(
            "SELECT COUNT(*) AS count FROM likes WHERE blog_id = ?",
            [blogId]
        );
        res.json({ count });
    } catch (err) {
        console.error(`Likes count error for blog ${req.params.id}:`, err);
        res.status(500).json({ error: "Failed to get likes count" });
    }
});

// GET /api/user/blogs/:id/likes/check - Check if user liked
router.get('/blogs/:id/likes/check', ensureAuthenticated, async (req, res) => {
    try {
        const blogId = parseInt(req.params.id, 10);
        if (isNaN(blogId)) {
            return res.status(400).json({ error: "Invalid blog ID" });
        }

        const [rows] = await db.query(
            "SELECT id FROM likes WHERE blog_id = ? AND user_id = ?",
            [blogId, req.user.id]
        );

        res.json({ liked: rows.length > 0 });

    } catch (err) {
        console.error(`Like check error for blog ${req.params.id}:`, err);
        res.status(500).json({ error: "Failed to check like status" });
    }
});

// GET /api/user/blogs/:id/likes/users - Get users who liked
router.get('/blogs/:id/likes/users', async (req, res) => {
    try {
        const blogId = parseInt(req.params.id, 10);
        if (isNaN(blogId)) {
            return res.status(400).json({ error: "Invalid blog ID" });
        }

        const [users] = await db.query(`
            SELECT u.id, u.profileName AS name, u.profileImage
            FROM likes l
            JOIN users u ON l.user_id = u.id
            WHERE l.blog_id = ?
            ORDER BY l.created_at DESC
        `, [blogId]);
        
        res.json(users.map(user => ({
            id: user.id,
            name: user.name || 'User',
            profileImage: user.profileImage || '/Uploads/default.jpg'
        })));
    } catch (err) {
        console.error(`Liked users error for blog ${req.params.id}:`, err);
        res.status(500).json({ error: "Failed to get liked users" });
    }
});

// COMMENT ROUTES
router.get('/blogs/:id/comments', async (req, res) => {
    try {
        const blogId = parseInt(req.params.id, 10);
        if (isNaN(blogId)) {
            return res.status(400).json({ error: "Invalid blog ID" });
        }

        const [comments] = await db.query(`
            SELECT c.*, u.profileName AS user_name, u.profileImage AS user_image
            FROM comments c
            JOIN users u ON c.user_id = u.id
            WHERE c.blog_id = ?
            ORDER BY c.created_at DESC
        `, [blogId]);
        
        res.json(comments.map(c => ({
            id: c.id,
            content: c.text,
            created_at: c.created_at,
            author: {
                id: c.user_id,
                name: c.user_name || 'User',
                image: c.user_image || '/Uploads/default.jpg'
            }
        })));
    } catch (err) {
        console.error(`Comments error for blog ${req.params.id}:`, err);
        res.status(500).json({ error: "Failed to get comments" });
    }
});

router.post('/blogs/:id/comments', ensureAuthenticated, async (req, res) => {
    try {
        const blogId = parseInt(req.params.id, 10);
        if (isNaN(blogId)) {
            return res.status(400).json({ error: "Invalid blog ID" });
        }

        const { content } = req.body;
        if (!content || !content.trim()) {
            return res.status(400).json({ error: "Comment text required" });
        }

        const sanitizedComment = sanitizeContent(content.trim());

        const [blog] = await db.query(
            "SELECT b.user_id, b.title, u.email FROM blogs b LEFT JOIN users u ON b.user_id = u.id WHERE b.id = ?",
            [blogId]
        );
        if (!blog.length) {
            return res.status(404).json({ error: "Blog not found" });
        }

        const [result] = await db.query(
            "INSERT INTO comments (blog_id, user_id, text, created_at) VALUES (?, ?, ?, NOW())",
            [blogId, req.user.id, sanitizedComment]
        );

        if (blog[0].user_id !== req.user.id) {
            await db.query(
                "INSERT INTO notifications (user_id, actor_id, type, reference_id, created_at) VALUES (?, ?, 'comment', ?, NOW())",
                [blog[0].user_id, req.user.id, blogId]
            );

            // Queue email notification
            if (blog[0].email) {
                emailQueue.push({
                    email: blog[0].email,
                    type: 'comment',
                    data: {
                        actorName: req.user.profileName || req.user.name || 'Someone',
                        blogTitle: blog[0].title || 'Untitled',
                        commentText: sanitizedComment
                    }
                });
                setImmediate(processEmailQueue);
            }
        }

        res.json({ 
            success: true, 
            commentId: result.insertId 
        });

    } catch (err) {
        console.error(`Comment error for blog ${req.params.id}:`, err);
        res.status(500).json({ error: "Failed to add comment" });
    }
});

router.delete('/blogs/:id/comments/:commentId', ensureAuthenticated, async (req, res) => {
    try {
        const blogId = parseInt(req.params.id, 10);
        const commentId = parseInt(req.params.commentId, 10);
        if (isNaN(blogId) || isNaN(commentId)) {
            return res.status(400).json({ error: "Invalid blog or comment ID" });
        }

        const [comment] = await db.query(`
            SELECT c.user_id, b.user_id AS blog_owner_id 
            FROM comments c
            JOIN blogs b ON c.blog_id = b.id
            WHERE c.id = ? AND c.blog_id = ?`,
            [commentId, blogId]
        );
        
        if (!comment.length) {
            return res.status(404).json({ error: "Comment not found" });
        }
        
        const canDelete = comment[0].user_id === req.user.id || 
                         comment[0].blog_owner_id === req.user.id;
        
        if (!canDelete) {
            return res.status(403).json({ error: "Unauthorized" });
        }
        
        await db.query("DELETE FROM comments WHERE id = ?", [commentId]);
        res.json({ success: true, message: "Comment deleted" });

    } catch (err) {
        console.error(`Comment delete error for comment ${req.params.commentId}:`, err);
        res.status(500).json({ error: "Failed to delete comment" });
    }
});

// FOLLOW ROUTES
router.post('/follow/:userId', ensureAuthenticated, async (req, res) => {
    try {
        const userId = parseInt(req.params.userId, 10);
        if (isNaN(userId)) {
            return res.status(400).json({ error: "Invalid user ID" });
        }

        if (userId === req.user.id) {
            return res.status(400).json({ error: "Cannot follow yourself" });
        }

        const [user] = await db.query(
            "SELECT id, email, profileName FROM users WHERE id = ?",
            [userId]
        );
        if (!user.length) {
            return res.status(404).json({ error: "User not found" });
        }

        const [existing] = await db.query(
            "SELECT id FROM follows WHERE follower_id = ? AND following_id = ?",
            [req.user.id, userId]
        );
        if (existing.length) {
            return res.status(400).json({ error: "Already following" });
        }

        await db.query(
            "INSERT INTO follows (follower_id, following_id, created_at) VALUES (?, ?, NOW())",
            [req.user.id, userId]
        );

        await db.query(
            "INSERT INTO notifications (user_id, actor_id, type, created_at) VALUES (?, ?, 'follow', NOW())",
            [userId, req.user.id]
        );

        // Queue email notification
        if (user[0].email) {
            emailQueue.push({
                email: user[0].email,
                type: 'follow',
                data: {
                    actorName: req.user.profileName || req.user.name || 'Someone'
                }
            });
            setImmediate(processEmailQueue);
        }

        res.json({ success: true });

    } catch (err) {
        console.error(`Follow error for user ${req.params.userId}:`, err);
        res.status(500).json({ error: "Failed to follow user" });
    }
});

router.post('/unfollow/:userId', ensureAuthenticated, async (req, res) => {
    try {
        const userId = parseInt(req.params.userId, 10);
        if (isNaN(userId)) {
            return res.status(400).json({ error: "Invalid user ID" });
        }

        const [result] = await db.query(
            "DELETE FROM follows WHERE follower_id = ? AND following_id = ?",
            [req.user.id, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: "Not following this user" });
        }

        res.json({ success: true });

    } catch (err) {
        console.error(`Unfollow error for user ${req.params.userId}:`, err);
        res.status(500).json({ error: "Failed to unfollow user" });
    }
});

router.get('/follow/status', ensureAuthenticated, async (req, res) => {
    try {
        const userId = parseInt(req.query.userId, 10);
        if (isNaN(userId)) {
            return res.status(400).json({ error: "Invalid user ID" });
        }

        const [rows] = await db.query(
            "SELECT id FROM follows WHERE follower_id = ? AND following_id = ?",
            [req.user.id, userId]
        );
        res.json({ isFollowing: rows.length > 0 });
    } catch (err) {
        console.error(`Follow status error for user ${req.query.userId}:`, err);
        res.status(500).json({ error: "Failed to check follow status" });
    }
});

router.get('/followers', ensureAuthenticated, async (req, res) => {
    const userId = req.query.userId ? parseInt(req.query.userId, 10) : req.user.id;
    if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
    }

    try {
        const [followers] = await db.query(`
            SELECT 
                u.id, 
                u.profileName, 
                u.profileImage,
                u.bio
            FROM follows f
            JOIN users u ON f.follower_id = u.id
            WHERE f.following_id = ?
            ORDER BY f.created_at DESC
        `, [userId]);

        res.json({
            success: true,
            followers: followers.map(user => ({
                id: user.id,
                name: user.profileName || 'User',
                image: user.profileImage || '/Uploads/default.jpg',
                bio: user.bio || ''
            }))
        });

    } catch (err) {
        console.error(`Error fetching followers for user ${userId}:`, err);
        res.status(500).json({ 
            success: false,
            error: "Failed to load followers list" 
        });
    }
});

router.get('/following', ensureAuthenticated, async (req, res) => {
    const userId = req.query.userId ? parseInt(req.query.userId, 10) : req.user.id;
    if (isNaN(userId)) {
        return res.status(400).json({ error: "Invalid user ID" });
    }

    try {
        const [following] = await db.query(`
            SELECT 
                u.id, 
                u.profileName, 
                u.profileImage,
                u.bio
            FROM follows f
            JOIN users u ON f.following_id = u.id
            WHERE f.follower_id = ?
            ORDER BY f.created_at DESC
        `, [userId]);

        res.json({
            success: true,
            following: following.map(user => ({
                id: user.id,
                name: user.profileName || 'User',
                image: user.profileImage || '/Uploads/default.jpg',
                bio: user.bio || ''
            }))
        });

    } catch (err) {
        console.error(`Error fetching following list for user ${userId}:`, err);
        res.status(500).json({ 
            success: false,
            error: "Failed to load following list" 
        });
    }
});

// NOTIFICATION ROUTES
router.get('/notifications', ensureAuthenticated, async (req, res) => {
    const userId = req.user.id;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 10;
    const offset = (page - 1) * limit;

    try {
        const [rows] = await db.query(`
            SELECT 
                n.*,
                u.profileName,
                u.profileImage,
                b.title AS blogTitle
            FROM notifications n
            JOIN users u ON n.actor_id = u.id
            LEFT JOIN blogs b ON n.reference_id = b.id
            WHERE n.user_id = ?
            ORDER BY n.created_at DESC
            LIMIT ? OFFSET ?`,
            [userId, limit, offset]
        );

        const [[{ count }]] = await db.query(
            "SELECT COUNT(*) AS count FROM notifications WHERE user_id = ?",
            [userId]
        );

        res.json({
            success: true,
            notifications: rows,
            pagination: {
                total: count,
                page,
                limit,
                totalPages: Math.ceil(count / limit)
            }
        });
    } catch (err) {
        console.error(`Notification fetch error for user ${userId}:`, err);
        res.status(500).json({ error: "Failed to load notifications" });
    }
});

router.get('/notifications/unread-count', ensureAuthenticated, async (req, res) => {
    const userId = req.user.id;
    try {
        const [[{ count }]] = await db.query(
            "SELECT COUNT(*) AS count FROM notifications WHERE user_id = ? AND isRead = FALSE",
            [userId]
        );
        res.json({ success: true, unreadCount: count });
    } catch (err) {
        console.error(`Unread count error for user ${userId}:`, err);
        res.status(500).json({ error: "Failed to fetch unread count" });
    }
});

router.post('/notification/read/:notificationId', ensureAuthenticated, async (req, res) => {
    const notificationId = parseInt(req.params.notificationId, 10);
    const userId = req.user.id;

    if (isNaN(notificationId)) {
        return res.status(400).json({ error: "Invalid notification ID" });
    }

    try {
        const [notif] = await db.query(
            "SELECT * FROM notifications WHERE id = ? AND user_id = ?",
            [notificationId, userId]
        );

        if (!notif.length) {
            return res.status(404).json({ error: "Notification not found or unauthorized" });
        }

        await db.query("UPDATE notifications SET isRead = TRUE WHERE id = ?", [notificationId]);
        res.json({ success: true, message: "Notification marked as read" });

    } catch (err) {
        console.error(`Mark read error for notification ${notificationId}:`, err);
        res.status(500).json({ error: "Failed to mark notification as read" });
    }
});

router.delete('/notifications/clear/:days', ensureAuthenticated, async (req, res) => {
    const userId = req.user.id;
    const days = parseInt(req.params.days, 10);
    
    if (isNaN(days) || days <= 0) {
        return res.status(400).json({ error: "Please provide a valid number of days" });
    }

    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);

        await db.query(
            "DELETE FROM notifications WHERE user_id = ? AND created_at < ?",
            [userId, cutoffDate]
        );

        res.json({
            success: true,
            message: `${days}-day old notifications cleared`,
            deletedBefore: cutoffDate.toISOString()
        });
    } catch (err) {
        console.error(`Error clearing notifications for user ${userId}:`, err);
        res.status(500).json({ error: "Failed to clear old notifications" });
    }
});

router.delete('/notification/:id', ensureAuthenticated, async (req, res) => {
    const userId = req.user.id;
    const notificationId = parseInt(req.params.id, 10);

    if (isNaN(notificationId)) {
        return res.status(400).json({ error: "Invalid notification ID" });
    }

    try {
        const [result] = await db.query(
            "DELETE FROM notifications WHERE id = ? AND user_id = ?",
            [notificationId, userId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ 
                success: false, 
                error: "Notification not found or unauthorized" 
            });
        }

        res.json({ success: true, message: "Notification deleted successfully" });
    } catch (err) {
        console.error(`Error deleting notification ${notificationId}:`, err);
        res.status(500).json({ error: "Failed to delete notification" });
    }
});

router.post('/notifications/mark-all-read', ensureAuthenticated, async (req, res) => {
    try {
        await db.query(
            "UPDATE notifications SET isRead = TRUE WHERE user_id = ?",
            [req.user.id]
        );
        
        res.json({ 
            success: true, 
            message: "All notifications marked as read" 
        });
    } catch (err) {
        console.error(`Error marking all notifications as read for user ${req.user.id}:`, err);
        res.status(500).json({ 
            success: false,
            error: "Failed to mark notifications as read" 
        });
    }
});

// NEWSLETTER ROUTES
router.post('/newsletter/subscribe', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const [existing] = await db.query(
            'SELECT id FROM newsletter_subscribers WHERE email = ?',
            [email]
        );

        if (existing.length) {
            return res.status(400).json({ error: 'Already subscribed' });
        }

        await db.query(
            'INSERT INTO newsletter_subscribers (email, subscribed_at) VALUES (?, NOW())',
            [email]
        );

        // Queue email notification
        emailQueue.push({
            email,
            type: 'newsletter_subscribe',
            data: {}
        });
        setImmediate(processEmailQueue);

        if (req.isAuthenticated() && req.user) {
            await db.query(
                'INSERT INTO notifications (user_id, actor_id, type, message, created_at) VALUES (?, ?, ?, ?, NOW())',
                [req.user.id, req.user.id, 'newsletter', 'Subscribed to newsletter']
            );
        }

        res.json({ success: true, message: 'Subscribed to newsletter' });
    } catch (err) {
        console.error(`Newsletter subscribe error for ${req.body.email}:`, err);
        res.status(500).json({ error: 'Failed to subscribe' });
    }
});

router.post('/newsletter/unsubscribe', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const [result] = await db.query(
            'DELETE FROM newsletter_subscribers WHERE email = ?',
            [email]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Not subscribed' });
        }

        // Queue email notification
        emailQueue.push({
            email,
            type: 'newsletter_unsubscribe',
            data: {}
        });
        setImmediate(processEmailQueue);

        if (req.isAuthenticated() && req.user) {
            await db.query(
                'INSERT INTO notifications (user_id, actor_id, type, message, created_at) VALUES (?, ?, ?, ?, NOW())',
                [req.user.id, req.user.id, 'newsletter', 'Unsubscribed from newsletter']
            );
        }

        res.json({ success: true, message: 'Unsubscribed from newsletter' });
    } catch (err) {
        console.error(`Newsletter unsubscribe error for ${req.body.email}:`, err);
        res.status(500).json({ error: 'Failed to unsubscribe' });
    }
});

router.get('/newsletter/check', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) {
            return res.status(400).json({ error: 'Email is required' });
        }

        const [rows] = await db.query(
            'SELECT id FROM newsletter_subscribers WHERE email = ?',
            [email]
        );

        res.json({ success: true, isSubscribed: rows.length > 0 });
    } catch (err) {
        console.error(`Newsletter check error for ${req.query.email}:`, err);
        res.status(500).json({ error: 'Failed to check subscription status' });
    }
});

module.exports = router;