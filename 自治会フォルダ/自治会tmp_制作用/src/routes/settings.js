const express = require('express');
const config = require('../config');

const router = express.Router();

router.get('/', (req, res) => {
  res.json({ communityName: config.communityName });
});

module.exports = router;
