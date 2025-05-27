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
 * Place an order only from a pending pickup, record exact IMEIs sold.
 */
async function placeOrder(req, res, next) {
  const marketerUID = req.user.unique_id;
  const stock_update_id   = parseInt(req.body.stock_update_id,   10);
  const number_of_devices = parseInt(req.body.number_of_devices, 10);
  const sold_amount       = parseFloat(req.body.sold_amount);
  const {
    customer_name,
    customer_phone,
    customer_address,
    bnpl_platform
  } = req.body;

  // 0) Require a pickup
  if (!stock_update_id) {
    return res.status(400).json({
      message: "This endpoint only supports orders from an existing stock pickup. Please supply stock_update_id."
    });
  }
  if (!number_of_devices || number_of_devices < 1) {
    return res.status(400).json({ message: "Must supply a valid number_of_devices." });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 1) Lock & fetch the pending pickup
    const { rows: [pickup] } = await client.query(`
      SELECT id, product_id, quantity
        FROM stock_updates
       WHERE id           = $1
         AND marketer_id  = (SELECT id FROM users WHERE unique_id = $2)
         AND status       = 'pending'
         AND deadline > NOW()
       FOR UPDATE
    `, [ stock_update_id, marketerUID ]);

    if (!pickup) {
      return res.status(404).json({ message: "No active pending pickup found with that ID." });
    }
    if (pickup.quantity < number_of_devices) {
      return res.status(400).json({ message: "Not enough quantity remaining on that pickup." });
    }

    // 2) Decrement the pickup quantity (and close it if zero)
    await client.query(`
      UPDATE stock_updates
         SET quantity = quantity - $1,
             status   = CASE WHEN quantity - $1 <= 0 THEN 'sold' ELSE status END,
             updated_at = NOW()
       WHERE id = $2
    `, [ number_of_devices, stock_update_id ]);

    // 3) Create the order (pending until MasterAdmin confirms)
    const { rows: [order] } = await client.query(`
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
        $2, $3, $4, $5,
        $6, $7, $8, $9, 0,
        'pending', NOW(), NOW()
      )
      RETURNING id
    `, [
      marketerUID,
      pickup.product_id,
      stock_update_id,
      number_of_devices,
      sold_amount,
      customer_name,
      customer_phone,
      customer_address,
      bnpl_platform || null
    ]);

    // 4) Pull exactly the reserved IMEIs and mark them sold
    const { rows: items } = await client.query(`
      SELECT id
        FROM inventory_items
       WHERE stock_update_id = $1
         AND status          = 'reserved'
       LIMIT $2
       FOR UPDATE SKIP LOCKED
    `, [ stock_update_id, number_of_devices ]);

    const soldItemIds = items.map(r => r.id);
    if (soldItemIds.length) {
      await client.query(`
        UPDATE inventory_items
           SET status = 'sold'
         WHERE id = ANY($1::int[])
      `, [ soldItemIds ]);
    }

    // 5) Record them in order_items
    for (let iid of soldItemIds) {
      await client.query(`
        INSERT INTO order_items (order_id, inventory_item_id)
        VALUES ($1, $2)
      `, [ order.id, iid ]);
    }

    await client.query("COMMIT");
    return res.status(201).json({
      message: "Order placed and awaiting MasterAdmin confirmation.",
      order
    });
  } catch (err) {
    await client.query("ROLLBACK");
    next(err);
  } finally {
    client.release();
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
 * (Master/Admin) list all pickups with human-friendly status
 */
async function getStockUpdates(req, res, next) {
  try {
    const { rows } = await pool.query(`
      SELECT
        su.id,
        p.device_name,
        p.device_model,
        d.business_name       AS dealer_name,
        d.location            AS dealer_location,
        su.quantity,
        su.pickup_date,
        su.deadline,

        -- map every status to a friendly label
        CASE
          WHEN su.status = 'return_pending'   THEN 'Pending Return'
          WHEN su.status = 'returned'         THEN 'Returned'
          WHEN su.status = 'transfer_pending' THEN 'Pending Transfer'
          WHEN su.status = 'transfer_approved' THEN 'Transfer Approved'
          WHEN su.status = 'transfer_rejected' THEN 'Transfer Rejected'
          WHEN EXISTS (
            SELECT 1
              FROM orders o
             WHERE o.stock_update_id = su.id
               AND o.status IN ('confirmed','released_confirmed')
          ) THEN 'Sold'
          WHEN su.deadline < NOW() THEN 'Expired'
          ELSE 'Pending'
        END AS status,

        m.first_name || ' ' || m.last_name   AS marketer_name,
        m.unique_id                         AS marketer_unique_id,
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


/**
 * GET /api/marketer/stock-pickup/:admin
 * (Admin view) list all pickups under this admin
 */
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

        CASE
          WHEN su.status = 'return_pending'   THEN 'Pending Return'
          WHEN su.status = 'returned'         THEN 'Returned'
          WHEN su.status = 'transfer_pending' THEN 'Pending Transfer'
          WHEN su.status = 'transfer_approved' THEN 'Transfer Approved'
          WHEN su.status = 'transfer_rejected' THEN 'Transfer Rejected'
          WHEN EXISTS (
            SELECT 1
              FROM orders o
             WHERE o.stock_update_id = su.id
               AND o.status IN ('confirmed','released_confirmed')
          ) THEN 'Sold'
          WHEN su.deadline < NOW() THEN 'Expired'
          ELSE 'Pending'
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

// … all your existing methods (listStockPickupDealers, createStockUpdate, placeOrder, etc.) …

/**
 * POST /api/marketer/stock-pickup/request
 * Marketer asks for permission to pick up up to 3 units instead of the default 1.
 */
async function requestAdditionalPickup(req, res, next) {
  const marketerId = req.user.id;

  try {
    // unique constraint on marketer_id means only one pending/approved can exist
    const { rows } = await pool.query(`
      INSERT INTO additional_pickup_requests
        (marketer_id, status)
      VALUES ($1, 'pending')
      RETURNING id, status
    `, [marketerId]);

    // notify their MasterAdmin
    const { rows: prev } = await pool.query(`
  SELECT next_request_allowed_at
    FROM additional_pickup_requests
   WHERE marketer_id = $1
     AND status = 'rejected'
   ORDER BY reviewed_at DESC
   LIMIT 1
`, [ marketerId ]);

if (prev.length && prev[0].next_request_allowed_at > NOW()) {
  return res.status(400).json({
    message: `You can next request on ${prev[0].next_request_allowed_at.toLocaleString()}.`
  });
}
    res.status(201).json({ message: "Additional pickup request submitted." });
  } catch (err) {
    // unique violation → they already have a request
    if (err.code === '23505') {
      return res.status(400).json({
        message: "You already have an active additional-pickup request."
      });
    }
    next(err);
  }
}

/**
 * GET /api/marketer/stock-pickup/allowance
 * Returns { allowance: 1 } by default, or 3 if they have an approved request.
 */
// GET /marketer/allowance
async function getAllowance(req, res, next) {
  try {
    // 1) look up your internal user ID
    const marketerUnique = req.user.unique_id;
    const { rows: [u] } = await pool.query(
      `SELECT id FROM users WHERE unique_id = $1`, 
      [marketerUnique]
    );
    if (!u) return res.status(404).json({ message: 'User not found' });
    const marketerId = u.id;

    // 2) fetch any extra-pickup request
    const { rows } = await pool.query(
      `SELECT status, next_request_allowed_at
         FROM additional_pickup_requests
        WHERE marketer_id = $1`,
      [marketerId]
    );
    
    // 3) default values
    let allowance             = 1;
    let request_status        = null;
    let next_request_allowed_at = null;

    if (rows.length) {
      const rec = rows[0];
      request_status           = rec.status;
      next_request_allowed_at  = rec.next_request_allowed_at;

      // if approved *and* not locked out by next_request_allowed_at
      if (
        rec.status === 'approved' &&
        (!rec.next_request_allowed_at || rec.next_request_allowed_at < new Date())
      ) {
        allowance = 3;   // <-- bump this to however many lines you want
        next_request_allowed_at = null;
      }
    }

    return res.json({
      allowance,
      request_status,
      next_request_allowed_at
    });
  } catch (err) {
    next(err);
  }
}
/**
 * GET /api/stock-pickup/requests
 * MasterAdmin: list all pending additional-pickup requests.
 */
async function listExtraPickupRequests(req, res, next) {
  if (req.user.role !== 'MasterAdmin') {
    return res.status(403).json({ message: "Only MasterAdmin may review." });
  }

  try {
    const { rows } = await pool.query(`
      SELECT
        r.id,
        u.first_name || ' ' || u.last_name AS marketer_name,
        u.unique_id                       AS marketer_uid,
        r.created_at                      AS requested_at,
        r.status
      FROM additional_pickup_requests r
      JOIN users u ON r.marketer_id = u.id
      WHERE r.status = 'pending'
      ORDER BY r.created_at DESC
    `);

    // match what your front-end expects:
    res.json({ requests: rows });
  } catch (err) {
    next(err);
  }
}
/**
 * PATCH /api/stock-pickup/requests/:id
 * MasterAdmin approves or rejects a pending request.
 */
async function reviewExtraPickupRequest(req, res, next) {
  if (req.user.role !== 'MasterAdmin') {
    return res.status(403).json({ message: "Only MasterAdmin may review." });
  }

  const id     = parseInt(req.params.id, 10);
  const action = req.body.action; // 'approve' or 'reject'

  if (!['approve','reject'].includes(action)) {
    return res.status(400).json({ message: "Invalid action." });
  }

  try {
    // inside your reject branch:
const { rows } = await pool.query(`
  UPDATE additional_pickup_requests
     SET status                  = 'rejected',
         reviewed_at             = NOW(),
         reviewer_id             = (SELECT id FROM users WHERE unique_id = $3),
         next_request_allowed_at = NOW() + INTERVAL '7 days'
   WHERE id = $1
   RETURNING *
`, [ id, , req.user.unique_id ]);

    if (!rows.length) {
      return res.status(404).json({ message: "Request not found." });
    }

    // notify marketer
    const { rows: m } = await pool.query(`
      SELECT unique_id
        FROM users
       WHERE id = (SELECT marketer_id FROM additional_pickup_requests WHERE id = $1)
    `, [id]);

    if (m[0]?.unique_id) {
      await pool.query(`
        INSERT INTO notifications (user_unique_id, message)
        VALUES ($1, $2)
      `, [
        m[0].unique_id,
        action === 'approve'
          ? `Your extra-pickup request has been approved. You may now reserve up to 3 units.`
          : `Your extra-pickup request has been rejected.`
      ]);
    }

    res.json({ message: `Request ${action}d.`, request: rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * PATCH /api/marketer/notifications/:id/read
 * Mark one notification as read.
 */
async function markNotificationRead(req, res, next) {
  await pool.query(`
    UPDATE notifications
       SET is_read = TRUE
     WHERE id = $1
       AND user_unique_id = $2
  `, [ Number(req.params.id), req.user.unique_id ]);
  res.sendStatus(204);
}
async function createBulkPickup(req, res, next) {
  const marketerId = req.user.id;
  const { lines, total } = req.bulk;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 1) fetch allowance (1 or 3)
    const { rows: arows } = await client.query(`
      SELECT CASE WHEN EXISTS (
         SELECT 1 FROM additional_pickup_requests
         WHERE marketer_id=$1 AND status='approved'
       ) THEN 3 ELSE 1 END AS allowance
    `, [marketerId]);
    const allowance = arows[0].allowance;
    if (total > allowance) {
      await client.query('ROLLBACK');
      return res.status(400).json({ message: `Your allowance is ${allowance}` });
    }

    // 2) verify each product has enough stock
    for (let { product_id, quantity } of lines) {
      const { rows: crow } = await client.query(`
        SELECT COUNT(*)::int AS cnt
        FROM inventory_items
        WHERE product_id=$1 AND status='available'
      `, [product_id]);
      if (crow[0].cnt < quantity) {
        await client.query('ROLLBACK');
        return res.status(400).json({
          message: `Not enough stock for product ${product_id}`
        });
      }
    }

    // 3) insert stock_update
    const deadline = `NOW() + INTERVAL '48 hours'`;
    const { rows: su } = await client.query(`
      INSERT INTO stock_updates (marketer_id, pickup_date, deadline, status)
      VALUES ($1, NOW(), ${deadline}, 'pending') RETURNING id
    `, [marketerId]);
    const stockId = su[0].id;

    // 4) insert pickup_items and reserve inventory
    for (let { product_id, quantity } of lines) {
      await client.query(`
        INSERT INTO pickup_items (stock_update_id, product_id, quantity)
        VALUES ($1,$2,$3)
      `, [stockId, product_id, quantity]);

      // reserve each unit
      const { rows: items } = await client.query(`
        SELECT id FROM inventory_items
         WHERE product_id=$1 AND status='available'
         LIMIT $2 FOR UPDATE SKIP LOCKED
      `, [product_id, quantity]);
      const ids = items.map(r => r.id);
      await client.query(`
        UPDATE inventory_items
           SET status='reserved', stock_update_id=$1
         WHERE id = ANY($2::int[])
      `, [stockId, ids]);
    }

    await client.query('COMMIT');
    res.status(201).json({ message: "Bulk pickup recorded", stock_update_id: stockId });
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
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
  requestAdditionalPickup,
  getAllowance,
  listExtraPickupRequests,
  reviewExtraPickupRequest,
  markNotificationRead,
  createBulkPickup
};
