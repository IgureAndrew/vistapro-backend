// src/controllers/marketerController.js
const bcrypt = require('bcrypt');
const { pool } = require('../config/database');
const { createUser } = require('../models/userModel');

/**
 * getAccountSettings - Retrieves the current account settings for the authenticated marketer.
 * Returns:
 *  - displayName (first_name)
 *  - email
 *  - phone
 *  - profile_image (avatar)
 */
const getAccountSettings = async (req, res, next) => {
  try {
    // Retrieve marketer's unique ID from the authenticated user.
    const marketerUniqueId = req.user.unique_id;
    if (!marketerUniqueId) {
      return res.status(400).json({ message: "Marketer unique ID not available." });
    }
    const query = `
      SELECT first_name AS displayName,
             email,
             phone,
             profile_image
      FROM users
      WHERE unique_id = $1
    `;
    const result = await pool.query(query, [marketerUniqueId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "User not found." });
    }
    return res.status(200).json({
      settings: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * updateAccountSettings - Allows a marketer to update their account settings.
 * Updatable fields include:
 *   - Display Name (stored in first_name)
 *   - Email
 *   - Phone number
 *   - Avatar (profile_image)
 *   - Password (if changing password, the marketer must provide oldPassword and newPassword)
 *
 * Only provided fields are updated.
 */
const updateAccountSettings = async (req, res, next) => {
  try {
    // Retrieve the marketer's unique ID from the authenticated user.
    const marketerUniqueId = req.user.unique_id;
    if (!marketerUniqueId) {
      return res.status(400).json({ message: "Marketer unique ID not available." });
    }

    // Extract fields from the request body.
    // "displayName" is stored in the first_name column.
    const { displayName, email, phone, oldPassword, newPassword } = req.body;

    // Prepare dynamic update clauses and values.
    let updateClauses = [];
    let updateValues = [];
    let paramIndex = 1;

    // Handle password update: newPassword provided must be accompanied by a valid oldPassword.
    if (newPassword) {
      if (!oldPassword) {
        return res.status(400).json({ message: "Old password is required to change password." });
      }
      const userQuery = "SELECT password FROM users WHERE unique_id = $1";
      const userResult = await pool.query(userQuery, [marketerUniqueId]);
      if (userResult.rowCount === 0) {
        return res.status(404).json({ message: "User not found." });
      }
      const currentHashedPassword = userResult.rows[0].password;
      const isMatch = await bcrypt.compare(oldPassword, currentHashedPassword);
      if (!isMatch) {
        return res.status(400).json({ message: "Old password is incorrect." });
      }
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      updateClauses.push(`password = $${paramIndex}`);
      updateValues.push(hashedPassword);
      paramIndex++;
    }

    // Update display name if provided.
    if (displayName) {
      updateClauses.push(`first_name = $${paramIndex}`);
      updateValues.push(displayName);
      paramIndex++;
    }
    
    // Update email if provided.
    if (email) {
      updateClauses.push(`email = $${paramIndex}`);
      updateValues.push(email);
      paramIndex++;
    }
    
    // Update phone if provided.
    if (phone) {
      updateClauses.push(`phone = $${paramIndex}`);
      updateValues.push(phone);
      paramIndex++;
    }
    
    // Update avatar if a file was uploaded via Multer.
    if (req.file) {
      updateClauses.push(`profile_image = $${paramIndex}`);
      updateValues.push(req.file.path);
      paramIndex++;
    }
    
    if (updateClauses.length === 0) {
      return res.status(400).json({ message: "No fields provided for update." });
    }
    
    // Always update the updated_at field.
    updateClauses.push("updated_at = NOW()");
    const query = `
      UPDATE users
      SET ${updateClauses.join(", ")}
      WHERE unique_id = $${paramIndex}
      RETURNING id, unique_id, first_name AS displayName, email, phone, profile_image, updated_at
    `;
    updateValues.push(marketerUniqueId);
    
    const result = await pool.query(query, updateValues);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "User not found." });
    }
    
    return res.status(200).json({
      message: "Account settings updated successfully.",
      marketer: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating account settings:", error);
    next(error);
  }
};

/**
 * GET /api/marketer/orders
 * - If you have pending stock_updates → returns { mode:'stock', pending:[…] }
 * - Else → returns { mode:'free', products:[…] }
 */
async function getPlaceOrderData(req, res, next) {
  const marketerId = req.user.id;
  try {
    // 1) any live pending pickups?
    const { rows: pending } = await pool.query(`
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
    `, [marketerId]);

    if (pending.length) {
      return res.json({ mode: 'stock', pending });
    }

    // 2) free-order: list products with available inventory
    const { rows: products } = await pool.query(`
      SELECT
        p.id                AS product_id,
        p.device_name,
        p.device_model,
        p.device_type,
        p.selling_price,
        COUNT(i.*) FILTER (WHERE i.status = 'available') AS qty_available
      FROM products p
      LEFT JOIN inventory_items i
        ON i.product_id = p.id
      GROUP BY p.id, p.device_name, p.device_model, p.device_type, p.selling_price
      HAVING COUNT(i.*) FILTER (WHERE i.status = 'available') > 0
      ORDER BY p.device_name
    `);

    return res.json({ mode: 'free', products });
  } catch (err) {
    next(err);
  }
}

/**
 * POST /api/marketer/orders
 * Creates a new order from either reserved stock or free product.
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
    bnpl_platform
  } = req.body;

  try {
    // 1) Basic validation:
    if (!number_of_devices || !customer_name || !customer_phone || !customer_address) {
      return res.status(400).json({ message: "Missing required fields." });
    }

    // 2) Determine which mode and check availability:
    let pid = product_id;
    if (stock_update_id) {
      // ensure stock_update is valid & qty ok
      const { rows } = await pool.query(`
        SELECT quantity
          FROM stock_updates
         WHERE id = $1
           AND marketer_id = $2
           AND status = 'pending'
           AND deadline > NOW()
      `, [stock_update_id, marketerId]);
      if (!rows.length || rows[0].quantity < number_of_devices) {
        return res.status(400).json({ message: "Invalid or insufficient reserved stock." });
      }
      // lookup product_id for the reservation
      const prod = await pool.query(`SELECT product_id FROM stock_updates WHERE id=$1`, [stock_update_id]);
      pid = prod.rows[0].product_id;
    } else {
      // free mode: ensure product exists and has enough available units
      const { rows } = await pool.query(`
        SELECT COUNT(*) FILTER (WHERE status='available') AS avail
          FROM inventory_items
         WHERE product_id = $1
      `, [product_id]);
      if (!rows.length || +rows[0].avail < number_of_devices) {
        return res.status(400).json({ message: "Not enough product available." });
      }
    }

    // 3) Insert order
    const { rows: orderRows } = await pool.query(`
      INSERT INTO orders
        (marketer_id, product_id, stock_update_id,
         number_of_devices, sold_amount,
         customer_name, customer_phone, customer_address,
         bnpl_platform, sale_date, created_at)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
      RETURNING *
    `, [
      marketerId,
      pid,
      stock_update_id || null,
      number_of_devices,
      sold_amount,
      customer_name,
      customer_phone,
      customer_address,
      bnpl_platform || null
    ]);

    // 4) If stock mode, mark that reservation “completed”:
    if (stock_update_id) {
      await pool.query(`
        UPDATE stock_updates
           SET status = 'completed'
         WHERE id = $1
      `, [stock_update_id]);
      // plus you could mark the corresponding inventory_items → 'sold' here
    }

    return res.status(201).json({
      message: "Order placed successfully.",
      order: orderRows[0]
    });
  } catch (err) {
    next(err);
  }
}

async function getOrderHistory(req, res, next) {
  const marketerId = req.user.id;
  const { rows } = await pool.query(
    `SELECT *
       FROM orders
      WHERE marketer_id = $1
   ORDER BY created_at DESC`,
    [marketerId]
  );
  return res.json({ orders: rows });
}


/**
 * submitBioData - Submits the marketer's bio data form.
 */
const submitBioData = async (req, res, next) => {
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
      account_no,
    } = req.body;

    const passport_photo = req.files && req.files["passport_photo"] ? req.files["passport_photo"][0].filename : null;
    const id_document_image = req.files && req.files["id_document"] ? req.files["id_document"][0].filename : null;

    if (!passport_photo) {
      return res.status(400).json({ message: "Passport photograph is required." });
    }
    if (!id_document_image) {
      return res.status(400).json({ message: "Identification document image is required." });
    }

    const query = `
      INSERT INTO marketer_bio_data 
      (
        marketer_id, name, address, phone_no, religion, date_of_birth, marital_status,
        state_of_origin, state_of_residence, mothers_maiden_name, school_attended,
        id_type, id_document_image, passport_photo,
        last_place_of_work, job_description, reason_for_quitting, medical_condition,
        next_of_kin_name, next_of_kin_phone, next_of_kin_address, next_of_kin_relationship,
        bank_name, account_name, account_no, created_at
      )
      VALUES 
      (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11,
        $12, $13, $14,
        $15, $16, $17, $18,
        $19, $20, $21, $22,
        $23, $24, $25, NOW()
      )
      RETURNING *
    `;
    const values = [
      marketerId,
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
      id_document_image,
      passport_photo,
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
      account_no,
    ];

    const result = await pool.query(query, values);
    res.status(201).json({
      message: "Bio data submitted successfully.",
      bioData: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * submitGuarantorForm - Processes the guarantor form submission.
 */
const submitGuarantorForm = async (req, res, next) => {
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
      guarantor_phone,
      guarantor_email,
    } = req.body;

    const isKnown = candidate_known && candidate_known.toLowerCase() === "yes";

    const id_document = req.files && req.files["id_document"] ? req.files["id_document"][0].filename : null;
    const passport_photo = req.files && req.files["passport_photo"] ? req.files["passport_photo"][0].filename : null;
    const signature = req.files && req.files["signature"] ? req.files["signature"][0].filename : null;

    if (!id_document || !passport_photo || !signature) {
      return res.status(400).json({ message: "All file uploads are required." });
    }

    const query = `
      INSERT INTO marketer_guarantor_form
      (
        marketer_id, candidate_known, relationship, years_known, occupation,
        guarantor_title, guarantor_full_name, guarantor_home_address, guarantor_office_address,
        employee_full_name, id_type, guarantor_id_doc, guarantor_passport_photo,
        guarantor_signature, guarantor_phone, guarantor_email, agreed, created_at
      )
      VALUES
      (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12, $13,
        $14, $15, $16, TRUE, NOW()
      )
      RETURNING *
    `;
    // Assuming id_type is provided in req.body.
    const values = [
      marketerId,
      isKnown,
      relationship,
      years_known,
      occupation,
      guarantor_title,
      guarantor_full_name,
      guarantor_home_address,
      guarantor_office_address,
      employee_full_name,
      req.body.id_type,
      id_document,
      passport_photo,
      signature,
      guarantor_phone,
      guarantor_email,
    ];

    const result = await pool.query(query, values);
    res.status(201).json({
      message: "Guarantor form submitted successfully.",
      guarantorForm: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * submitCommitmentForm - Processes the marketer's Commitment Form.
 */
const submitCommitmentForm = async (req, res, next) => {
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
      commitment_date,
    } = req.body;

    const parsePromise = (val) => val && val.toLowerCase() === "yes";
    const direct_sales_rep_signature = req.file && req.file.filename ? req.file.filename : null;
    if (!direct_sales_rep_signature) {
      return res.status(400).json({ message: "Direct Sales Rep signature is required." });
    }

    const query = `
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
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, NOW()
      )
      RETURNING *
    `;
    const values = [
      marketerId,
      parsePromise(promise_accept_false_documents),
      parsePromise(promise_request_unrelated_info),
      parsePromise(promise_no_customer_fees),
      parsePromise(promise_no_modify_contract),
      parsePromise(promise_no_sell_unapproved),
      parsePromise(promise_no_non_official_commitment),
      parsePromise(promise_no_operate_customer_account),
      parsePromise(promise_fraudulent_act_fire),
      parsePromise(promise_no_share_company_info),
      parsePromise(promise_recover_loan),
      parsePromise(promise_abide_system),
      direct_sales_rep_name,
      direct_sales_rep_signature,
      commitment_date,
    ];

    const result = await pool.query(query, values);
    res.status(201).json({
      message: "Commitment form submitted successfully.",
      commitmentForm: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getPlaceOrderData,
  createOrder,
  getOrderHistory,
  /* plus your other form‐submission functions: */
  submitBioData,
  submitGuarantorForm,
  submitCommitmentForm,
  getAccountSettings,
  updateAccountSettings,
};