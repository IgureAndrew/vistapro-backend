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
const getProducts = async (req, res, next) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        p.id,
        p.dealer_id,
        u.business_name    AS dealer_name,       -- pull name from users
        p.device_type,
        p.device_name,
        p.device_model,
        p.cost_price,
        p.selling_price,

        -- stock flags
        COUNT(i.*) FILTER (WHERE i.status = 'available')   AS quantity_available,
        (COUNT(i.*) FILTER (WHERE i.status = 'available') <= 2) AS is_low_stock,
        (COUNT(i.*) FILTER (WHERE i.status = 'available') >  0) AS is_available,

        -- collect all IMEIs into an array
        ARRAY_AGG(i.imei) FILTER (WHERE i.status = 'available') AS available_imeis,

        p.created_at,
        p.updated_at
      FROM products p
      JOIN users u
        ON p.dealer_id = u.id
      LEFT JOIN inventory_items i
        ON i.product_id = p.id
      GROUP BY p.id, u.business_name
      ORDER BY p.created_at DESC
    `);

    res.status(200).json({ products: rows });
  } catch (err) {
    next(err);
  }
};

/**
 * deleteProduct
 * Only MasterAdmin may delete products.
 * Refuses if there are any non-completed stock_updates.
 * Otherwise: deletes stock_updates → inventory_items → product.
 */
async function deleteProduct(req, res, next) {
  const productId = req.params.id;

  try {
    // 1) Are there any live (non-completed) stock updates?
    const { rows: live } = await pool.query(
      `SELECT id
         FROM stock_updates
        WHERE product_id = $1
          AND status != 'completed'`,
      [productId]
    );
    if (live.length) {
      return res
        .status(409)
        .json({ message: "Cannot delete product: there are active stock‐updates for it." });
    }

    // 2) Safe to remove all stock_updates (they must all be completed)
    await pool.query(
      `DELETE FROM stock_updates
        WHERE product_id = $1`,
      [productId]
    );

    // 3) Remove any orphaned inventory_items
    await pool.query(
      `DELETE FROM inventory_items
        WHERE product_id = $1`,
      [productId]
    );

    // 4) Finally delete the product
    const { rows } = await pool.query(
      `DELETE FROM products
        WHERE id = $1
      RETURNING *`,
      [productId]
    );
    if (!rows.length) {
      return res.status(404).json({ message: "Product not found." });
    }

    res.json({ message: "Product deleted successfully.", product: rows[0] });
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
async function updateProduct(req, res, next) {
  try {
    const productId = req.params.id;
    const {
      device_type,
      device_name,
      device_model,
      cost_price,
      selling_price,
      newImeis,            // expecting an array of { imei: '15digit' }
    } = req.body;

    // Validate incoming IMEIs if provided
    if (newImeis && !Array.isArray(newImeis)) {
      return res.status(400).json({ message: "newImeis must be an array of strings." });
    }
    if (newImeis && !newImeis.every(i => /^[0-9]{15}$/.test(i))) {
      return res.status(400).json({ message: "Each IMEI must be a 15-digit string." });
    }

    // 1) Update the product row
    const { rows } = await pool.query(
      `
      UPDATE products
         SET device_type   = COALESCE($1, device_type),
             device_name   = COALESCE($2, device_name),
             device_model  = COALESCE($3, device_model),
             cost_price    = COALESCE($4, cost_price),
             selling_price = COALESCE($5, selling_price),
             updated_at    = NOW()
       WHERE id = $6
     RETURNING *;
      `,
      [
        device_type,
        device_name,
        device_model,
        cost_price,
        selling_price,
        productId,
      ]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "Product not found." });
    }
    const updatedProduct = rows[0];

    // 2) If there are new IMEIs to add, insert them into inventory_items
    if (newImeis && newImeis.length > 0) {
      // build ($1, $2, 'available', NOW()), ($1, $3, 'available', NOW()), …
      const placeholders = newImeis
        .map((_, idx) => `($1, $${idx + 2}, 'available', NOW())`)
        .join(', ');
      await pool.query(
        `
        INSERT INTO inventory_items
          (product_id, imei, status, created_at)
        VALUES
          ${placeholders};
        `,
        [productId, ...newImeis]
      );
    }

    return res.json({
      message: "Product updated successfully.",
      product: updatedProduct
    });
  } catch (err) {
    next(err);
  }
}

async function listProducts(req, res, next) {
  try {
    const { rows } = await pool.query(`
      SELECT
        p.id,
        p.device_name,
        p.device_model,
        p.device_type,
        p.selling_price,
        COUNT(i.*) FILTER (WHERE i.status = 'available')       AS qty_available,
        ARRAY_AGG(i.imei) FILTER (WHERE i.status = 'available') AS imeis_available,
        u.business_name        AS dealer_business_name,
        u.location             AS dealer_location
      FROM products p
      LEFT JOIN inventory_items i
        ON i.product_id = p.id
      JOIN users u
        ON p.dealer_id = u.id            -- or however you link product → dealer
      GROUP BY p.id, u.business_name, u.location
    `);
    res.json({ products: rows });
  } catch (err) {
    next(err);
  }
}


module.exports = {
  addProduct,
  getProducts,
  updateProduct,
  deleteProduct,
  listProducts 
};
