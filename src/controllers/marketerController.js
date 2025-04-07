// src/controllers/marketerController.js
const bcrypt = require('bcrypt');
const { pool } = require('../config/database');
const { createUser } = require('../models/userModel');

/**
 * updateProfile - Allows a Marketer to update their profile details.
 */
const updateProfile = async (req, res, next) => {
  try {
    const marketerId = req.user.id;
    const { name, email, phone, newPassword } = req.body;

    let hashedPassword = null;
    if (newPassword) {
      const saltRounds = 10;
      hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    }

    const profileImage = req.file ? req.file.path : null;

    const query = `
      UPDATE users
      SET name = COALESCE($1, name),
          email = COALESCE($2, email),
          phone = COALESCE($3, phone),
          profile_image = COALESCE($4, profile_image),
          password = COALESCE($5, password),
          updated_at = NOW()
      WHERE id = $6
      RETURNING *
    `;
    const values = [name, email, phone, profileImage, hashedPassword, marketerId];
    const result = await pool.query(query, values);

    return res.status(200).json({
      message: 'Marketer profile updated successfully.',
      marketer: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * placeOrder - Allows a Marketer to record the sale (dispense) of device(s).
 * The function expects the following fields in req.body:
 *  - device_name, device_model, device_type (dropdown: "Android" or "iPhone"),
 *  - marketer_selling_price, number_of_devices, sold_amount,
 *  - customer_name, customer_phone, customer_address,
 *  - bnpl_platform (optional),
 *  - sale_date (optional; if not provided, current date/time is used)
 */
const placeOrder = async (req, res, next) => {
  try {
    const marketerId = req.user.id;
    const {
      device_name,
      device_model,
      device_type,
      marketer_selling_price,
      number_of_devices,
      sold_amount,
      customer_name,
      customer_phone,
      customer_address,
      bnpl_platform,
      sale_date,
    } = req.body;

    // Validate required fields
    if (
      !device_name ||
      !device_model ||
      !device_type ||
      !marketer_selling_price ||
      !number_of_devices ||
      !sold_amount ||
      !customer_name ||
      !customer_phone ||
      !customer_address
    ) {
      return res.status(400).json({ message: "All required order fields must be provided." });
    }

    // Use the provided sale_date or default to current date/time.
    const finalSaleDate = sale_date ? sale_date : new Date().toISOString();

    const query = `
      INSERT INTO orders (
        marketer_id,
        device_name,
        device_model,
        device_type,
        marketer_selling_price,
        number_of_devices,
        sold_amount,
        customer_name,
        customer_phone,
        customer_address,
        bnpl_platform,
        sale_date,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW())
      RETURNING *
    `;
    const values = [
      marketerId,
      device_name,
      device_model,
      device_type,
      dealer_cost_price,
      marketer_selling_price,
      number_of_devices,
      sold_amount,
      customer_name,
      customer_phone,
      customer_address,
      bnpl_platform || null,
      finalSaleDate,
    ];

    const result = await pool.query(query, values);

    return res.status(201).json({
      message: "Order placed successfully.",
      order: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * getOrders - Retrieves orders for the authenticated marketer.
 * This function uses the marketer's unique ID (from the token) to fetch their orders.
 */
const getOrders = async (req, res, next) => {
  try {
    // Retrieve the marketer's unique identifier from the token
    const marketerUniqueId = req.user.unique_id;

    // SQL query: join orders with users to filter by marketer's unique ID
    const query = `
      SELECT o.*, o.status
      FROM orders o
      JOIN users u ON o.marketer_id = u.id
      WHERE u.unique_id = $1
      ORDER BY o.created_at DESC
    `;
    const values = [marketerUniqueId];
    const result = await pool.query(query, values);

    // Return orders with their statuses.
    res.status(200).json({
      orders: result.rows,
      message: "Orders fetched successfully."
    });
  } catch (error) {
    next(error);
  }
};




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
    // Assuming id_type comes from req.body
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
  updateProfile,
  placeOrder,
  getOrders,
  submitBioData,
  submitGuarantorForm,
  submitCommitmentForm,
};
