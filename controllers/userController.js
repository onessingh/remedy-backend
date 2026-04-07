const db = require('../db');

exports.getUser = (req, res) => {
  const userId = req.params.id;
  const query = 'SELECT id, name, email, bio, skills, profileImage FROM users WHERE id = ?';
  db.query(query, [userId], (err, results) => {
    if (err) return res.status(500).json({ error: 'Database error' });
    if (results.length === 0) return res.status(404).json({ error: 'User not found' });
    res.json(results[0]);
  });
};

exports.updateUser = (req, res) => {
  const userId = req.params.id;
  const { name, email, bio, skills, profileImage } = req.body;
  const query = 'UPDATE users SET name = ?, email = ?, bio = ?, skills = ?, profileImage = ? WHERE id = ?';
  const values = [name, email, bio, skills, profileImage, userId];
  db.query(query, values, (err, result) => {
    if (err) return res.status(500).json({ error: 'Failed to update user' });
    res.json({ message: 'User updated successfully' });
  });
};
