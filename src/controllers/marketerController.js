// src/controllers/marketerController.js

const bcrypt = require('bcrypt');
const { pool } = require('../config/database');
const { createUser } = require('../models/userModel'); // if needed elsewhere

/**
 * getAccountSettings - Retrieves current marketer’s account info.
 */
async function getAccountSettings(req, res, next) {
  try {
    const marketerUniqueId = req.user.unique_id;
    if (!marketerUniqueId) {
      return res.status(400).json({ message: "Marketer unique ID not available." });
    }
    const { rows } = await pool.query(`
      SELECT first_name AS displayName,
             email,
             phone,
             profile_image
      FROM users
      WHERE unique_id = $1
    `, [marketerUniqueId]);

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

    // password change
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
    const query = `
      UPDATE users
         SET ${clauses.join(', ')}
       WHERE unique_id = $${idx}
     RETURNING id, unique_id, first_name AS displayName, email, phone, profile_image, updated_at
    `;
    values.push(marketerUniqueId);

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
 *   GET /marketer/orders
 *   • if any live pending pickups exist → mode:'stock' + pending[]
 *   • else → mode:'free' + products[]
 */
async function getPlaceOrderData(req, res, next) {
  const marketerId = req.user.id;
  try {
    // 1) Look for any live, pending stock_updates with reserved inventory_items
    const pendingQ = `
      SELECT
        su.id                     AS stock_update_id,
        p.id                      AS product_id,
        p.device_name,
        p.device_model,
        p.device_type,
        p.selling_price,
        su.quantity               AS qty_reserved,
        ARRAY_AGG(i.imei)         AS imeis_reserved
      FROM stock_updates su
      JOIN inventory_items i
        ON i.stock_update_id = su.id
       AND i.status            = 'reserved'
      JOIN products p
        ON p.id = su.product_id
      WHERE su.marketer_id = $1
        AND su.status       = 'pending'
        AND su.deadline > NOW()
      GROUP BY
        su.id, p.id, p.device_name, p.device_model,
        p.device_type, p.selling_price, su.quantity
    `;
    const { rows: pending } = await pool.query(pendingQ, [marketerId]);

    if (pending.length) {
      return res.json({ mode: 'stock', pending });
    }

    // 2) No live pickups → free‐order mode: list all products with available inventory
    const productsQ = `
      SELECT
        p.id           AS product_id,
        p.device_name,
        p.device_model,
        p.device_type,
        p.selling_price,
        COUNT(i.*) FILTER (WHERE i.status = 'available') AS qty_available
      FROM products p
      LEFT JOIN inventory_items i
        ON i.product_id = p.id
      GROUP BY
        p.id, p.device_name, p.device_model,
        p.device_type, p.selling_price
      HAVING COUNT(i.*) FILTER (WHERE i.status = 'available') > 0
      ORDER BY p.device_name
    `;
    const { rows: products } = await pool.query(productsQ);

    return res.json({ mode: 'free', products });
  } catch (err) {
    next(err);
  }
}

/**
 * createOrder
 * POST /api/marketer/orders
 * • accepts either stock_update_id or product_id
 * • inserts into orders, and marks stock_updates completed if used
 */
async function createOrder(req, res, next) {
  const marketerId = req.user.id;
  const {
    stock_update_id,
    product_id,
    number_of_devices,
    sold_amount,
    customer_name,
    customer_phone,
    customer_address,
    bnpl_platform,
  } = req.body;

  try {
    // 1) insert order
    const { rows } = await pool.query(`
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
        sale_date,
        created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW()
      )
      RETURNING *
    `, [
      marketerId,
      product_id || null,
      stock_update_id || null,
      number_of_devices,
      sold_amount,
      customer_name,
      customer_phone,
      customer_address,
      bnpl_platform || null,
    ]);
    const order = rows[0];

    // 2) if stock flow, mark that pickup completed
    if (stock_update_id) {
      await pool.query(
        `UPDATE stock_updates SET status = 'completed' WHERE id = $1`,
        [stock_update_id]
      );
    }

    res.status(201).json({ message: "Order placed successfully.", order });
  } catch (err) {
    next(err);
  }
}

/**
 * getOrderHistory
 * GET /api/marketer/orders/history
 * • Returns both legacy (imei on orders) and new (stock-picked) orders
 */
async function getOrderHistory(req, res, next) {
  const marketerId = req.user.id;
  try {
    const { rows } = await pool.query(`
      SELECT
        o.id,
        CASE
          WHEN o.stock_update_id IS NOT NULL THEN (
            SELECT ARRAY_AGG(i.imei)
            FROM inventory_items i
            WHERE i.stock_update_id = o.stock_update_id
          )
          ELSE ARRAY[o.imei]  -- wrap old single IMEI in array
        END AS imeis,
        COALESCE(o.device_name, p.device_name)   AS device_name,
        COALESCE(o.device_model, p.device_model) AS device_model,
        COALESCE(o.device_type, p.device_type)   AS device_type,
        o.number_of_devices,
        o.sold_amount,
        o.sale_date,
        o.status,
        u.unique_id AS marketer_unique_id
      FROM orders o
      LEFT JOIN products p
        ON o.product_id = p.id
      JOIN users u ON o.marketer_id = u.id
      WHERE o.marketer_id = $1
      ORDER BY o.sale_date DESC
    `, [marketerId]);

    const orders = rows.map(r => ({
      ...r,
      imeis: r.imeis || []
    }));

    res.json({ orders });
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
      name,
      address,
      phone_no,
      religion,
      date_of_birth,
      marital_status,
      state_of_origin,
      state_of_residence,
      mothers_maiden_name,
      school_attended,
      id_type,
      last_place_of_work,
      job_description,
      reason_for_quitting,
      medical_condition,
      next_of_kin_name,
      next_of_kin_phone,
      next_of_kin_address,
      next_of_kin_relationship,
      bank_name,
      account_name,
      account_no
    } = req.body;

    const passport_photo    = req.files?.passport_photo?.[0].filename;
    const id_document_image = req.files?.id_document?.[0].filename;

    if (!passport_photo || !id_document_image) {
      return res.status(400).json({ message: "Both passport photo and ID document are required." });
    }

    const { rows } = await pool.query(`
      INSERT INTO marketer_bio_data (
        marketer_id, name, address, phone_no, religion, date_of_birth, marital_status,
        state_of_origin, state_of_residence, mothers_maiden_name, school_attended,
        id_type, id_document_image, passport_photo,
        last_place_of_work, job_description, reason_for_quitting, medical_condition,
        next_of_kin_name, next_of_kin_phone, next_of_kin_address, next_of_kin_relationship,
        bank_name, account_name, account_no, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11,
        $12, $13, $14,
        $15, $16, $17, $18,
        $19, $20, $21, $22,
        $23, $24, $25, NOW()
      )
      RETURNING *
    `, [
      marketerId, name, address, phone_no, religion, date_of_birth, marital_status,
      state_of_origin, state_of_residence, mothers_maiden_name, school_attended,
      id_type, id_document_image, passport_photo,
      last_place_of_work, job_description, reason_for_quitting, medical_condition,
      next_of_kin_name, next_of_kin_phone, next_of_kin_address, next_of_kin_relationship,
      bank_name, account_name, account_no
    ]);

    res.status(201).json({ message: "Bio data submitted successfully.", bioData: rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * submitGuarantorForm - Processes the guarantor form submission.
 */
async function submitGuarantorForm(req, res, next) {
  try {
    const marketerId = req.user.id;
    const {
      candidate_known,
      relationship,
      years_known,
      occupation,
      guarantor_title,
      guarantor_full_name,
      guarantor_home_address,
      guarantor_office_address,
      employee_full_name,
      id_type,
      guarantor_phone,
      guarantor_email
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
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11,
        $12, $13, $14,
        $15, $16, TRUE, NOW()
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
  } catch (err) {
    next(err);
  }
}

/**
 * submitCommitmentForm - Processes the marketer's Commitment Form.
 */
async function submitCommitmentForm(req, res, next) {
  try {
    const marketerId = req.user.id;
    const {
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
      commitment_date
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
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW()
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
};
