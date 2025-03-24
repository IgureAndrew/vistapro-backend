// src/routes/productRoutes.js
const express = require('express');
const router = express.Router();
const { verifyToken } = require('../middlewares/authMiddleware');
const { verifyRole } = require('../middlewares/roleMiddleware');
const {
  addProduct,
  updateProduct,
  deleteProduct,
  listProducts,
} = require('../controllers/productController');

// Only Master Admin can add, update, or delete products.
router.post('/', verifyToken, verifyRole(["MasterAdmin"]), addProduct);
router.put('/:id', verifyToken, verifyRole(["MasterAdmin"]), updateProduct);
router.delete('/:id', verifyToken, verifyRole(["MasterAdmin"]), deleteProduct);

// Retrieve products – accessible to any authenticated user.
router.get('/', verifyToken, listProducts);

module.exports = router;
