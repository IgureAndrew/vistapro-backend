const express = require('express');
const {
  getAllWallets,     // new controller to list all wallets
  listPending,       // reuse your listPending handler
  review,            // reuse your review handler
  releaseWithheld    // reuse your releaseWithheld handler
} = require('../controllers/adminWalletController');

const router = express.Router();

// 1. GET all marketers’ wallet balances
router.get('/wallets', getAllWallets);

// 2. GET all pending withdrawal requests
router.get('/requests', listPending);

// 3. PATCH a single request (approve/reject)
router.patch('/requests/:reqId', review);

// 4. POST to release all withheld balances
router.post('/release-withheld', releaseWithheld);

module.exports = router;
