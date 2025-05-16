// src/controllers/productController.js
const { pool } = require('../config/database');

/**
 * addProduct
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
        cost_price == null || selling_price == null ||
        !Array.isArray(imeis) || imeis.length === 0) {
      return res.status(400).json({ message: "Missing required fields or imeis array." });
    }
    if (!imeis.every(i => /^\d{15}$/.test(i))) {
      return res.status(400).json({ message: "All IMEIs must be 15-digit strings." });
    }

    await client.query('BEGIN');

    // 2) create the product
    const { rows: [product] } = await client.query(
      `INSERT INTO products (
         dealer_id, device_type, device_name, device_model,
         cost_price, selling_price, created_at
       ) VALUES ($1,$2,$3,$4,$5,$6,NOW())
       RETURNING *`,
      [dealer_id, device_type, device_name, device_model, cost_price, selling_price]
    );

    // 3) bulk-insert IMEIs
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
 * Includes dealer info, qty_available, is_low_stock & available_imeis.
 */
async function getProducts(req, res, next) {
  try {
    const { rows } = await pool.query(`
      SELECT
        p.id,
        p.dealer_id,
        u.business_name   AS dealer_name,
        u.location        AS dealer_location,
        p.device_type,
        p.device_name,
        p.device_model,
        p.cost_price,
        p.selling_price,
        COALESCE(i.qty_available, 0) AS quantity_available,
        (COALESCE(i.qty_available, 0) <= 2)            AS is_low_stock,
        (COALESCE(i.qty_available, 0) > 0)             AS is_available,
        COALESCE(i.available_imeis, ARRAY[]::text[])   AS available_imeis
      FROM products p
      JOIN users u
        ON p.dealer_id = u.id
      LEFT JOIN (
        SELECT
          product_id,
          COUNT(*) FILTER (WHERE status = 'available') AS qty_available,
          ARRAY_AGG(imei) FILTER (WHERE status = 'available') AS available_imeis
        FROM inventory_items
        GROUP BY product_id
      ) i
        ON p.id = i.product_id
      ORDER BY p.id DESC
    `);
    res.json({ products: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * listProducts
 * A simpler list for, e.g., dropdowns: no inventory details.
 */
async function listProducts(req, res, next) {
  try {
    const { rows } = await pool.query(`
      SELECT
        p.id,
        p.device_name,
        p.device_model,
        p.device_type,
        p.cost_price,
        p.selling_price,
        u.business_name   AS dealer_name,
        u.location        AS dealer_location
      FROM products p
      JOIN users u
        ON u.id = p.dealer_id
      ORDER BY p.device_name
    `);
    res.json({ products: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * updateProduct
 * Only MasterAdmin may update.
 * Adjusts fields and optionally adds new IMEIs.
 */
async function updateProduct(req, res, next) {
  const client = await pool.connect();
  try {
    const productId = req.params.id;
    const {
      device_type,
      device_name,
      device_model,
      cost_price,
      selling_price,
      newImeis, // array of 15-digit strings
    } = req.body;

    if (newImeis && (!Array.isArray(newImeis) || !newImeis.every(i => /^\d{15}$/.test(i)))) {
      return res.status(400).json({ message: "newImeis must be an array of 15-digit strings." });
    }

    await client.query('BEGIN');

    // 1) update product row
    const { rows } = await client.query(`
      UPDATE products
         SET device_type   = COALESCE($1, device_type),
             device_name   = COALESCE($2, device_name),
             device_model  = COALESCE($3, device_model),
             cost_price    = COALESCE($4, cost_price),
             selling_price = COALESCE($5, selling_price),
             updated_at    = NOW()
       WHERE id = $6
     RETURNING *`,
      [device_type, device_name, device_model, cost_price, selling_price, productId]
    );
    if (!rows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: "Product not found." });
    }
    const updatedProduct = rows[0];

    // 2) insert any new IMEIs
    if (newImeis?.length) {
      const ph = newImeis.map((_, i) => `($1, $${i+2}, 'available', NOW())`).join(',');
      await client.query(
        `INSERT INTO inventory_items (product_id, imei, status, created_at) VALUES ${ph}`,
        [productId, ...newImeis]
      );
    }

    await client.query('COMMIT');
    res.json({ message: "Product updated successfully.", product: updatedProduct });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

/**
 * deleteProduct
 * Only MasterAdmin may delete.
 * Refuses if any non-completed stock_updates exist.
 */
async function deleteProduct(req, res, next) {
  const productId = req.params.id;
  const client = await pool.connect();
  try {
    // ensure no live stock_updates
    const { rows: live } = await client.query(`
      SELECT 1 FROM stock_updates
       WHERE product_id = $1 AND status != 'completed'
      LIMIT 1`, [productId]);
    if (live.length) {
      return res.status(409).json({
        message: "Cannot delete product: there are active stock‐updates for it."
      });
    }

    await client.query('BEGIN');
    await client.query(`DELETE FROM stock_updates WHERE product_id = $1`, [productId]);
    await client.query(`DELETE FROM inventory_items WHERE product_id = $1`, [productId]);
    const { rows } = await client.query(`
      DELETE FROM products WHERE id = $1 RETURNING *`, [productId]);
    await client.query('COMMIT');

    if (!rows.length) {
      return res.status(404).json({ message: "Product not found." });
    }
    res.json({ message: "Product deleted successfully.", product: rows[0] });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

/**
 * getAllProducts
 * For SuperAdmin: full product list with profit & inventory details.
 */
async function getAllProducts(req, res, next) {
  try {
    const { rows } = await pool.query(`
      SELECT
        p.id,
        u.business_name       AS dealer_business_name,
        u.location            AS dealer_location,
        p.device_type,
        p.device_name,
        p.device_model,
        p.cost_price,
        p.selling_price,
        (p.selling_price - p.cost_price) AS profit,
        COALESCE(i.qty_available, 0)      AS qty_available,
        COALESCE(i.available_imeis, ARRAY[]::text[]) AS available_imeis
      FROM products p
      JOIN users u
        ON p.dealer_id = u.id
      LEFT JOIN (
        SELECT
          product_id,
          COUNT(*) FILTER (WHERE status = 'available')      AS qty_available,
          ARRAY_AGG(imei) FILTER (WHERE status = 'available') AS available_imeis
        FROM inventory_items
        GROUP BY product_id
      ) i
        ON p.id = i.product_id
      ORDER BY p.device_name, p.device_model
    `);
    res.json({ products: rows });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  addProduct,
  getProducts,
  listProducts,
  updateProduct,
  deleteProduct,
  getAllProducts,
};
