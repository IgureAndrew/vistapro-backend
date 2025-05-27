// src/controllers/productController.js
const { pool } = require('../config/database');

/**
 * addProduct
 * - Inserts the product record only; IMEIs are not handled here.
 */
async function addProduct(req, res, next) {
  const {
    dealer_id,
    device_type,
    device_name,
    device_model,
    cost_price,
    selling_price,
    quantity_to_add    // ← optional initial stock count
  } = req.body;

  // 1) Validate required fields
  if (
    !dealer_id ||
    !device_type ||
    !device_name ||
    !device_model ||
    cost_price == null ||
    selling_price == null
  ) {
    return res.status(400).json({ message: "Missing required product fields." });
  }

  const client = await pool.connect();
  try {
    // 2) Start transaction
    await client.query('BEGIN');

    // 3) Verify dealer exists
    const { rows: dealerCheck } = await client.query(
      'SELECT 1 FROM users WHERE id = $1',
      [dealer_id]
    );
    if (!dealerCheck.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: "Dealer not found." });
    }

    // 4) Insert product
    const insertProductSql = `
      INSERT INTO products (
        dealer_id, device_type, device_name, device_model,
        cost_price, selling_price, created_at
      ) VALUES ($1,$2,$3,$4,$5,$6,NOW())
      RETURNING *
    `;
    const { rows: [product] } = await client.query(
      insertProductSql,
      [
        dealer_id,
        device_type,
        device_name,
        device_model,
        cost_price,
        selling_price
      ]
    );

    // 5) Bulk-insert initial stock items (no IMEI)
    const toAdd = parseInt(quantity_to_add, 10) || 0;
    if (toAdd > 0) {
      await client.query(`
        INSERT INTO inventory_items (product_id, status, created_at)
        SELECT $1, 'available', NOW()
          FROM generate_series(1, $2)
      `, [product.id, toAdd]);
    }

    // 6) Commit transaction
    await client.query('COMMIT');

    // 7) Compute quantity_available
    const { rows: countRows } = await client.query(`
      SELECT COUNT(*)::int AS quantity_available
        FROM inventory_items
       WHERE product_id = $1
         AND status     = 'available'
    `, [product.id]);

    // 8) Return success
    res.status(201).json({
      message: `Product added successfully.${toAdd > 0 ? ` Added ${toAdd} unit${toAdd !== 1 ? 's' : ''} to stock.` : ''}`,
      product: {
        ...product,
        quantity_available: countRows[0].quantity_available
      }
    });
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
 * Includes dealer info, qty_available, is_low_stock, is_available.
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
        (COALESCE(i.qty_available, 0) <= 2) AS is_low_stock,
        (COALESCE(i.qty_available, 0) > 0) AS is_available
      FROM products p
      JOIN users u
        ON p.dealer_id = u.id
      LEFT JOIN (
        SELECT
          product_id,
          COUNT(*) FILTER (WHERE status = 'available') AS qty_available
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
 * A simpler list for dropdowns: no inventory details.
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
        u.business_name AS dealer_name,
        u.location      AS dealer_location
      FROM products p
      JOIN users u ON u.id = p.dealer_id
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
 * Adjusts product fields; if `quantity_to_add` is passed and > 0,
 * inserts that many new inventory_items (no IMEI).
 */
async function updateProduct(req, res, next) {
  const client = await pool.connect();
  try {
    const productId = parseInt(req.params.id, 10);
    if (!Number.isInteger(productId)) {
      return res.status(400).json({ message: "Invalid product ID." });
    }

    // pull fields from body
    const {
      device_type,
      device_name,
      device_model,
      cost_price,
      selling_price,
      quantity_to_add    // ← optional: positive to add, negative to remove
    } = req.body;

    await client.query("BEGIN");

    // 1) Update product metadata
    const { rows: prodRows } = await client.query(`
      UPDATE products
         SET device_type   = COALESCE($1, device_type),
             device_name   = COALESCE($2, device_name),
             device_model  = COALESCE($3, device_model),
             cost_price    = COALESCE($4, cost_price),
             selling_price = COALESCE($5, selling_price),
             updated_at    = NOW()
       WHERE id = $6
     RETURNING *
    `, [
      device_type,
      device_name,
      device_model,
      cost_price,
      selling_price,
      productId
    ]);

    if (!prodRows.length) {
      await client.query("ROLLBACK");
      return res.status(404).json({ message: "Product not found." });
    }

    // 2) Bulk-insert or remove stock without IMEI
    const toAdd = parseInt(quantity_to_add, 10) || 0;
    if (toAdd > 0) {
      // insert `toAdd` new available items
      await client.query(`
        INSERT INTO inventory_items (product_id, status, created_at)
        SELECT $1, 'available', NOW()
          FROM generate_series(1, $2)
      `, [ productId, toAdd ]);
    } else if (toAdd < 0) {
      // remove |toAdd| oldest available items
      const removeCount = -toAdd;
      const { rows: toRemove } = await client.query(`
        SELECT id
          FROM inventory_items
         WHERE product_id = $1
           AND status     = 'available'
         ORDER BY created_at ASC
         LIMIT $2
         FOR UPDATE SKIP LOCKED
      `, [ productId, removeCount ]);

      if (toRemove.length) {
        const ids = toRemove.map(r => r.id);
        await client.query(`
          DELETE FROM inventory_items
           WHERE id = ANY($1)
        `, [ids]);
      }
    }

    await client.query("COMMIT");

    // 3) Recompute available quantity
    const { rows: countRows } = await client.query(`
      SELECT COUNT(*)::int AS quantity_available
        FROM inventory_items
       WHERE product_id = $1
         AND status     = 'available'
    `, [productId]);

    const updatedProduct = {
      ...prodRows[0],
      quantity_available: countRows[0].quantity_available
    };

    // 4) Return success
    res.json({
      message: `Product updated successfully.${toAdd > 0 ? ` Added ${toAdd} unit${toAdd !== 1 ? 's' : ''} to stock.` : toAdd < 0 ? ` Removed ${-toAdd} unit${toAdd !== -1 ? 's' : ''} from stock.` : ''}`,
      product: updatedProduct
    });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
  }
}

/**
 * deleteProduct
 * Deletes a product and any related inventory (foreign key cascade assumed).
 */
async function deleteProduct(req, res, next) {
  const productId = req.params.id;
  const client    = await pool.connect();

  try {
    await client.query('BEGIN');
    const { rows } = await client.query(
      `DELETE FROM products WHERE id = $1 RETURNING *`,
      [productId]
    );
    await client.query('COMMIT');

    if (!rows.length) {
      return res.status(404).json({ message: 'Product not found.' });
    }
    res.json({ message: 'Product deleted successfully.', product: rows[0] });
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
        COALESCE(i.qty_available, 0)      AS qty_available
      FROM products p
      JOIN users u ON p.dealer_id = u.id
      LEFT JOIN (
        SELECT
          product_id,
          COUNT(*) FILTER (WHERE status = 'available') AS qty_available
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
