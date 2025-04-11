// src/controllers/VerificationController.js
const { pool } = require("../config/database");

/**
 * submitBiodata
 * Inserts a new biodata record into the marketer_biodata table and updates the user's flag.
 * Expects in req.body: all fields required by marketer_biodata (except marketer_id).
 * The marketer's internal numeric ID is taken from req.user.id.
 * Uses Cloudinary URLs for the passport photo and the means of identification file
 * retrieved from req.files.
 */
const submitBiodata = async (req, res, next) => {
  try {
    const {
      name,
      address,
      phone,
      religion,            // In your form, religion can be a dropdown (e.g., "Christian", "Muslim")
      date_of_birth,
      marital_status,      // This can be a dropdown (e.g., "Single", "Married")
      state_of_origin,     // Dropdown of Nigerian states
      state_of_residence,  // Dropdown of Nigerian states
      mothers_maiden_name,
      school_attended,
      means_of_identification, // Dropdown selection: e.g., "NIN", "International Passport", or "Driver's License"
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
    
    // Retrieve Cloudinary URLs for uploaded files.
    // Expecting file fields:
    // - "passport_photo" for the passport photo.
    // - "identification_file" for the image of the selected means of identification.
    const passportPhotoUrl = req.files["passport_photo"]
      ? req.files["passport_photo"][0].path
      : null;
    const identificationFileUrl = req.files["identification_file"]
      ? req.files["identification_file"][0].path
      : null;
    
    // Get the marketer's internal numeric ID from the token.
    // (Your authentication should attach the user's internal id and unique id.)
    const marketerId = req.user.id;
    console.log("DEBUG => req.user:", req.user);
    if (!marketerId) {
      return res.status(400).json({ message: "User ID is missing from token." });
    }
    
    // Check if biodata has already been submitted.
    const checkQuery = "SELECT bio_submitted FROM users WHERE id = $1";
    const checkResult = await pool.query(checkQuery, [marketerId]);
    if (checkResult.rowCount > 0 && checkResult.rows[0].bio_submitted) {
      return res.status(400).json({ message: "Biodata form has already been submitted." });
    }
    
    // Convert empty date string to null if needed.
    const dob = date_of_birth === "" ? null : date_of_birth;
    
    // Build the INSERT query with all required fields.
    // Here we store the Cloudinary URL for passport photo and the identification file.
    // Depending on your schema, you may want to store the means_of_identification (the dropdown selection)
    // along with the uploaded file URL in a column (here we still use id_document_url as the column, but you could rename it).
    const query = `
      INSERT INTO marketer_biodata (
        marketer_id,
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
        id_document_url,        -- This column now stores the URL for the identification file.
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
        passport_photo_url,
        created_at,
        updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11,
        $12, $13, $14, $15,
        $16, $17, $18, $19,
        $20, $21, $22, $23,
        $24, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING *
    `;
    
    // Values array uses the Cloudinary URLs for file uploads.
    const values = [
      marketerId,           // Numeric id from req.user.id.
      name,
      address,
      phone,
      religion,
      dob,
      marital_status,
      state_of_origin,
      state_of_residence,
      mothers_maiden_name,
      school_attended,
      means_of_identification, // Dropdown value selection.
      identificationFileUrl,   // Cloudinary URL for the uploaded identification file.
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
      passportPhotoUrl,     // Cloudinary URL for the passport photo.
    ];
    
    const result = await pool.query(query, values);
    
    // Update the user's biodata flag so subsequent submissions are blocked.
    await pool.query(
      "UPDATE users SET bio_submitted = true, updated_at = NOW() WHERE id = $1",
      [marketerId]
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
 * Inserts a new guarantor record into the marketer_guarantor_form table and updates the user's flag.
 *
 * Expected form fields (in req.body):
 *   - is_candidate_well_known: e.g., "yes" or "no"
 *   - relationship: The relationship of the guarantor to the candidate.
 *   - known_duration: How long the guarantor has known the candidate.
 *   - occupation: The guarantor's occupation.
 *   - means_of_identification: Dropdown value ("NIN", "International Passport", "Driver's License").
 *   - guarantor_full_name: The full name of the guarantor.
 *   - guarantor_home_address: Guarantor's home address.
 *   - guarantor_office_address: Guarantor's office address.
 *   - guarantor_email: Guarantor's email address.
 *   - guarantor_phone: Guarantor's telephone number.
 *   - candidate_name: (Optional) The name of the candidate for whom the guarantor is attesting.
 *
 * Expected file uploads via Cloudinary (using multer):
 *   - "identification_file": The uploaded image for the selected identification (from the dropdown).
 *   - "signature": The uploaded signature image.
 *
 * The marketer's unique ID (from req.user.unique_id) is used for the form.
 */
const submitGuarantor = async (req, res, next) => {
  try {
    // Destructure expected fields from the request body.
    const {
      is_candidate_well_known,
      relationship,
      known_duration,
      occupation,
      means_of_identification, // Dropdown selection: "NIN", "International Passport", or "Driver's License"
      guarantor_full_name,
      guarantor_home_address,
      guarantor_office_address,
      guarantor_email,
      guarantor_phone,
      candidate_name // Optional: the candidate's name for which the guarantor is attesting
    } = req.body;
    
    // Retrieve Cloudinary URLs for uploaded files.
    // We expect two file fields:
    // - "identification_file": corresponding to the chosen means of identification.
    // - "signature": for the guarantor's signature image.
    const identificationFileUrl = req.files["identification_file"]
      ? req.files["identification_file"][0].path
      : null;
    const signatureUrl = req.files["signature"]
      ? req.files["signature"][0].path
      : null;
    
    // Get the marketer's unique ID from the token.
    // This value is stored in req.user.unique_id (set during authentication).
    const marketerUniqueId = req.user.unique_id;
    if (!marketerUniqueId) {
      return res.status(400).json({ message: "Marketer Unique ID is missing from token." });
    }
    
    // (Optional) Check if the guarantor form has already been submitted.
    // This query assumes that a flag field, such as guarantor_submitted, exists in the users table.
    const checkQuery = "SELECT guarantor_submitted FROM users WHERE unique_id = $1";
    const checkResult = await pool.query(checkQuery, [marketerUniqueId]);
    if (checkResult.rowCount > 0 && checkResult.rows[0].guarantor_submitted) {
      return res.status(400).json({ message: "Guarantor form has already been submitted." });
    }
    
    // Build the INSERT query for the guarantor form.
    // The table (guarantor_employment_form) is assumed to have a column named "marketer_unique_id"
    // that stores the marketer's unique ID.
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
      marketerUniqueId,          // Use the marketer's unique ID.
      is_candidate_well_known,
      relationship,
      known_duration,
      occupation,
      means_of_identification,
      identificationFileUrl,     // Cloudinary URL for the identification file.
      guarantor_full_name,
      guarantor_home_address,
      guarantor_office_address,
      guarantor_email,
      guarantor_phone,
      candidate_name || null,
      signatureUrl               // Cloudinary URL for the signature image.
    ];
    
    const result = await pool.query(query, values);
    
    // Update the user's flag for the guarantor form submission.
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
 * Inserts a new commitment record (Commitment Handbook) into the direct_sales_commitment_form table
 * and updates the marketer's submission flag.
 *
 * Expected form fields in req.body:
 *   - promise_accept_false_documents (e.g., "yes" or "no")
 *   - promise_not_request_unrelated_info
 *   - promise_not_charge_customer_fees
 *   - promise_not_modify_contract_info
 *   - promise_not_sell_unapproved_phones
 *   - promise_not_make_unofficial_commitment
 *   - promise_not_operate_customer_account
 *   - promise_accept_fraud_firing
 *   - promise_not_share_company_info
 *   - promise_ensure_loan_recovery
 *   - promise_abide_by_system
 *   - direct_sales_rep_name
 *   - date_signed (ISO date string or similar)
 *
 * It also expects an uploaded file (via Cloudinary) in the "signature" field that contains
 * the direct sales representative's signature image.
 *
 * The marketer's **unique ID** is taken from req.user.unique_id.
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
    
    // Retrieve Cloudinary URL for the uploaded signature image.
    // The file is expected under the field "signature".
    const directSalesRepSignatureUrl = req.files["signature"]
      ? req.files["signature"][0].path
      : null;
    
    if (!directSalesRepSignatureUrl) {
      return res.status(400).json({ message: "Direct Sales Rep signature image is required." });
    }
    
    // Use the marketer's unique ID from the token.
    const marketerUniqueId = req.user.unique_id;
    if (!marketerUniqueId) {
      return res.status(400).json({ message: "Marketer Unique ID is missing from token." });
    }
    
    // Helper function to convert yes/no responses to booleans.
    const parseBoolean = (val) => (val && val.toLowerCase() === "yes") ? true : false;
    
    // Build the SQL INSERT query for the direct_sales_commitment_form table.
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
      marketerUniqueId,                                // Marketer's unique ID
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
  submitCommitment

};
