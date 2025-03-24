// src/controllers/marketerController.js
const bcrypt = require('bcrypt');
const { pool } = require('../config/database');
const { createUser } = require('../models/userModel');

/**
 * updateProfile - Allows a Marketer to update their profile details.
 * Expects the Marketer's ID from req.user (populated by verifyToken middleware),
 * and fields like name, email, phone, and newPassword in req.body.
 * Optionally, a profile image upload can be handled via req.file.
 */
const updateProfile = async (req, res, next) => {
  try {
    const marketerId = req.user.id;
    const { name, email, phone, newPassword } = req.body;

    // If a new password is provided, hash it
    let hashedPassword = null;
    if (newPassword) {
      const saltRounds = 10;
      hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    }

    // Check for an uploaded profile image via Multer (if applicable)
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
 * placeOrder - Allows a Marketer to create an order for a sold device.
 * Expects the following fields in req.body:
 *  - device_name, device_model, device_imei, sold_amount,
 *  - customer details: customer_name, customer_phone, customer_address,
 *  - bnpl_platform (optional) and date/time are recorded automatically.
 */
const placeOrder = async (req, res, next) => {
  try {
    const marketerId = req.user.id;
    const {
      device_name,
      device_model,
      device_imei,
      sold_amount,
      customer_name,
      customer_phone,
      customer_address,
      bnpl_platform,
    } = req.body;

    // Validate required fields
    if (!device_name || !device_model || !device_imei || !sold_amount || !customer_name || !customer_phone || !customer_address) {
      return res.status(400).json({ message: 'All order fields are required.' });
    }

    // Insert a new order record
    const query = `
      INSERT INTO orders (marketer_id, device_name, device_model, device_imei, sold_amount, customer_name, customer_phone, customer_address, bnpl_platform, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      RETURNING *
    `;
    const values = [
      marketerId,
      device_name,
      device_model,
      device_imei,
      sold_amount,
      customer_name,
      customer_phone,
      customer_address,
      bnpl_platform,
    ];
    const result = await pool.query(query, values);

    return res.status(201).json({
      message: 'Order placed successfully.',
      order: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};
/**
 * submitBioData - Submits the marketer's bio data form.
 * Expects form fields via req.body and two file uploads:
 *  - "passport_photo": the passport photograph
 *  - "id_document": the identification document image (for the selected ID type)
 */
const submitBioData = async (req, res, next) => {
  try {
    const marketerId = req.user.id; // from authentication middleware

    // Destructure fields from req.body
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
      id_type, // should be one of: 'driver_license', 'voters_card', 'intl_passport', 'national_id', 'nin'
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

    // Get files from multer
    // We expect two file fields: passport_photo and id_document
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
 * Expects the following in the request:
 *   - Form fields in req.body:
 *       candidate_known, relationship, years_known, occupation,
 *       guarantor_title, guarantor_full_name, guarantor_home_address,
 *       guarantor_office_address, employee_full_name, guarantor_phone, guarantor_email
 *       and others as required.
 *   - File uploads (via multer in req.files):
 *       "id_document": the uploaded identification document image,
 *       "passport_photo": the guarantor’s passport photograph,
 *       "signature": the guarantor’s signature image.
 */
const submitGuarantorForm = async (req, res, next) => {
  try {
    const marketerId = req.user.id; // from authentication middleware

    // Destructure form fields from req.body
    const {
      candidate_known, // expected to be "yes" or "no"
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

    // Convert candidate_known to a boolean (assumes "yes" means true)
    const isKnown = candidate_known && candidate_known.toLowerCase() === "yes";

    // Retrieve file names from multer (using .fields())
    const id_document = req.files && req.files["id_document"] ? req.files["id_document"][0].filename : null;
    const passport_photo = req.files && req.files["passport_photo"] ? req.files["passport_photo"][0].filename : null;
    const signature = req.files && req.files["signature"] ? req.files["signature"][0].filename : null;

    if (!id_document || !passport_photo || !signature) {
      return res.status(400).json({
        message: "All file uploads (ID document, passport photo, signature) are required.",
      });
    }

    // id_type should come from a form field specifying which identification is provided.
    const { id_type } = req.body;
    if (!id_type) {
      return res.status(400).json({ message: "Identification type is required." });
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
      id_type,
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
 * Expects form fields in req.body and a file upload for the Direct Sales Rep signature.
 */
const submitCommitmentForm = async (req, res, next) => {
  try {
    const marketerId = req.user.id; // Assumes authentication middleware sets req.user
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

    // Convert promise responses from strings ("yes"/"no") to booleans
    const parsePromise = (val) => val && val.toLowerCase() === "yes";

    // Retrieve the signature file uploaded via multer (expects field "signature")
    const direct_sales_rep_signature =
      req.file && req.file.filename ? req.file.filename : null;
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
  submitBioData,
  submitGuarantorForm,
  submitCommitmentForm,
};
