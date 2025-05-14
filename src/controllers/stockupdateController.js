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
/**
 * 1) createStockUpdate
 *    Marketer picks up stock → creates a pending record.
 *    Only from dealers in the same state as the marketer.
 *    Deadline is 48 hrs from pickup.
 *    Enforces one active pickup AND quantity=1.
 */
const createStockUpdate = async (req, res, next) => {
  const client = await pool.connect();
  try {
    const marketerUID = req.user.unique_id;

    // Enforce exactly one active pickup per marketer
    const { rows: active } = await client.query(
      `SELECT COUNT(*)::int AS cnt
         FROM stock_updates
        WHERE marketer_id = (SELECT id FROM users WHERE unique_id = $1)
          AND status IN ('pending','transfer_pending','transfer_approved')`,
      [marketerUID]
    );
    if (active[0].cnt > 0) {
      return res.status(400).json({
        message: "You already have an active pickup—complete, return or transfer it before requesting another."
      });
    }

    // Parse inputs
    const product_id = parseInt(req.body.product_id, 10);
    const qty        = 1;  // always one unit per pickup

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
    if (cntRows[0].cnt < qty) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: "Not enough stock available." });
    }

    // 2) insert pickup record
    const insertQ = `
      INSERT INTO stock_updates
        ( marketer_id, product_id, quantity, pickup_date, deadline, status )
      VALUES (
        (SELECT id FROM users WHERE unique_id = $1),
         $2, $3,
         NOW(),
         NOW() + INTERVAL '48 hours',
         'pending'
      )
      RETURNING id, product_id, quantity, pickup_date, deadline, status
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

    // 4) notify admin (unchanged)
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
          `Marketer ${marketerUID} picked up 1 unit of product ${product_id}.`
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
 * POST /api/marketer/stock-pickup/order
 * Place an order, preferring a pending pickup over free mode.
 */
async function placeOrder(req, res, next) {
  const marketerUID = req.user.unique_id;
  const { stock_update_id, product_id, number_of_devices, sold_amount,
          customer_name, customer_phone, customer_address, bnpl_platform } = req.body;

  try {
    // 3.1 Look for any “live” pickup you still hold
    const { rows: live } = await pool.query(
      `SELECT id, product_id
         FROM stock_updates
        WHERE marketer_id = (SELECT id FROM users WHERE unique_id = $1)
          AND status IN ('pending','transfer_pending','transfer_approved')
          AND deadline > NOW()`,
      [marketerUID]
    );

    let useStockId = null, useProductId;

    if (live.length) {
      // you have a live pickup → must use it
      if (!stock_update_id) {
        return res.status(400).json({
          message: "You have reserved stock—please supply stock_update_id to sell it."
        });
      }
      const pick = live.find(p => p.id === +stock_update_id);
      if (!pick) {
        return res.status(403).json({ message: "Invalid or expired pickup selected." });
      }
      useStockId   = pick.id;
      useProductId = pick.product_id;
    } else {
      // no pickup → free mode
      if (!product_id) {
        return res.status(400).json({
          message: "No held stock—please supply product_id to place a free order."
        });
      }
      useProductId = product_id;
    }

    // 3.2 Insert a “pending” order record
    const { rows: [order] } = await pool.query(`
      INSERT INTO orders (
        marketer_id,
        product_id,
        stock_update_id,
        number_of_devices,
        sold_amount,
        customer_name,
        customer_phone,
        customer_address,
        bnpl_platform,
        earnings_per_device,
        status,
        sale_date,
        created_at
      ) VALUES (
        (SELECT id FROM users WHERE unique_id = $1),
        $2, $3, $4, $5, $6, $7, $8, $9, 0,  -- earnings_per_device=0 until admin confirm
        'pending', NOW(), NOW()
      )
      RETURNING *`,
      [
        marketerUID,
        useProductId,
        useStockId,
        number_of_devices,
        sold_amount,
        customer_name,
        customer_phone,
        customer_address,
        bnpl_platform || null
      ]
    );

    res.status(201).json({
      message: "Order placed and awaiting confirmation.",
      order
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
    const marketerUid = req.user.unique_id;
    if (!marketerUid) {
      return res.status(400).json({ message: "Missing marketer unique_id" });
    }

    const sql = `
      SELECT
        su.id,
        su.product_id,
        su.quantity,
        su.pickup_date,
        su.deadline,
       -- return the real status, including 'return_pending' and 'returned'
        su.status AS status,
        p.device_name,
        p.device_model
      FROM stock_updates su
       JOIN users u
         ON su.marketer_id = u.id
       JOIN products p
         ON su.product_id = p.id
      WHERE u.unique_id = $1
      ORDER BY su.pickup_date DESC
    `;

    const { rows } = await pool.query(sql, [marketerUid]);
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}
/**
 * GET /api/marketer/stock-pickup
 * (Master/Admin) list all pickups.
 */
// src/controllers/stockupdateController.js

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
        -- proper comma above, now the CASE expression:
        CASE
          WHEN su.status = 'returned' THEN 'returned'
          WHEN EXISTS (
            SELECT 1
              FROM orders o
             WHERE o.stock_update_id = su.id
               AND o.status IN ('confirmed','released_confirmed')
          ) THEN 'sold'
          WHEN su.deadline < NOW() THEN 'expired'
          ELSE 'pending'
        END AS status,
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
      ORDER BY su.pickup_date DESC;
    `);

    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}


/**
 * PATCH /api/marketer/stock-pickup/:id/return
 * MasterAdmin confirms a return → status='returned', stop timer,
 * release any reserved IMEIs back to 'available', clear their stock_update_id.
 */
// PATCH /api/marketer/stock-pickup/:id/return
// src/controllers/stockupdateController.js

// src/controllers/stockupdateController.js

async function confirmReturn(req, res, next) {
  if (req.user.role !== 'MasterAdmin') {
    return res.status(403).json({ message: "Only MasterAdmin may confirm returns." });
  }

  const stockUpdateId = Number(req.params.id);
  if (!Number.isInteger(stockUpdateId)) {
    return res.status(400).json({ message: "Invalid pickup ID." });
  }

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) Lock the pending-return row and get product_id + quantity
    const { rows: [lockRow] } = await client.query(
      `SELECT product_id, quantity
         FROM stock_updates
        WHERE id = $1
          AND status = 'return_pending'
        FOR UPDATE`,
      [stockUpdateId]
    );
    if (!lockRow) {
      await client.query('ROLLBACK');
      return res.status(404).json({ message: "No pending return found." });
    }
    const { product_id, quantity } = lockRow;

    // 2) Mark the stock_update as returned
    const { rows: [pickup] } = await client.query(
      `UPDATE stock_updates
          SET status      = 'returned',
              returned_at = NOW(),
              updated_at  = NOW()
        WHERE id = $1
        RETURNING *`,
      [stockUpdateId]
    );

    // 3) Release any reserved IMEIs
    await client.query(
      `UPDATE inventory_items
          SET status          = 'available',
              stock_update_id = NULL
        WHERE stock_update_id = $1
          AND status = 'reserved'`,
      [stockUpdateId]
    );

    // 4) **Restock the product** by bumping the `quantity` column
    await client.query(
      `UPDATE products
          SET quantity   = quantity + $1,
              updated_at = NOW()
        WHERE id = $2`,
      [quantity, product_id]
    );

    // 5) Notify the marketer
    const { rows: [user] } = await client.query(
      `SELECT u.unique_id
         FROM users u
         JOIN stock_updates su ON su.marketer_id = u.id
        WHERE su.id = $1`,
      [stockUpdateId]
    );
    if (user?.unique_id) {
      await client.query(
        `INSERT INTO notifications (user_unique_id, message, created_at)
         VALUES ($1, $2, NOW())`,
        [
          user.unique_id,
          `Your stock pickup #${stockUpdateId} has been returned and restocked by MasterAdmin.`
        ]
      );
    }

    await client.query('COMMIT');
    res.json({
      message: "Return confirmed, reserved units released and product inventory restocked.",
      stock: pickup
    });

  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
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

/**
 * GET /api/superadmin/stock-updates
 * Returns *only* those stock‐pickups for marketers whose admin_id → super_admin_id  
 * matches the current super-admin’s unique_id. Includes deadline for countdown.
 */
async function listSuperAdminStockUpdates(req, res, next) {
  try {
    const superUid = req.user.unique_id;
    if (!superUid) {
      return res.status(400).json({ message: "SuperAdmin unique_id missing." });
    }

    const { rows } = await pool.query(`
      SELECT
        su.id,
        p.device_name,
        p.device_model,
        su.quantity,
        su.pickup_date,
        su.deadline,

        -- derive status
        CASE
          WHEN EXISTS (
            SELECT 1
            FROM orders o
            WHERE o.stock_update_id = su.id
              AND o.status IN ('confirmed','released_confirmed')
          ) THEN 'sold'
          WHEN su.deadline < NOW() THEN 'expired'
          ELSE 'pending'
        END AS status,

        m.unique_id                         AS marketer_unique_id,
        m.first_name || ' ' || m.last_name  AS marketer_name,
        a.unique_id                         AS admin_unique_id,
        a.first_name  || ' ' || a.last_name AS admin_name

      FROM stock_updates su
      JOIN products p ON p.id = su.product_id
      JOIN users m   ON m.id = su.marketer_id
      JOIN users a   ON a.id = m.admin_id
      JOIN users s   ON s.id = a.super_admin_id
      WHERE s.unique_id = $1
      ORDER BY su.pickup_date DESC
    `, [superUid]);

    // Match your frontend’s expectation: { data: rows }
    return res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}


async function getStockUpdatesForAdmin(req, res, next) {
  try {
    const adminId = req.user.id;
    const { rows } = await pool.query(`
      SELECT
        su.id,
        m.first_name || ' ' || m.last_name AS marketer_name,
        p.device_name,
        p.device_model,
        su.quantity,
        su.pickup_date,
        su.deadline,
        -- first check the real status column:
        CASE
          WHEN su.status = 'returned' THEN 'returned'
          WHEN EXISTS (
            SELECT 1
              FROM orders o
             WHERE o.stock_update_id = su.id
               AND o.status IN ('confirmed','released_confirmed')
          ) THEN 'sold'
          WHEN su.deadline < NOW() THEN 'expired'
          ELSE 'pending'
        END AS status
      FROM stock_updates su
      JOIN users m    ON su.marketer_id = m.id
      JOIN products p ON su.product_id  = p.id
     WHERE m.admin_id = $1
     ORDER BY su.pickup_date DESC;
    `, [adminId]);

    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
}



// PATCH /api/marketer/stock-pickup/:id/return-request
async function requestReturn(req, res, next) {
  try {
    const marketerId = req.user.id;
    const id = parseInt(req.params.id, 10);

    // 1) Ensure it’s your own pending pickup
    const { rows } = await pool.query(
      `SELECT status, marketer_id
         FROM stock_updates
        WHERE id = $1`,
      [id]
    );
    const pickup = rows[0];
    if (!pickup || pickup.marketer_id !== marketerId) {
      return res.status(403).json({ message: "Not your pickup." });
    }
    if (pickup.status !== 'pending') {
      return res.status(400).json({ message: "Can only request return on pending pickups." });
    }

    // 2) Mark as return_pending
    const { rows: updated } = await pool.query(
      `UPDATE stock_updates
          SET status              = 'return_pending',
              return_requested_at = NOW(),
              updated_at          = NOW()
        WHERE id = $1
        RETURNING *`,
      [id]
    );

    res.json({
      message: "Return requested, awaiting MasterAdmin confirmation.",
      stock: updated[0]
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
  listSuperAdminStockUpdates,
  getStockUpdatesForAdmin,
  requestReturn,
};
