// src/controllers/productController.js
const { pool } = require('../config/database');

/**
 * addProduct
 * Only MasterAdmin or Dealer may add.
 * Inserts a new product with cost, selling price, and computed profit.
 */
const addProduct = async (req, res, next) => {
  try {
    const {
      dealer_id,
      dealer_business_name,
      device_type,
      device_name,
      device_model,
      product_quantity,
      cost_price,
      selling_price,
    } = req.body;

    if (
      !dealer_id ||
      !device_type ||
      !device_name ||
      !device_model ||
      product_quantity == null ||
      cost_price == null ||
      selling_price == null
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // calculate profit
    const profit = parseFloat(selling_price) - parseFloat(cost_price);

    const query = `
      INSERT INTO products
        ( dealer_id,
          dealer_business_name,
          device_type,
          device_name,
          device_model,
          product_quantity,
          cost_price,
          selling_price,
          profit,
          created_at
        )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW())
      RETURNING *
    `;
    const values = [
      dealer_id,
      dealer_business_name || null,
      device_type,
      device_name,
      device_model,
      product_quantity,
      cost_price,
      selling_price,
      profit,
    ];

    const { rows } = await pool.query(query, values);
    res.status(201).json({ message: "Product added.", product: rows[0] });
  } catch (err) {
    next(err);
  }
};

/**
 * getProducts
 * Any authenticated user may list all products.
 */
const getProducts = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT * FROM products ORDER BY created_at DESC`
    );
    res.status(200).json({ products: rows });
  } catch (err) {
    next(err);
  }
};

/**
 * updateProduct
 * Only MasterAdmin may update any product fields.
 * Recomputes profit if both cost_price & selling_price are provided.
 */
const updateProduct = async (req, res, next) => {
  try {
    const productId = req.params.id;
    const {
      dealer_id,
      dealer_business_name,
      device_type,
      device_name,
      device_model,
      product_quantity,
      cost_price,
      selling_price,
    } = req.body;

    // compute profit if both prices present
    let profit = null;
    if (cost_price != null && selling_price != null) {
      profit = parseFloat(selling_price) - parseFloat(cost_price);
    }

    const query = `
      UPDATE products
      SET
        dealer_id               = COALESCE($1, dealer_id),
        dealer_business_name    = COALESCE($2, dealer_business_name),
        device_type             = COALESCE($3, device_type),
        device_name             = COALESCE($4, device_name),
        device_model            = COALESCE($5, device_model),
        product_quantity        = COALESCE($6, product_quantity),
        cost_price              = COALESCE($7, cost_price),
        selling_price           = COALESCE($8, selling_price),
        profit                  = COALESCE($9, profit),
        updated_at              = NOW()
      WHERE id = $10
      RETURNING *
    `;
    const values = [
      dealer_id,
      dealer_business_name,
      device_type,
      device_name,
      device_model,
      product_quantity,
      cost_price,
      selling_price,
      profit,
      productId,
    ];

    const { rows } = await pool.query(query, values);
    if (!rows.length) {
      return res.status(404).json({ message: "Product not found." });
    }

    res.status(200).json({
      message: "Product updated successfully.",
      product: rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * deleteProduct
 * Only MasterAdmin may delete products.
 */
const deleteProduct = async (req, res, next) => {
  try {
    const { role } = req.user;
    if (role !== 'MasterAdmin') {
      return res.status(403).json({ message: 'Not authorized to delete products.' });
    }

    const id = req.params.id;
    const { rows } = await pool.query(
      'DELETE FROM products WHERE id = $1 RETURNING *',
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ message: 'Product not found.' });
    }

    res.status(200).json({
      message: 'Product deleted successfully.',
      product: rows[0],
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  addProduct,
  getProducts,
  updateProduct,
  deleteProduct,
};
