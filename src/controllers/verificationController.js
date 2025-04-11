// src/controllers/VerificationController.js
const { pool } = require("../config/database");
const uploadToCloudinary = require("../utils/uploadToCloudinary"); // Helper to upload buffer to Cloudinary

/**
 * submitBiodata
 * Inserts a new biodata record into the marketer_biodata table and updates the user's flag.
 * Expects in req.body: all fields required by marketer_biodata (except marketer_unique_id).
 * The marketer's **unique ID** is taken from req.user.unique_id.
 * Files are uploaded via Cloudinary (passport photo under "passport_photo" and identification file under "id_document").
 */
const submitBiodata = async (req, res, next) => { 
  try {
    const {
      name,
      address,
      phone,
      religion,            // Dropdown: "Christian" or "Muslim"
      date_of_birth,
      marital_status,      // Dropdown: "Single" or "Married"
      state_of_origin,     // Dropdown of Nigerian states
      state_of_residence,  // Dropdown of Nigerian states
      mothers_maiden_name,
      school_attended,
      means_of_identification, // Dropdown selection (e.g., "NIN", "International Passport", "Driver's License")
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
      account_number,
    } = req.body;
    
    // For file uploads, we expect files to be available as buffers
    // (this requires that multer is configured to use memory storage).
    let passportPhotoUrl = null;
    let identificationFileUrl = null;
    
    if (req.files && req.files["passport_photo"] && req.files["passport_photo"][0].buffer) {
      const uploadResult = await uploadToCloudinary(
        req.files["passport_photo"][0].buffer,
        { folder: "Vistaprouploads", allowed_formats: ["jpg", "jpeg", "png"] }
      );
      passportPhotoUrl = uploadResult.secure_url;
    }
    
    if (req.files && req.files["id_document"] && req.files["id_document"][0].buffer) {
      const uploadResult = await uploadToCloudinary(
        req.files["id_document"][0].buffer,
        { folder: "Vistaprouploads", allowed_formats: ["jpg", "jpeg", "png"] }
      );
      identificationFileUrl = uploadResult.secure_url;
    }
    
    // Use the marketer's unique ID from req.user.
    const marketerUniqueId = req.user.unique_id;
    if (!marketerUniqueId) {
      return res.status(400).json({ message: "Marketer Unique ID is missing from token." });
    }
    
    // Check if biodata has already been submitted.
    const checkQuery = "SELECT bio_submitted FROM users WHERE unique_id = $1";
    const checkResult = await pool.query(checkQuery, [marketerUniqueId]);
    if (checkResult.rowCount > 0 && checkResult.rows[0].bio_submitted) {
      return res.status(400).json({ message: "Biodata form has already been submitted." });
    }
    
    // Convert empty date string to null if needed.
    const dob = date_of_birth === "" ? null : date_of_birth;
    
    // Build the INSERT query with exactly 25 placeholders corresponding to the 25 columns.
    const query = `
      INSERT INTO marketer_biodata (
        marketer_unique_id,
        name,
        address,
        phone,
        religion,
        date_of_birth,
        marital_status,
        state_of_origin,
        state_of_residence,
        mothers_maiden_name,
        school_attended,
        means_of_identification,
        id_document_url,
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
        account_number,
        passport_photo_url
      )
      VALUES (
        $1,  $2,  $3,  $4,  $5,  $6,  $7,
        $8,  $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20, $21,
        $22, $23, $24, $25
      )
      RETURNING *
    `;
    
    const values = [
      marketerUniqueId,           // Column 1: marketer_unique_id
      name,                       // 2: name
      address,                    // 3: address
      phone,                      // 4: phone
      religion,                   // 5: religion
      dob,                        // 6: date_of_birth
      marital_status,             // 7: marital_status
      state_of_origin,            // 8: state_of_origin
      state_of_residence,         // 9: state_of_residence
      mothers_maiden_name,        // 10: mothers_maiden_name
      school_attended,            // 11: school_attended
      means_of_identification,    // 12: means_of_identification
      identificationFileUrl,      // 13: id_document_url (now holds the identification file URL)
      last_place_of_work,         // 14: last_place_of_work
      job_description,            // 15: job_description
      reason_for_quitting,        // 16: reason_for_quitting
      medical_condition,          // 17: medical_condition
      next_of_kin_name,           // 18: next_of_kin_name
      next_of_kin_phone,          // 19: next_of_kin_phone
      next_of_kin_address,        // 20: next_of_kin_address
      next_of_kin_relationship,   // 21: next_of_kin_relationship
      bank_name,                  // 22: bank_name
      account_name,               // 23: account_name
      account_number,             // 24: account_number
      passportPhotoUrl            // 25: passport_photo_url
    ];
    
    const result = await pool.query(query, values);
    
    // Update the user's flag.
    await pool.query(
      "UPDATE users SET bio_submitted = true, updated_at = NOW() WHERE unique_id = $1",
      [marketerUniqueId]
    );
    
    res.status(201).json({
      message: "Biodata submitted successfully.",
      biodata: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * submitGuarantor
 * Inserts a new guarantor record into the guarantor_employment_form table and updates the user's flag.
 * Expected form fields (in req.body):
 *   - is_candidate_known, relationship, known_duration, occupation,
 *     means_of_identification, guarantor_full_name, guarantor_home_address,
 *     guarantor_office_address, guarantor_email, guarantor_phone, candidate_name.
 * Expected file uploads via Cloudinary:
 *   - "identification_file": The image file for the selected identification document.
 *   - "signature": The guarantor's signature image.
 * Uses the marketer's **unique ID** (from req.user.unique_id) for the submission.
 */
const submitGuarantor = async (req, res, next) => {
  try {
    const {
      is_candidate_known,
      relationship,
      known_duration,
      occupation,
      means_of_identification,
      guarantor_full_name,
      guarantor_home_address,
      guarantor_office_address,
      guarantor_email,
      guarantor_phone,
      candidate_name,
    } = req.body;
    
    // Retrieve Cloudinary URLs via our custom uploader. We assume files are available in memory.
    let identificationFileUrl = null;
    let signatureUrl = null;
    
    if (req.files && req.files["identification_file"] && req.files["identification_file"][0].buffer) {
      const uploadResult = await uploadToCloudinary(
        req.files["identification_file"][0].buffer,
        { folder: "Vistaprouploads", allowed_formats: ["jpg", "jpeg", "png"] }
      );
      identificationFileUrl = uploadResult.secure_url;
    }
    
    if (req.files && req.files["signature"] && req.files["signature"][0].buffer) {
      const uploadResult = await uploadToCloudinary(
        req.files["signature"][0].buffer,
        { folder: "Vistaprouploads", allowed_formats: ["jpg", "jpeg", "png"] }
      );
      signatureUrl = uploadResult.secure_url;
    }
    
    // Use the marketer's unique ID from the token.
    const marketerUniqueId = req.user.unique_id;
    if (!marketerUniqueId) {
      return res.status(400).json({ message: "Marketer Unique ID is missing from token." });
    }
    
    const checkQuery = "SELECT guarantor_submitted FROM users WHERE unique_id = $1";
    const checkResult = await pool.query(checkQuery, [marketerUniqueId]);
    if (checkResult.rowCount > 0 && checkResult.rows[0].guarantor_submitted) {
      return res.status(400).json({ message: "Guarantor form has already been submitted." });
    }
    
    const query = `
      INSERT INTO guarantor_employment_form (
        marketer_unique_id,
        is_candidate_known,
        relationship,
        known_duration,
        occupation,
        means_of_identification,
        identification_file_url,
        guarantor_full_name,
        guarantor_home_address,
        guarantor_office_address,
        guarantor_email,
        guarantor_phone,
        candidate_name,
        signature_url,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING *
    `;
    
    const values = [
      marketerUniqueId,          // Marketer's unique ID.
      is_candidate_known,
      relationship,
      known_duration,
      occupation,
      means_of_identification,
      identificationFileUrl,
      guarantor_full_name,
      guarantor_home_address,
      guarantor_office_address,
      guarantor_email,
      guarantor_phone,
      candidate_name || null,
      signatureUrl
    ];
    
    const result = await pool.query(query, values);
    
    await pool.query(
      "UPDATE users SET guarantor_submitted = true, updated_at = NOW() WHERE unique_id = $1",
      [marketerUniqueId]
    );
    
    res.status(201).json({
      message: "Guarantor form submitted successfully.",
      guarantor: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

/**
 * submitCommitment
 * Inserts a new commitment record into the direct_sales_commitment_form table and updates the marketer's flag.
 * Expects in req.body the necessary commitment fields.
 * Expects a file upload via multer (using memory storage) under the field "signature".
 * Uses the marketer's unique ID (from req.user.unique_id) for the submission.
 */
const submitCommitment = async (req, res, next) => {
  try {
    const {
      promise_accept_false_documents,
      promise_not_request_unrelated_info,
      promise_not_charge_customer_fees,
      promise_not_modify_contract_info,
      promise_not_sell_unapproved_phones,
      promise_not_make_unofficial_commitment,
      promise_not_operate_customer_account,
      promise_accept_fraud_firing,
      promise_not_share_company_info,
      promise_ensure_loan_recovery,
      promise_abide_by_system,
      direct_sales_rep_name,
      date_signed,
    } = req.body;
    
    // Check that a file was uploaded by verifying the buffer.
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: "Direct Sales Rep signature image is required." });
    }

    // Upload the file buffer to Cloudinary.
    const uploadResult = await uploadToCloudinary(req.file.buffer, {
      folder: "Vistaprouploads", // Your Cloudinary folder
      allowed_formats: ["jpg", "jpeg", "png"],
    });
    const directSalesRepSignatureUrl = uploadResult.secure_url;
    
    // Use the marketer's unique ID from the token.
    const marketerUniqueId = req.user.unique_id;
    if (!marketerUniqueId) {
      return res.status(400).json({ message: "Marketer Unique ID is missing from token." });
    }
    
    // Helper function to convert yes/no responses to booleans.
    const parseBoolean = (val) =>
      val && val.toLowerCase() === "yes" ? true : false;
    
    const query = `
      INSERT INTO direct_sales_commitment_form (
        marketer_unique_id,
        promise_accept_false_documents,
        promise_not_request_unrelated_info,
        promise_not_charge_customer_fees,
        promise_not_modify_contract_info,
        promise_not_sell_unapproved_phones,
        promise_not_make_unofficial_commitment,
        promise_not_operate_customer_account,
        promise_accept_fraud_firing,
        promise_not_share_company_info,
        promise_ensure_loan_recovery,
        promise_abide_by_system,
        direct_sales_rep_name,
        direct_sales_rep_signature_url,
        date_signed,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING *
    `;
    
    const values = [
      marketerUniqueId,
      parseBoolean(promise_accept_false_documents),
      parseBoolean(promise_not_request_unrelated_info),
      parseBoolean(promise_not_charge_customer_fees),
      parseBoolean(promise_not_modify_contract_info),
      parseBoolean(promise_not_sell_unapproved_phones),
      parseBoolean(promise_not_make_unofficial_commitment),
      parseBoolean(promise_not_operate_customer_account),
      parseBoolean(promise_accept_fraud_firing),
      parseBoolean(promise_not_share_company_info),
      parseBoolean(promise_ensure_loan_recovery),
      parseBoolean(promise_abide_by_system),
      direct_sales_rep_name,
      directSalesRepSignatureUrl,
      date_signed,
    ];
    
    const result = await pool.query(query, values);
    
    // Update the user's commitment submission flag.
    await pool.query(
      "UPDATE users SET commitment_submitted = true, updated_at = NOW() WHERE unique_id = $1",
      [marketerUniqueId]
    );
    
    res.status(201).json({
      message: "Commitment Handbook form submitted successfully.",
      commitment: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};
module.exports = {
  submitBiodata,
  submitGuarantor,
  submitCommitment,
};
