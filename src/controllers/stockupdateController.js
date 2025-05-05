// src/controllers/stockupdateController.js
const { pool } = require('../config/database');

/**
 * GET /api/marketer/stock-pickup/dealers
 * Returns all dealers in the logged-in marketer’s state.
 */
async function listStockPickupDealers(req, res, next) {
  try {
    const marketerId = req.user.id;
    const { rows: me } = await pool.query(
      `SELECT location FROM users WHERE id = $1`,
      [marketerId]
    );
    if (!me.length) {
      return res.status(404).json({ message: "Marketer not found." });
    }
    const state = me[0].location;

    const { rows: dealers } = await pool.query(
      `SELECT unique_id, business_name, location
         FROM users
        WHERE role = 'Dealer'
          AND location = $1
        ORDER BY business_name`,
      [state]
    );

    res.json({ dealers });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/marketer/stock-pickup/dealers/:dealerUniqueId/products
 * Returns all available products for that dealer (same state only).
 */
async function listStockProductsByDealer(req, res, next) {
  try {
    const marketerId = req.user.id;
    const { dealerUniqueId } = req.params;

    const { rows: me } = await pool.query(
      `SELECT location FROM users WHERE id = $1`,
      [marketerId]
    );
    if (!me.length) {
      return res.status(404).json({ message: "Marketer not found." });
    }
    const state = me[0].location;

    const { rows: dq } = await pool.query(
      `SELECT id FROM users
         WHERE unique_id = $1
           AND role      = 'Dealer'
           AND location  = $2`,
      [dealerUniqueId, state]
    );
    if (!dq.length) {
      return res.status(403).json({ message: "Dealer not in your location." });
    }
    const dealerId = dq[0].id;

    const { rows: products } = await pool.query(
      `SELECT
         p.id               AS product_id,
         p.device_name,
         p.device_model,
         p.device_type,
         p.selling_price,
         COUNT(i.*) FILTER (WHERE i.status = 'available')        AS qty_available,
         ARRAY_AGG(i.imei) FILTER (WHERE i.status = 'available') AS imeis_available
       FROM products p
       JOIN inventory_items i
         ON i.product_id = p.id
        AND i.status     = 'available'
      WHERE p.dealer_id = $1
      GROUP BY p.id, p.device_name, p.device_model, p.device_type, p.selling_price
      HAVING COUNT(i.*) FILTER (WHERE i.status = 'available') > 0`,
      [dealerId]
    );

    res.json({ products });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/marketer/stock-pickup
 * Create a new stock pickup (status = 'pending', reserves inventory_items).
 */
async function createStockUpdate(req, res, next) {
  const client = await pool.connect();
  try {
    const { product_id, quantity } = req.body;
    const marketerUID = req.user.unique_id;
    const qty = parseInt(quantity, 10) || 1;
    if (!product_id) {
      return res.status(400).json({ message: "Missing product_id" });
    }

    await client.query('BEGIN');

    // a) verify marketer’s location
    const { rows: me } = await client.query(
      `SELECT location FROM users WHERE unique_id = $1`,
      [marketerUID]
    );
    if (!me.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: "Marketer not found." });
    }
    const marketerState = me[0].location;

    // b) verify dealer’s location
    const { rows: pd } = await client.query(
      `SELECT u.location
         FROM products p
         JOIN users u ON p.dealer_id = u.id
        WHERE p.id = $1`,
      [product_id]
    );
    if (!pd.length || pd[0].location !== marketerState) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        message: "Cannot pick up from a dealer outside your location."
      });
    }

    // check available inventory
    const { rows: cnt } = await client.query(
      `SELECT COUNT(*)::int AS cnt
         FROM inventory_items
        WHERE product_id = $1
          AND status = 'available'`,
      [product_id]
    );
    if (cnt[0].cnt < qty) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: "Not enough stock available" });
    }

    // insert pickup record using unified `status`
    const { rows: su } = await client.query(
      `INSERT INTO stock_updates
         (marketer_id, product_id, quantity, pickup_date, deadline, status)
       VALUES (
         (SELECT id FROM users WHERE unique_id = $1),
         $2, $3,
         NOW(),
         NOW() + INTERVAL '48 hours',
         'pending'
       )
       RETURNING id, marketer_id, product_id, quantity, pickup_date, deadline, status`,
      [marketerUID, product_id, qty]
    );
    const stock = su[0];

    // reserve exactly qty items
    const { rows: toReserve } = await client.query(
      `SELECT id
         FROM inventory_items
        WHERE product_id = $1
          AND status     = 'available'
        LIMIT $2
        FOR UPDATE SKIP LOCKED`,
      [product_id, qty]
    );
    const ids = toReserve.map(r => r.id);
    await client.query(
      `UPDATE inventory_items
         SET status = 'reserved',
             stock_update_id = $1
       WHERE id = ANY($2::int[])`,
      [stock.id, ids]
    );

    // notify admin
    const { rows: adminQ } = await client.query(
      `SELECT u2.unique_id
         FROM users u
         JOIN users u2 ON u.admin_id = u2.id
        WHERE u.unique_id = $1`,
      [marketerUID]
    );
    if (adminQ.length) {
      await client.query(
        `INSERT INTO notifications (user_unique_id, message, created_at)
         VALUES ($1, $2, NOW())`,
        [
          adminQ[0].unique_id,
          `Marketer ${marketerUID} picked up ${qty} unit(s) of product ${product_id}.`
        ]
      );
    }

    await client.query('COMMIT');
    res.status(201).json({
      message: "Stock pickup recorded successfully.",
      stock
    });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
}

/**
 * POST /api/marketer/stock-pickup/order
 * Place an order, preferring a pending pickup over free mode.
 */
async function placeOrder(req, res, next) {
  try {
    const uid = req.user.unique_id;

    // fetch truly pending pickups (status = 'pending')
    const { rows: pending } = await pool.query(
      `SELECT id, product_id
         FROM stock_updates
        WHERE marketer_id = (SELECT id FROM users WHERE unique_id = $1)
          AND status        = 'pending'
          AND deadline > NOW()`,
      [uid]
    );

    let productId, stockUpdateId = null;
    if (pending.length) {
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

    const marketerId = (await pool.query(
      `SELECT id FROM users WHERE unique_id = $1`, [uid]
    )).rows[0].id;

    const { rows: orderRows } = await pool.query(
      `INSERT INTO orders
         (marketer_id, product_id, stock_update_id, order_date)
       VALUES ($1,$2,$3,NOW())
       RETURNING *`,
      [marketerId, productId, stockUpdateId]
    );

    // if used a pickup, mark it sold when no more reserved items
    if (stockUpdateId) {
      await pool.query(
        `UPDATE stock_updates
           SET status = 'sold'
         WHERE id = $1
           AND NOT EXISTS (
             SELECT 1 FROM inventory_items
              WHERE stock_update_id = $1
                AND status = 'reserved'
           )`,
        [stockUpdateId]
      );
    }

    res.status(201).json({
      message: "Order placed successfully.",
      order: orderRows[0]
    });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/marketer/stock-pickup/:id/transfer
 * Request a transfer – only if status = 'pending'
 */
/**
 * 3) requestStockTransfer
 *    Marketer requests to move one of their own 'pending' pickups to another marketer.
 */
async function requestStockTransfer(req, res, next) {
  try {
    const stockUpdateId     = parseInt(req.params.id, 10);
    const { targetIdentifier } = req.body;        // unique_id or "First Last"
    const currentMarketerId = req.user.id;

    // 1) Verify this pickup exists, belongs to current user, and is still pending
    const { rows: suRows } = await pool.query(`
      SELECT marketer_id, status
        FROM stock_updates
       WHERE id = $1
    `, [stockUpdateId]);
    if (!suRows.length) {
      return res.status(404).json({ message: "Stock pickup not found." });
    }
    const su = suRows[0];
    if (su.marketer_id !== currentMarketerId) {
      return res.status(403).json({ message: "Not your stock pickup." });
    }
    if (su.status !== 'pending') {
      return res.status(400).json({ message: "Only pending pickups can be transferred." });
    }

    // 2) Resolve the target marketer
    const { rows: tgtRows } = await pool.query(`
      SELECT id, unique_id, first_name, last_name, location
        FROM users
       WHERE role = 'Marketer'
         AND (
           unique_id = $1
        OR (first_name || ' ' || last_name) ILIKE $1
         )
    `, [targetIdentifier]);
    if (!tgtRows.length) {
      return res.status(404).json({ message: "Target marketer not found." });
    }
    const target = tgtRows[0];

    // 3) Ensure they’re in the same location
    const { rows: meRows } = await pool.query(`
      SELECT location
        FROM users
       WHERE id = $1
    `, [currentMarketerId]);
    const myLoc = meRows[0].location;
    if (target.location !== myLoc) {
      return res.status(400).json({ message: "Transfers must stay within the same location." });
    }

    // 4) Ensure target has no live pickups
    const { rows: active } = await pool.query(`
      SELECT 1
        FROM stock_updates
       WHERE marketer_id = $1
         AND status IN ('pending','transfer_pending')
       LIMIT 1
    `, [ target.id ]);
    if (active.length) {
      return res.status(400).json({
        message: "Target marketer already has an active pickup—cannot transfer."
      });
    }

    // 5) Mark this pickup as transfer_pending
    await pool.query(`
      UPDATE stock_updates
         SET status          = 'transfer_pending',
             transfer_to_marketer_id = $1,
             updated_at       = NOW()
       WHERE id = $2
    `, [ target.id, stockUpdateId ]);

    res.json({
      message: "Transfer requested.",
      transfer: {
        stock_update_id: stockUpdateId,
        to: {
          unique_id: target.unique_id,
          name:      `${target.first_name} ${target.last_name}`,
          location:  target.location
        },
        status: 'transfer_pending'
      }
    });
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
    const id = parseInt(req.params.id, 10);
    const { action } = req.body; // 'approve' or 'reject'
    if (!['approve','reject'].includes(action)) {
      return res.status(400).json({ message: "Invalid action." });
    }

    let result;
    if (action === 'approve') {
      // FINALIZE transfer: mark as 'transfer_approved' (a terminal state)
      const { rows } = await pool.query(`
        UPDATE stock_updates
           SET marketer_id      = transfer_to_marketer_id,
               transfer_to_marketer_id = NULL,
               status           = 'transfer_approved',
               transfer_approved_at   = NOW(),
               updated_at       = NOW()
         WHERE id = $1
         RETURNING *
      `, [id]);
      result = rows;
    } else {
      // reject transfer: back to 'pending'
      const { rows } = await pool.query(`
        UPDATE stock_updates
           SET transfer_to_marketer_id = NULL,
               status           = 'pending',
               updated_at       = NOW()
         WHERE id = $1
         RETURNING *
      `, [id]);
      result = rows;
    }

    if (!result.length) {
      return res.status(404).json({ message: "Transfer record not found." });
    }
    res.json({
      message: `Transfer ${action}d successfully.`,
      stock: result[0]
    });
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/marketer/stock-pickup/marketer
 * List this marketer’s pickups.
 */
async function getMarketerStockUpdates(req, res, next) {
  try {
    const uid = req.user.unique_id;
    const { rows } = await pool.query(
      `SELECT
         su.id, su.product_id, su.quantity,
         su.pickup_date, su.deadline, su.status,
         p.device_name, p.device_model
       FROM stock_updates su
       JOIN products p
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
 * GET /api/marketer/stock-pickup
 * (Master/Admin) list all pickups.
 */
async function getStockUpdates(req, res, next) {
  try {
    const { rows } = await pool.query(`
      SELECT
        su.id,
        p.device_name,
        p.device_model,
        d.business_name   AS dealer_name,
        d.location        AS dealer_location,
        su.quantity,
        su.pickup_date,
        su.deadline,
        su.status,
        su.transfer_requested_at,
        su.transfer_approved_at,
        su.returned_at,
        m.first_name || ' ' || m.last_name AS marketer_name,
        m.unique_id                       AS marketer_unique_id,
        tgt.first_name || ' ' || tgt.last_name AS transfer_to_name,
        tgt.unique_id                           AS transfer_to_uid
      FROM stock_updates su
      JOIN products p    ON p.id = su.product_id
      JOIN users d       ON d.id = p.dealer_id
      JOIN users m       ON m.id = su.marketer_id
      LEFT JOIN users tgt ON tgt.id = su.transfer_to_marketer_id
      ORDER BY su.pickup_date DESC
    `);
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/marketer/stock-pickup/:id/return
 * Mark a pickup as returned (MasterAdmin only).
 */
async function confirmReturn(req, res, next) {
  try {
    if (req.user.role !== 'MasterAdmin') {
      return res.status(403).json({ message: "Only MasterAdmin may confirm returns." });
    }
    const id = parseInt(req.params.id, 10);
    const { rows } = await pool.query(
      `UPDATE stock_updates
         SET status = 'returned',
             returned_at = NOW()
       WHERE id = $1
      RETURNING *`,
      [id]
    );
    if (!rows.length) {
      return res.status(404).json({ message: "Pickup not found." });
    }
    res.json({ message: "Return confirmed.", stock: rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/marketer/stock-pickup/:id/transfer
 * MasterAdmin only: approve or reject a pending transfer
 */
async function reviewStockTransfer(req, res, next) {
  try {
    if (req.user.role !== 'MasterAdmin') {
      return res.status(403).json({ message: "Only MasterAdmin may approve or reject transfers." });
    }

    const transferId = Number(req.params.id);
    const { action } = req.body; // 'approve' or 'reject'
    if (!['approve','reject'].includes(action)) {
      return res.status(400).json({ message: "Invalid action. Must be 'approve' or 'reject'." });
    }

    let query, params = [transferId];

    if (action === 'approve') {
      // move the stock to the new marketer, mark transfer approved
      query = `
        UPDATE stock_updates
           SET marketer_id             = transfer_to_marketer_id,
               transfer_to_marketer_id = NULL,
               status                   = 'transfer_approved',
               transfer_approved_at    = NOW(),
               updated_at              = NOW()
         WHERE id = $1
         RETURNING *
      `;
    } else {
      // clear the pending transfer, mark transfer rejected
      query = `
        UPDATE stock_updates
           SET transfer_to_marketer_id = NULL,
               status                   = 'transfer_rejected',
               updated_at              = NOW()
         WHERE id = $1
         RETURNING *
      `;
    }

    const { rows } = await pool.query(query, params);
    if (!rows.length) {
      return res.status(404).json({ message: "Transfer record not found." });
    }

    return res.json({
      message: `Transfer ${action}d successfully.`,
      stock: rows[0]
    });
  } catch (err) {
    next(err);
  }
}
module.exports = {
  listStockPickupDealers,
  listStockProductsByDealer,
  createStockUpdate,
  placeOrder,
  requestStockTransfer,
  approveStockTransfer,
  getMarketerStockUpdates,
  getStockUpdates,
  confirmReturn,
  reviewStockTransfer,
};
