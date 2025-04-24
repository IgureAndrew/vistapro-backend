// src/controllers/productController.js
const { pool } = require('../config/database');


/**
 * addProductWithUnits
 * - Inserts the product model.
 * - Then inserts one inventory_items row per IMEI.
 * Expects `imeis: string[]` in the body.
 */
async function addProduct(req, res, next) {
  const client = await pool.connect();
  try {
    const {
      dealer_id,
      device_type,
      device_name,
      device_model,
      cost_price,
      selling_price,
      imeis,
    } = req.body;

    // 1) validate…
    if (!dealer_id || !device_type || !device_name || !device_model ||
        cost_price == null || selling_price == null || !Array.isArray(imeis) ||
        imeis.length === 0) {
      return res.status(400).json({ message: "Missing required fields or imeis array." });
    }
    // each IMEI must be 15 digits
    if (!imeis.every(i => /^\d{15}$/.test(i))) {
      return res.status(400).json({ message: "All IMEIs must be 15-digit strings." });
    }

    await client.query('BEGIN');

    // 2) create the product model
    const prodRes = await client.query(
      `INSERT INTO products (
         dealer_id, device_type, device_name, device_model,
         cost_price, selling_price, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,NOW())
       RETURNING *`,
      [dealer_id, device_type, device_name, device_model, cost_price, selling_price]
    );
    const product = prodRes.rows[0];

    // 3) bulk-insert each IMEI
    const placeholders = imeis
      .map((_, idx) => `($1, $${idx+2}, 'available', NOW())`)
      .join(',');
    await client.query(
      `INSERT INTO inventory_items
         (product_id, imei, status, created_at)
       VALUES ${placeholders}`,
      [product.id, ...imeis]
    );

    await client.query('COMMIT');
    res.status(201).json({ message: "Product + units added.", product });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

/**
 * getProducts
 * Any authenticated user may list all products.
 * Now includes IMEI, is_low_stock, and is_available flags.
 */
async function getProducts(req, res, next) {
  try {
    const { rows } = await pool.query(`
      SELECT
        p.id, p.dealer_id, p.device_type, p.device_name, p.device_model,
        p.cost_price, p.selling_price, p.created_at, p.updated_at,

        -- count available units
        COUNT(i.*) FILTER (WHERE i.status = 'available')   AS quantity_available,
        -- flag low stock
        (COUNT(i.*) FILTER (WHERE i.status = 'available') <= 2)
          AS is_low_stock
      FROM products p
      LEFT JOIN inventory_items i
        ON i.product_id = p.id
      GROUP BY p.id
      ORDER BY p.created_at DESC
    `);

    res.status(200).json({ products: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * updateProduct
 * Only MasterAdmin may update.
 * Adjusts any provided fields—including IMEI and quantity—and leaves others intact.
 * Enforces is_available=false when quantity <= 0.
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
      imei,
    } = req.body;

    if (imei !== undefined && !/^\d{15}$/.test(imei)) {
      return res
        .status(400)
        .json({ message: "IMEI must be a 15-digit number." });
    }

    // If quantity is provided, determine new availability
    const availabilityCase = product_quantity !== undefined
      ? `, is_available = CASE WHEN $6 > 0 THEN true ELSE false END`
      : "";

    const query = `
      UPDATE products
      SET
        dealer_id            = COALESCE($1, dealer_id),
        dealer_business_name = COALESCE($2, dealer_business_name),
        device_type          = COALESCE($3, device_type),
        device_name          = COALESCE($4, device_name),
        device_model         = COALESCE($5, device_model),
        product_quantity     = COALESCE($6, product_quantity),
        cost_price           = COALESCE($7, cost_price),
        selling_price        = COALESCE($8, selling_price),
        imei                 = COALESCE($9, imei)
        ${availabilityCase},
        updated_at           = NOW()
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
      imei,
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
      return res
        .status(403)
        .json({ message: 'Not authorized to delete products.' });
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
