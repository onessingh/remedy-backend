const express = require('express');
const router = express.Router();
const { updateProfile, changePassword, forgotPassword } = require('../controllers/profilecontroller');
const upload = require('../middlewares/uploadmiddleware');

// Middleware to check login
function isAuthenticated(req, res, next) {
    if (req.isAuthenticated()) return next();
    return res.status(401).json({ message: 'Unauthorized' });
}

// ✅ Profile update route
router.post('/update-profile', isAuthenticated, upload.single('photo'), updateProfile);

// ✅ Change password route
router.post('/change-password', isAuthenticated, changePassword);

// ✅ Forgot password route
router.post('/forgot-password', forgotPassword);

module.exports = router;