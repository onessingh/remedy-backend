const express = require('express');
const router = express.Router();

router.get('/api/check-auth', (req, res) => {
  if (req.isAuthenticated()) {
    res.json({ loggedIn: true, user: req.user });
  } else {
    res.json({ loggedIn: false });
  }
});

module.exports = router;