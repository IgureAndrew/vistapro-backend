// src/controllers/stockupdateController.js
const { pool } = require('../config/database');

/**
 * 1) createStockUpdate
 *    Marketer picks up stock → decrements product_quantity, creates a pending record.
 *    Deadline is 48 hrs from pickup.
 */
async function createStockUpdate(req, res, next) {
  try {
    const { product_id, quantity } = req.body;
    const marketerUID = req.user.unique_id;
    if (!product_id) {
      return res.status(400).json({ message: "Missing product_id" });
    }
    const qty = parseInt(quantity, 10) || 1;

    // check available
    const stockQ = await pool.query(
      `SELECT COALESCE(product_quantity, 0) AS qty
     FROM products
    WHERE id = $1`,

      [product_id]
    );
    if (!stockQ.rowCount || stockQ.rows[0].product_quantity < qty) {
      return res.status(400).json({ message: "Not enough stock available" });
    }

    // decrement inventory
    await pool.query(
      `UPDATE products
         SET product_quantity = product_quantity - $1
       WHERE id = $2`,
      [qty, product_id]
    );

    // insert into stock_updates
    const { rows } = await pool.query(
      `INSERT INTO stock_updates
         ( marketer_id,
           product_id,
           quantity,
           pickup_date,
           deadline,
           status,
           transfer_status
         )
       VALUES (
         (SELECT id FROM users WHERE unique_id = $1),
         $2,
         $3,
         NOW(),
         NOW() + INTERVAL '48 hours',
         'pending',
         'none'
       )
       RETURNING *`,
      [marketerUID, product_id, qty]
    );
    const stock = rows[0];

    // notify assigned admin
    const adminQ = await pool.query(
      `SELECT admin_id FROM users WHERE unique_id = $1`,
      [marketerUID]
    );
    const adminId = adminQ.rows[0]?.admin_id;
    if (adminId) {
      await pool.query(
        `INSERT INTO notifications (user_id, message, created_at)
         VALUES ($1, $2, NOW())`,
        [
          adminId,
          `Marketer ${marketerUID} picked up ${qty} unit(s) of product #${product_id}.`
        ]
      );
    }

    res.status(201).json({
      message: "Stock pickup recorded successfully.",
      stock
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 2) placeOrder
 *    - If marketer has any live ('pending' & before deadline) pickups, must supply stock_update_id.
 *      that pickup → status='completed'.
 *    - Otherwise may free-order by product_id.
 */
async function placeOrder(req, res, next) {
  try {
    const uid = req.user.unique_id;

    // fetch live pending pickups
    const { rows: pending } = await pool.query(
      `SELECT id, product_id
         FROM stock_updates
        WHERE marketer_id = (SELECT id FROM users WHERE unique_id = $1)
          AND status = 'pending'
          AND deadline > NOW()`,
      [uid]
    );

    let productId;
    let stockUpdateId = null;

    if (pending.length > 0) {
      stockUpdateId = req.body.stock_update_id;
      if (!stockUpdateId) {
        return res.status(400).json({
          message: "You have held stock—please supply stock_update_id to sell it."
        });
      }
      const pick = pending.find(p => p.id === +stockUpdateId);
      if (!pick) {
        return res.status(403).json({ message: "Invalid or expired pickup selected." });
      }
      productId = pick.product_id;
    } else {
      productId = req.body.product_id;
      if (!productId) {
        return res.status(400).json({
          message: "No held stock—please supply product_id to place a free order."
        });
      }
    }

    // insert order
    const marketerId = (await pool.query(
      `SELECT id FROM users WHERE unique_id = $1`, [uid]
    )).rows[0].id;

    const orderQ = await pool.query(
      `INSERT INTO orders
         ( marketer_id,
           product_id,
           stock_update_id,
           order_date
         )
       VALUES
         ($1, $2, $3, NOW())
       RETURNING *`,
      [marketerId, productId, stockUpdateId]
    );

    // mark pickup consumed
    if (stockUpdateId) {
      await pool.query(
        `UPDATE stock_updates
           SET status = 'completed'
         WHERE id = $1`,
        [stockUpdateId]
      );
    }

    res.status(201).json({
      message: "Order placed successfully.",
      order: orderQ.rows[0]
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 3) requestStockTransfer
 *    Marketer requests to move one of their own 'pending' pickups to another marketer.
 */
async function requestStockTransfer(req, res, next) {
  try {
    const id = req.params.id;           // stock_updates.id
    const { targetUniqueId } = req.body;
    const myUID = req.user.unique_id;

    // verify record
    const meQ = await pool.query(
      `SELECT marketer_id, transfer_status
         FROM stock_updates
        WHERE id = $1`,
      [id]
    );
    if (!meQ.rowCount) {
      return res.status(404).json({ message: "Pickup not found." });
    }
    if (meQ.rows[0].transfer_status !== 'none') {
      return res.status(400).json({ message: "Transfer already in progress." });
    }

    // resolve target marketer
    const tgtQ = await pool.query(
      `SELECT id, state_of_residence
         FROM users
        WHERE unique_id = $1`,
      [targetUniqueId]
    );
    if (!tgtQ.rowCount) {
      return res.status(404).json({ message: "Target marketer not found." });
    }
    // require same location
    if (tgtQ.rows[0].state_of_residence !== req.user.state_of_residence) {
      return res.status(400).json({ message: "Transfers must stay within same location." });
    }

    // record request
    await pool.query(
      `UPDATE stock_updates
         SET transfer_to_marketer_id  = $1,
             transfer_status          = 'pending',
             transfer_requested_at    = NOW()
       WHERE id = $2`,
      [tgtQ.rows[0].id, id]
    );

    res.json({ message: "Transfer request submitted." });
  } catch (err) {
    next(err);
  }
}

/**
 * 4) approveStockTransfer
 *    MasterAdmin approves or rejects pending transfers.
 */
async function approveStockTransfer(req, res, next) {
  try {
    if (req.user.role !== 'MasterAdmin') {
      return res.status(403).json({ message: "Only MasterAdmin may approve or reject." });
    }
    const id = req.params.id;
    const { action } = req.body; // 'approve' or 'reject'
    if (!['approve','reject'].includes(action)) {
      return res.status(400).json({ message: "Invalid action." });
    }

    let q, params;
    if (action === 'approve') {
      q = `
        UPDATE stock_updates
           SET marketer_id             = transfer_to_marketer_id,
               transfer_status         = 'approved',
               transfer_approved_at    = NOW()
         WHERE id = $1
         RETURNING *`;
    } else {
      q = `
        UPDATE stock_updates
           SET transfer_status = 'rejected'
         WHERE id = $1
         RETURNING *`;
    }
    params = [id];

    const { rows } = await pool.query(q, params);
    if (!rows.length) {
      return res.status(404).json({ message: "Transfer record not found." });
    }
    res.json({
      message: `Transfer ${action}d successfully.`,
      stock: rows[0]
    });
  } catch (err) {
    next(err);
  }
}

/**
 * 5) getMarketerStockUpdates
 *    List this marketer’s pickups (with countdown if needed).
 */
async function getMarketerStockUpdates(req, res, next) {
  try {
    const uid = req.user.unique_id;
    const { rows } = await pool.query(
      `SELECT su.*,
              p.device_name,
              p.device_model,
              p.dealer_business_name
         FROM stock_updates AS su
         JOIN products AS p
           ON su.product_id = p.id
        WHERE su.marketer_id = (SELECT id FROM users WHERE unique_id = $1)
        ORDER BY su.pickup_date DESC`,
      [uid]
    );
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * 6) getStockUpdates
 *    Master/Admin/SuperAdmin can see all or filtered pickups.
 */
async function getStockUpdates(req, res, next) {
  // ... implement same role‐based logic as before, but always join products & users ...
  next(); // placeholder
}

module.exports = {
  createStockUpdate,
  placeOrder,
  requestStockTransfer,
  approveStockTransfer,
  getMarketerStockUpdates,
  getStockUpdates,
};
