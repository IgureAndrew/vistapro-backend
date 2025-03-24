// src/controllers/productController.js
const { pool } = require('../config/database');

/**
 * addProduct - Adds a new product purchased from a dealer.
 * Expects the following fields in req.body:
 *   - dealer_id, dealer_business_name, device_name, device_model,
 *     product_quantity, overall_product_quantity, product_base_price, cost_price
 */
const addProduct = async (req, res, next) => {
  try {
    const {
      dealer_id,
      dealer_business_name,
      device_name,
      device_model,
      product_quantity,
      overall_product_quantity,
      product_base_price,
      cost_price,
    } = req.body;

    // Basic validation (adjust as needed)
    if (
      !dealer_id ||
      !device_name ||
      !device_model ||
      product_quantity === undefined ||
      overall_product_quantity === undefined ||
      product_base_price === undefined ||
      cost_price === undefined
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const query = `
      INSERT INTO products 
        (dealer_id, dealer_business_name, device_name, device_model,
         product_quantity, overall_product_quantity, product_base_price, cost_price, created_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, NOW())
      RETURNING *
    `;
    const values = [
      dealer_id,
      dealer_business_name,
      device_name,
      device_model,
      product_quantity,
      overall_product_quantity,
      product_base_price,
      cost_price,
    ];
    const result = await pool.query(query, values);

    return res.status(201).json({
      message: "Product added successfully.",
      product: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * getProducts - Retrieves all products.
 */
const getProducts = async (req, res, next) => {
  try {
    const query = `SELECT * FROM products ORDER BY created_at DESC`;
    const result = await pool.query(query);
    return res.status(200).json({
      message: "Products retrieved successfully.",
      products: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * updateProduct - Updates an existing product by id.
 * Allows updating the following fields:
 *   - dealer_id, dealer_business_name, device_name, device_model,
 *     product_quantity, overall_product_quantity, product_base_price, cost_price
 */
const updateProduct = async (req, res, next) => {
  try {
    const productId = req.params.id;
    const {
      dealer_id,
      dealer_business_name,
      device_name,
      device_model,
      product_quantity,
      overall_product_quantity,
      product_base_price,
      cost_price,
    } = req.body;
    
    // Build the update query
    const query = `
      UPDATE products
      SET 
        dealer_id = COALESCE($1, dealer_id),
        dealer_business_name = COALESCE($2, dealer_business_name),
        device_name = COALESCE($3, device_name),
        device_model = COALESCE($4, device_model),
        product_quantity = COALESCE($5, product_quantity),
        overall_product_quantity = COALESCE($6, overall_product_quantity),
        product_base_price = COALESCE($7, product_base_price),
        cost_price = COALESCE($8, cost_price),
        updated_at = NOW()
      WHERE id = $9
      RETURNING *
    `;
    const values = [
      dealer_id,
      dealer_business_name,
      device_name,
      device_model,
      product_quantity,
      overall_product_quantity,
      product_base_price,
      cost_price,
      productId
    ];
    const result = await pool.query(query, values);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Product not found." });
    }
    
    return res.status(200).json({
      message: "Product updated successfully.",
      product: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

/**
 * deleteProduct - Deletes a product by id.
 */
const deleteProduct = async (req, res, next) => {
  try {
    const productId = req.params.id;
    const query = `DELETE FROM products WHERE id = $1 RETURNING *`;
    const result = await pool.query(query, [productId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Product not found." });
    }
    
    return res.status(200).json({
      message: "Product deleted successfully.",
      product: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

/**
 * listProducts - Lists all products.
 */
const listProducts = async (req, res, next) => {
  try {
    const query = `SELECT * FROM products ORDER BY created_at DESC`;
    const result = await pool.query(query);
    
    return res.status(200).json({
      message: "Products retrieved successfully.",
      products: result.rows
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  addProduct, 
  getProducts,
  updateProduct,
  deleteProduct,
  listProducts
};
