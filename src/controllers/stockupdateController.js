// src/controllers/stockupdateController.js
const { pool } = require('../config/database');

/**
 * GET /api/marketer/stock-pickup/dealers
 * Returns all dealers in the logged-in marketer’s state.
 */
async function listStockPickupDealers(req, res, next) {
  try {
    // 1) Fetch marketer’s state
    const marketerId = req.user.id;
    const { rows: meRows } = await pool.query(
      `SELECT location FROM users WHERE id = $1`,
      [marketerId]
    );
    if (!meRows.length) {
      return res.status(404).json({ message: "Marketer not found." });
    }
    const state = meRows[0].location;

    // 2) Return all dealers in that state
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
 * Returns all available products for that dealer,
 * only if the dealer is in the same state as the marketer.
 */
async function listStockProductsByDealer(req, res, next) {
  try {
    const marketerId     = req.user.id;
    const { dealerUniqueId } = req.params;

    // 1) Fetch marketer’s state
    const { rows: meRows } = await pool.query(
      `SELECT location FROM users WHERE id = $1`,
      [marketerId]
    );
    if (!meRows.length) {
      return res.status(404).json({ message: "Marketer not found." });
    }
    const state = meRows[0].location;

    // 2) Verify dealer is in same state
    const { rows: dqRows } = await pool.query(
      `SELECT id
         FROM users
        WHERE unique_id = $1
          AND role      = 'Dealer'
          AND location  = $2`,
      [dealerUniqueId, state]
    );
    if (!dqRows.length) {
      return res.status(403).json({ message: "Dealer not in your location." });
    }
    const dealerId = dqRows[0].id;

    // 3) Fetch available products
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
      GROUP BY
         p.id, p.device_name, p.device_model, p.device_type, p.selling_price
      HAVING COUNT(i.*) FILTER (WHERE i.status = 'available') > 0`,
      [dealerId]
    );

    res.json({ products });
  } catch (err) {
    next(err);
  }
}

/**
 * 1) createStockUpdate
 *    Marketer picks up stock → creates a pending record.
 *    Only from dealers in the same state as the marketer.
 *    Deadline is 48 hrs from pickup.
 */
const createStockUpdate = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const { product_id, quantity } = req.body;
    const marketerUID = req.user.unique_id;
    if (!product_id) {
      return res.status(400).json({ message: "Missing product_id" });
    }
    const qty = parseInt(quantity, 10) || 1;

    await client.query('BEGIN');

    // --- Verify same-location constraint ---
    // a) marketer's state
    const { rows: meRows } = await client.query(
      `SELECT location FROM users WHERE unique_id = $1`,
      [marketerUID]
    );
    if (!meRows.length) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: "Marketer not found." });
    }
    const marketerState = meRows[0].location;

    // b) product's dealer & its state
    const { rows: pdRows } = await client.query(
      `SELECT u.location
         FROM products p
         JOIN users u ON p.dealer_id = u.id
        WHERE p.id = $1`,
      [product_id]
    );
    if (!pdRows.length || pdRows[0].location !== marketerState) {
      await client.query('ROLLBACK');
      return res.status(403).json({
        message: "Cannot pick up from a dealer outside your location."
      });
    }
    // -----------------------------------------

    // 1) count available items
    const { rows: cntRows } = await client.query(
      `SELECT COUNT(*)::int AS cnt
         FROM inventory_items
        WHERE product_id = $1
          AND status = 'available'`,
      [product_id]
    );
    const cnt = cntRows[0].cnt;
    if (cnt < qty) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: "Not enough stock available" });
    }

    // 2) insert pickup record
    const insertQ = `
      INSERT INTO stock_updates
        ( marketer_id, product_id, quantity, pickup_date, deadline, transfer_status )
      VALUES (
        (SELECT id FROM users WHERE unique_id = $1),
         $2, $3,
         NOW(),
         NOW() + INTERVAL '48 hours',
         'none'
      )
      RETURNING id, marketer_id, product_id, quantity, pickup_date, deadline, transfer_status
    `;
    const { rows: suRows } = await client.query(insertQ, [
      marketerUID,
      product_id,
      qty
    ]);
    const stock = suRows[0];

    // 3) reserve exactly `qty` units
    const { rows: itemsToReserve } = await client.query(
      `SELECT id
         FROM inventory_items
        WHERE product_id = $1
          AND status = 'available'
        LIMIT $2
        FOR UPDATE SKIP LOCKED`,
      [product_id, qty]
    );
    const itemIds = itemsToReserve.map(r => r.id);
    await client.query(
      `UPDATE inventory_items
          SET status = 'reserved',
              stock_update_id = $1
        WHERE id = ANY($2::int[])`,
      [stock.id, itemIds]
    );

    // 4) notify admin
    const { rows: adminQ } = await client.query(
      `SELECT u2.unique_id
         FROM users u
         JOIN users u2 ON u.admin_id = u2.id
        WHERE u.unique_id = $1`,
      [marketerUID]
    );
    const adminUniqueId = adminQ[0]?.unique_id;
    if (adminUniqueId) {
      await client.query(
        `INSERT INTO notifications (user_unique_id, message, created_at)
         VALUES ($1, $2, NOW())`,
        [
          adminUniqueId,
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
};

/**
 * 2) placeOrder
 *    - If marketer has any live ('pending' & before deadline) pickups, must supply stock_update_id.
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
// src/controllers/stockupdateController.js
async function requestStockTransfer(req, res, next) {
  try {
    const transferId       = parseInt(req.params.id, 10);
    const { targetIdentifier } = req.body; // either unique_id or full name
    const currentUID       = req.user.unique_id;

    // 1) Verify this pickup exists and is still transferrable
    const meQ = await pool.query(
      `SELECT marketer_id, transfer_status
         FROM stock_updates
        WHERE id = $1`,
      [transferId]
    );
    if (!meQ.rowCount) {
      return res.status(404).json({ message: "Pickup not found." });
    }
    if (meQ.rows[0].transfer_status !== "none") {
      return res.status(400).json({ message: "Transfer already in progress." });
    }

    // 2) Resolve target marketer by unique_id OR full name
    const tgtQ = await pool.query(
      `SELECT id, unique_id, first_name, last_name, location
         FROM users
        WHERE role = 'Marketer'
          AND (
            unique_id = $1
         OR (first_name || ' ' || last_name) ILIKE $1
          )`,
      [targetIdentifier]
    );
    if (!tgtQ.rowCount) {
      return res.status(404).json({ message: "Target marketer not found." });
    }
    const target = tgtQ.rows[0];

    // 3) Ensure same location
    const meLocQ = await pool.query(
      `SELECT location
         FROM users
        WHERE unique_id = $1`,
      [currentUID]
    );
    const myLocation = meLocQ.rows[0]?.location;
    if (target.location !== myLocation) {
      return res.status(400).json({
        message: "Transfers must stay within the same location.",
      });
    }

    // 4) Perform the transfer request
    await pool.query(
      `UPDATE stock_updates
         SET transfer_to_marketer_id = $1,
             transfer_status         = 'pending',
             transfer_requested_at   = NOW()
       WHERE id = $2`,
      [target.id, transferId]
    );

    // 5) Fetch enriched transfer details for response
    const detailQ = await pool.query(
      `SELECT
          p.device_name,
          p.device_type,
          -- source marketer
          su.marketer_id as from_id,
          m1.first_name || ' ' || m1.last_name AS from_name,
          m1.location AS from_location,
          -- target marketer
          t2.unique_id    AS to_unique_id,
          t2.first_name || ' ' || t2.last_name AS to_name,
          t2.location     AS to_location
        FROM stock_updates su
        JOIN products p       ON p.id    = su.product_id
        JOIN users m1         ON m1.id   = su.marketer_id
        JOIN users t2         ON t2.id   = su.transfer_to_marketer_id
       WHERE su.id = $1`,
      [transferId]
    );

    const d = detailQ.rows[0];
    return res.json({
      message: "Transfer request submitted.",
      transfer: {
        from: {
          name:     d.from_name,
          location: d.from_location,
        },
        to: {
          unique_id: d.to_unique_id,
          name:      d.to_name,
          location:  d.to_location,
        },
        device: {
          name: d.device_name,
          type: d.device_type,
        }
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
    const id = req.params.id;
    const { action } = req.body; // 'approve' or 'reject'
    if (!['approve','reject'].includes(action)) {
      return res.status(400).json({ message: "Invalid action." });
    }

    let q;
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

    const { rows } = await pool.query(q, [id]);
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
 *    List this marketer’s pickups.
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
 * 6) getStockUpdates – Master/Admin: list all pickups
 */
async function getStockUpdates(req, res, next) {
  try {
    const { rows } = await pool.query(`
      SELECT 
        su.id,
        p.device_name,
        p.device_model,
        d.business_name          AS dealer_name,
        d.location               AS dealer_location,
        su.quantity,
        su.pickup_date,
        su.deadline,
        su.status,
        su.transfer_status,
        m.first_name || ' ' || m.last_name AS marketer_name,
        m.unique_id                       AS marketer_unique_id,
        -- New fields for transfer target:
        tgt.first_name || ' ' || tgt.last_name AS transfer_to_name,
        tgt.unique_id                           AS transfer_to_uid
      FROM stock_updates su
      JOIN products p   ON p.id = su.product_id
      JOIN users   d    ON d.id = p.dealer_id
      JOIN users   m    ON m.id = su.marketer_id
      LEFT JOIN users tgt ON tgt.id = su.transfer_to_marketer_id
      ORDER BY su.pickup_date DESC
    `);

    return res.status(200).json({ data: rows });
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
};
