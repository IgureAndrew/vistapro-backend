// src/controllers/marketerController.js
const bcrypt = require('bcrypt');
const { pool } = require('../config/database');
const {
  creditMarketerCommission,
  creditAdminCommission,
  creditSuperAdminCommission
} = require('../services/walletService');

// Commission rates per device
const COMMISSION_RATES = {
  android: 10000,
  iphone:  15000,
};

/**
 * getAccountSettings - Retrieves current marketer’s account info.
 */
async function getAccountSettings(req, res, next) {
  try {
    const marketerUniqueId = req.user.unique_id;
    if (!marketerUniqueId) {
      return res.status(400).json({ message: "Marketer unique ID not available." });
    }
    const { rows } = await pool.query(
      `SELECT first_name AS displayName, email, phone, profile_image
         FROM users
        WHERE unique_id = $1`,
      [marketerUniqueId]
    );
    if (!rows.length) {
      return res.status(404).json({ message: "User not found." });
    }
    res.json({ settings: rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * updateAccountSettings - Partially updates marketer’s profile.
 */
async function updateAccountSettings(req, res, next) {
  try {
    const marketerUniqueId = req.user.unique_id;
    if (!marketerUniqueId) {
      return res.status(400).json({ message: "Marketer unique ID not available." });
    }
    const { displayName, email, phone, oldPassword, newPassword } = req.body;
    let clauses = [], values = [], idx = 1;

    // 1) handle password change
    if (newPassword) {
      if (!oldPassword) {
        return res.status(400).json({ message: "Old password is required." });
      }
      const { rows: userRows } = await pool.query(
        `SELECT password FROM users WHERE unique_id = $1`,
        [marketerUniqueId]
      );
      if (!userRows.length) {
        return res.status(404).json({ message: "User not found." });
      }
      const match = await bcrypt.compare(oldPassword, userRows[0].password);
      if (!match) {
        return res.status(400).json({ message: "Old password is incorrect." });
      }
      const hash = await bcrypt.hash(newPassword, 10);
      clauses.push(`password = $${idx}`);
      values.push(hash);
      idx++;
    }

    // 2) other optional fields
    if (displayName) {
      clauses.push(`first_name = $${idx}`);
      values.push(displayName);
      idx++;
    }
    if (email) {
      clauses.push(`email = $${idx}`);
      values.push(email);
      idx++;
    }
    if (phone) {
      clauses.push(`phone = $${idx}`);
      values.push(phone);
      idx++;
    }
    if (req.file) {
      clauses.push(`profile_image = $${idx}`);
      values.push(req.file.path);
      idx++;
    }

    if (!clauses.length) {
      return res.status(400).json({ message: "No fields provided for update." });
    }

    clauses.push(`updated_at = NOW()`);
    values.push(marketerUniqueId);

    const query = `
      UPDATE users
         SET ${clauses.join(', ')}
       WHERE unique_id = $${idx}
       RETURNING id, unique_id, first_name AS displayName, email, phone, profile_image, updated_at
    `;
    const { rows } = await pool.query(query, values);

    if (!rows.length) {
      return res.status(404).json({ message: "User not found." });
    }
    res.json({ message: "Account updated successfully.", marketer: rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * getPlaceOrderData
 *   GET /api/marketer/orders
 *   • if any live pending pickups exist → mode:'stock' + pending[]
 *   • else → mode:'free' + products[]
 */
async function getPlaceOrderData(req, res, next) {
  const marketerId = req.user.id;
  try {
    // 0) fetch marketer’s location
    const { rows: me } = await pool.query(
      `SELECT location FROM users WHERE id = $1`,
      [marketerId]
    );
    if (!me.length) {
      return res.status(404).json({ message: "Marketer not found." });
    }
    const marketerLocation = me[0].location;

    // 1) pending stock‐pickups
    const { rows: pending } = await pool.query(`
      SELECT
        su.id                       AS stock_update_id,
        p.id                        AS product_id,
        p.device_name,
        p.device_model,
        p.device_type,
        p.selling_price,
        u.business_name             AS dealer_name,
        u.location                  AS dealer_location,
        su.quantity                 AS qty_reserved,
        ARRAY_AGG(i.imei) FILTER (WHERE i.status = 'reserved') AS imeis_reserved
      FROM stock_updates su
      JOIN products p ON p.id = su.product_id
      JOIN users u ON u.id = p.dealer_id
      LEFT JOIN inventory_items i ON i.stock_update_id = su.id AND i.status = 'reserved'
      WHERE su.marketer_id = $1
        AND su.status        = 'pending'
        AND su.deadline > NOW()
      GROUP BY
        su.id, p.id, p.device_name, p.device_model,
        p.device_type, p.selling_price,
        u.business_name, u.location,
        su.quantity
      ORDER BY su.deadline
    `, [marketerId]);

    if (pending.length) {
      return res.json({ mode: 'stock', pending });
    }

    // 2) free‐mode products
    const { rows: products } = await pool.query(`
      SELECT
        p.id                            AS product_id,
        p.device_name,
        p.device_model,
        p.device_type,
        p.selling_price,
        u.business_name                 AS dealer_name,
        u.location                      AS dealer_location,
        COUNT(i.*) FILTER (WHERE i.status = 'available')       AS qty_available,
        ARRAY_AGG(i.imei) FILTER (WHERE i.status = 'available') AS imeis_available
      FROM products p
      JOIN users u ON p.dealer_id = u.id
      LEFT JOIN inventory_items i ON i.product_id = p.id
      WHERE u.location = $1
      GROUP BY
        p.id, p.device_name, p.device_model,
        p.device_type, p.selling_price,
        u.business_name, u.location
      HAVING COUNT(i.*) FILTER (WHERE i.status = 'available') > 0
      ORDER BY p.device_name
    `, [marketerLocation]);

    res.json({ mode: 'free', products });
  } catch (err) {
    next(err);
  }
}

// src/controllers/marketerController.js

async function createOrder(req, res, next) {
  const marketerId  = req.user.id;
  const marketerUid = req.user.unique_id;

  let {
    stock_update_id,
    number_of_devices,
    imeis,                // [ "15-digit-string", … ]
    customer_name,
    customer_phone,
    customer_address,
    bnpl_platform
  } = req.body;

  stock_update_id   = parseInt(stock_update_id, 10);
  number_of_devices = parseInt(number_of_devices, 10);
  imeis             = Array.isArray(imeis) ? imeis : [];

  // 1) Basic validations
  if (!stock_update_id || number_of_devices < 1 || !customer_name) {
    return res.status(400).json({
      message: "stock_update_id, number_of_devices and customer_name are required."
    });
  }
  if (imeis.length !== number_of_devices) {
    return res.status(400).json({
      message: "Provide exactly one IMEI per device."
    });
  }
  if (!imeis.every(i => /^\d{15}$/.test(i))) {
    return res.status(400).json({
      message: "All IMEIs must be exactly 15 digits."
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 2) Decrement pickup quantity
    await client.query(`
      UPDATE stock_updates
         SET quantity = GREATEST(quantity - $1, 0),
             status   = CASE 
                          WHEN quantity - $1 <= 0 THEN 'sold'
                          ELSE status
                        END
       WHERE id = $2
    `, [number_of_devices, stock_update_id]);

    // 3) Fetch price & type
    const { rows: [p] } = await client.query(`
      SELECT p.cost_price, p.selling_price, p.device_type
        FROM stock_updates su
        JOIN products p ON p.id = su.product_id
       WHERE su.id = $1
    `, [stock_update_id]);
    if (!p) throw new Error("Invalid stock_update_id");

    const unitPrice   = Number(p.selling_price);
    const sold_amount = unitPrice * number_of_devices;
    const unitProfit  = unitPrice - Number(p.cost_price);

    // 4) Insert order
    const { rows: [order] } = await client.query(`
      INSERT INTO orders (
        marketer_id,
        stock_update_id,
        number_of_devices,
        sold_amount,
        customer_name,
        customer_phone,
        customer_address,
        bnpl_platform,
        earnings_per_device,
        sale_date,
        created_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW()
      )
      RETURNING id
    `, [
      marketerId,
      stock_update_id,
      number_of_devices,
      sold_amount,
      customer_name,
      customer_phone,
      customer_address,
      bnpl_platform || null,
      unitProfit
    ]);

    // 5) Upsert each IMEI into inventory_items → sold, and link via order_items
    for (let imei of imeis) {
      const { rows: [inv] } = await client.query(`
        INSERT INTO inventory_items (product_id, imei, status, created_at)
        VALUES (
          (SELECT product_id FROM stock_updates WHERE id = $1),
          $2,
          'sold',
          NOW()
        )
        ON CONFLICT (imei) DO UPDATE
          SET status = 'sold'
        RETURNING id
      `, [stock_update_id, imei]);

      await client.query(`
        INSERT INTO order_items (order_id, inventory_item_id)
        VALUES ($1, $2)
      `, [order.id, inv.id]);
    }

    // 6) NO COMMISSIONS HERE 🚫
    //    All commission payouts are now strictly handled in your
    //    "confirmOrder" endpoint when status → 'released_confirmed'

    await client.query("COMMIT");
    return res.status(201).json({
      message: "Order placed successfully.",
      order: { id: order.id }
    });
  } catch (err) {
    await client.query("ROLLBACK");
    return next(err);
  } finally {
    client.release();
  }
}


/**
 * GET /api/marketer/orders/history
 * Returns both legacy and new orders, including IMEIs
 */
async function getOrderHistory(req, res, next) {
  const marketerId = req.user.id;
  try {
    const { rows } = await pool.query(`
      SELECT
        o.id,
        COALESCE(
          json_agg(ii.imei) FILTER (WHERE ii.imei IS NOT NULL),
          '[]'
        ) AS imeis,
        p.device_name,
        p.device_model,
        p.device_type,
        o.number_of_devices,
        o.sold_amount,
        o.sale_date,
        o.status
      FROM orders o
      /* pull any IMEIs sold on this order */
      LEFT JOIN order_items oi
        ON oi.order_id = o.id
      LEFT JOIN inventory_items ii
        ON ii.id = oi.inventory_item_id

      /* find the underlying product via the stock_update_id */
      JOIN stock_updates su
        ON su.id = o.stock_update_id
      JOIN products p
        ON p.id = su.product_id

      WHERE o.marketer_id = $1
      GROUP BY
        o.id,
        p.device_name,
        p.device_model,
        p.device_type,
        o.number_of_devices,
        o.sold_amount,
        o.sale_date,
        o.status
      ORDER BY o.sale_date DESC
    `, [marketerId]);

    res.json({ orders: rows });
  } catch (err) {
    next(err);
  }
}


/**
 * submitBioData - Submits the marketer's bio data form.
 */
async function submitBioData(req, res, next) {
  try {
    const marketerId = req.user.id;
    const {
      name, address, phone_no, religion, date_of_birth,
      marital_status, state_of_origin, state_of_residence,
      mothers_maiden_name, school_attended, id_type,
      last_place_of_work, job_description, reason_for_quitting,
      medical_condition, next_of_kin_name, next_of_kin_phone,
      next_of_kin_address, next_of_kin_relationship,
      bank_name, account_name, account_no
    } = req.body;

    const passport_photo    = req.files?.passport_photo?.[0].filename;
    const id_document_image = req.files?.id_document?.[0].filename;
    if (!passport_photo || !id_document_image) {
      return res.status(400).json({ message: "Both passport photo and ID document are required." });
    }

    const { rows } = await pool.query(`
      INSERT INTO marketer_bio_data (
        marketer_id, name, address, phone_no, religion,
        date_of_birth, marital_status, state_of_origin,
        state_of_residence, mothers_maiden_name,
        school_attended, id_type, id_document_image,
        passport_photo, last_place_of_work, job_description,
        reason_for_quitting, medical_condition,
        next_of_kin_name, next_of_kin_phone,
        next_of_kin_address, next_of_kin_relationship,
        bank_name, account_name, account_no, created_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,
        $11,$12,$13,$14,$15,$16,$17,$18,
        $19,$20,$21,$22,$23,$24,$25,NOW()
      )
      RETURNING *
    `, [
      marketerId,
      name, address, phone_no, religion,
      date_of_birth, marital_status, state_of_origin,
      state_of_residence, mothers_maiden_name,
      school_attended, id_type, id_document_image,
      passport_photo, last_place_of_work, job_description,
      reason_for_quitting, medical_condition,
      next_of_kin_name, next_of_kin_phone,
      next_of_kin_address, next_of_kin_relationship,
      bank_name, account_name, account_no
    ]);

    res.status(201).json({ message: "Bio data submitted successfully.", bioData: rows[0] });
  } catch (err) { next(err); }
}

/**
 * submitGuarantorForm - Processes the guarantor form submission.
 */
async function submitGuarantorForm(req, res, next) {
  try {
    const marketerId = req.user.id;
    const {
      candidate_known, relationship, years_known, occupation,
      guarantor_title, guarantor_full_name,
      guarantor_home_address, guarantor_office_address,
      employee_full_name, id_type, guarantor_phone, guarantor_email
    } = req.body;

    const isKnown        = candidate_known?.toLowerCase() === "yes";
    const id_document    = req.files?.id_document?.[0].filename;
    const passport_photo = req.files?.passport_photo?.[0].filename;
    const signature      = req.files?.signature?.[0].filename;
    if (!id_document || !passport_photo || !signature) {
      return res.status(400).json({ message: "All file uploads are required." });
    }

    const { rows } = await pool.query(`
      INSERT INTO marketer_guarantor_form (
        marketer_id, candidate_known, relationship, years_known, occupation,
        guarantor_title, guarantor_full_name, guarantor_home_address,
        guarantor_office_address, employee_full_name, id_type,
        guarantor_id_doc, guarantor_passport_photo, guarantor_signature,
        guarantor_phone, guarantor_email, agreed, created_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,TRUE,NOW()
      )
      RETURNING *
    `, [
      marketerId, isKnown, relationship, years_known, occupation,
      guarantor_title, guarantor_full_name, guarantor_home_address,
      guarantor_office_address, employee_full_name, id_type,
      id_document, passport_photo, signature,
      guarantor_phone, guarantor_email
    ]);

    res.status(201).json({ message: "Guarantor form submitted successfully.", guarantorForm: rows[0] });
  } catch (err) { next(err); }
}

/**
 * submitCommitmentForm - Processes the marketer's Commitment Form.
 */
async function submitCommitmentForm(req, res, next) {
  try {
    const marketerId = req.user.id;
    const {
      promise_accept_false_documents, promise_request_unrelated_info,
      promise_no_customer_fees, promise_no_modify_contract,
      promise_no_sell_unapproved, promise_no_non_official_commitment,
      promise_no_operate_customer_account, promise_fraudulent_act_fire,
      promise_no_share_company_info, promise_recover_loan,
      promise_abide_system, direct_sales_rep_name, commitment_date
    } = req.body;

    const parseYes = v => v?.toLowerCase() === "yes";
    const signature = req.file?.filename;
    if (!signature) {
      return res.status(400).json({ message: "Direct Sales Rep signature is required." });
    }

    const { rows } = await pool.query(`
      INSERT INTO marketer_commitment_form (
        marketer_id,
        promise_accept_false_documents,
        promise_request_unrelated_info,
        promise_no_customer_fees,
        promise_no_modify_contract,
        promise_no_sell_unapproved,
        promise_no_non_official_commitment,
        promise_no_operate_customer_account,
        promise_fraudulent_act_fire,
        promise_no_share_company_info,
        promise_recover_loan,
        promise_abide_system,
        direct_sales_rep_name,
        direct_sales_rep_signature,
        commitment_date,
        created_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,NOW()
      )
      RETURNING *
    `, [
      marketerId,
      parseYes(promise_accept_false_documents),
      parseYes(promise_request_unrelated_info),
      parseYes(promise_no_customer_fees),
      parseYes(promise_no_modify_contract),
      parseYes(promise_no_sell_unapproved),
      parseYes(promise_no_non_official_commitment),
      parseYes(promise_no_operate_customer_account),
      parseYes(promise_fraudulent_act_fire),
      parseYes(promise_no_share_company_info),
      parseYes(promise_recover_loan),
      parseYes(promise_abide_system),
      direct_sales_rep_name,
      signature,
      commitment_date
    ]);

    res.status(201).json({ message: "Commitment form submitted successfully.", commitmentForm: rows[0] });
  } catch (err) { next(err); }
}

/**
 * listDealersByState - GET /api/marketer/dealers
 * Returns all dealers in the logged-in marketer’s state.
 */
async function listDealersByState(req, res, next) {
  try {
    const marketerId = req.user.id;
    const meResult = await pool.query(
      `SELECT location FROM users WHERE id = $1`,
      [marketerId]
    );
    if (!meResult.rowCount) {
      return res.status(404).json({ message: "Marketer not found." });
    }
    const marketerState = meResult.rows[0].location;

    const dealersResult = await pool.query(
      `SELECT id, unique_id, business_name, location
         FROM users
        WHERE role = 'Dealer' AND location = $1
        ORDER BY business_name`,
      [marketerState]
    );
    res.json({ dealers: dealersResult.rows });
  } catch (err) { next(err); }
}

/**
 * listDealerProducts - GET /api/marketer/dealers/:dealerUniqueId/products
 * Returns only that dealer’s products which have available inventory.
 */
async function listDealerProducts(req, res, next) {
  try {
    const { dealerUniqueId } = req.params;
    const { rows: me } = await pool.query(
      `SELECT location FROM users WHERE id = $1`,
      [req.user.id]
    );
    if (!me.length) {
      return res.status(404).json({ message: "Marketer not found." });
    }
    const marketerState = me[0].location;

    const dealerQ = await pool.query(
      `SELECT id FROM users
        WHERE unique_id = $1 AND role = 'Dealer' AND location = $2`,
      [dealerUniqueId, marketerState]
    );
    if (!dealerQ.rowCount) {
      return res.status(403).json({ message: "Dealer not in your state." });
    }
    const dealerId = dealerQ.rows[0].id;

    const { rows } = await pool.query(`
      SELECT
        p.id            AS product_id,
        p.device_name,
        p.device_model,
        p.device_type,
        p.selling_price,
        COUNT(i.*) FILTER (WHERE i.status = 'available')       AS qty_available,
        ARRAY_AGG(i.imei) FILTER (WHERE i.status = 'available') AS imeis_available
      FROM products p
      JOIN inventory_items i
        ON i.product_id = p.id AND i.status = 'available'
      WHERE p.dealer_id = $1
      GROUP BY p.id, p.device_name, p.device_model, p.device_type, p.selling_price
      HAVING COUNT(i.*) FILTER (WHERE i.status = 'available') > 0
    `, [dealerId]);

    res.json({ products: rows });
  } catch (err) { next(err); }
}

/**
 * getMarketerOrders - GET /api/marketer/orders
 * Returns all orders for the logged-in marketer.
 */
async function getMarketerOrders(req, res, next) {
  try {
    const marketerId = req.user.id;
    const { rows } = await pool.query(`
      SELECT
        o.*,
        p.device_name,
        p.device_model,
        p.device_type
      FROM orders o
      JOIN products p ON p.id = o.product_id
      WHERE o.marketer_id = $1
      ORDER BY o.sale_date DESC
    `, [marketerId]);
    res.json({ orders: rows });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  getAccountSettings,
  updateAccountSettings,
  getPlaceOrderData,
  createOrder,
  getOrderHistory,
  submitBioData,
  submitGuarantorForm,
  submitCommitmentForm,
  listDealersByState,
  listDealerProducts,
  getMarketerOrders,
};
