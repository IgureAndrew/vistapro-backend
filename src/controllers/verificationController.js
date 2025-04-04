// src/controllers/VerificationController.js
const { pool } = require("../config/database");


/**
 * submitBiodata
 * Inserts a new biodata record into the marketer_biodata table and updates the user's flag.
 * Expects in req.body: all fields required by marketer_biodata and marketer_id (unique ID).
 */
const submitBiodata = async (req, res, next) => {
  try {
    const {
      marketer_id, // This now holds the marketer's unique ID
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
      passport_photo_url,
    } = req.body;

    // The query uses a subquery to convert the unique ID to the numeric ID.
    const query = `
      INSERT INTO marketer_biodata (
        marketer_id, name, address, phone, religion, date_of_birth, marital_status,
        state_of_origin, state_of_residence, mothers_maiden_name, school_attended,
        means_of_identification, id_document_url, last_place_of_work, job_description,
        reason_for_quitting, medical_condition, next_of_kin_name, next_of_kin_phone,
        next_of_kin_address, next_of_kin_relationship, bank_name, account_name,
        account_number, passport_photo_url, created_at, updated_at
      )
      VALUES (
        (SELECT id FROM users WHERE unique_id = $1),
        $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11,
        $12, $13, $14, $15,
        $16, $17, $18, $19,
        $20, $21, $22, $23,
        $24, $25, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING *
    `;
    const values = [
      marketer_id,       // $1
      name,              // $2
      address,           // $3
      phone,             // $4
      religion,          // $5
      date_of_birth,     // $6
      marital_status,    // $7
      state_of_origin,   // $8
      state_of_residence,// $9
      mothers_maiden_name, // $10
      school_attended,   // $11
      means_of_identification, // $12
      id_document_url,   // $13
      last_place_of_work,// $14
      job_description,   // $15
      reason_for_quitting, // $16
      medical_condition, // $17
      next_of_kin_name,  // $18
      next_of_kin_phone, // $19
      next_of_kin_address, // $20
      next_of_kin_relationship, // $21
      bank_name,         // $22
      account_name,      // $23
      account_number,    // $24
      passport_photo_url // $25
      // CURRENT_TIMESTAMP and CURRENT_TIMESTAMP are hard-coded for $26 and $27
    ];

    const result = await pool.query(query, values);

    // Update the user's biodata flag using the unique ID
    await pool.query(
      "UPDATE users SET bio_submitted = true, updated_at = NOW() WHERE unique_id = $1",
      [marketer_id]
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
 * Expects in req.body: all fields required by marketer_guarantor_form and marketer_id (unique ID).
 */
const submitGuarantor = async (req, res, next) => {
  try {
    const {
      marketer_id, // Unique ID of the marketer
      is_candidate_well_known,
      relationship,
      known_duration,
      occupation,
      id_document_url,
      passport_photo_url,
      signature_url,
    } = req.body;

    const query = `
      INSERT INTO marketer_guarantor_form (
        marketer_id, is_candidate_well_known, relationship, known_duration,
        occupation, id_document_url, passport_photo_url, signature_url,
        created_at, updated_at
      )
      VALUES (
        (SELECT id FROM users WHERE unique_id = $1),
        $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING *
    `;
    const values = [
      marketer_id,
      is_candidate_well_known,
      relationship,
      known_duration,
      occupation,
      id_document_url,
      passport_photo_url,
      signature_url,
    ];

    const result = await pool.query(query, values);

    // Update the user's guarantor flag using unique ID
    await pool.query(
      "UPDATE users SET guarantor_submitted = true, updated_at = NOW() WHERE unique_id = $1",
      [marketer_id]
    );

    res.status(201).json({
      message: "Guarantor form submitted successfully.",
      guarantor: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * submitCommitment
 * Inserts a new commitment record into the marketer_commitment_form table and updates the user's flag.
 * Expects in req.body: all fields required by marketer_commitment_form and marketer_id (unique ID).
 */
const submitCommitment = async (req, res, next) => {
  try {
    const {
      marketer_id, // Unique ID of the marketer
      promise_accept_false_documents,
      promise_not_request_irrelevant_info,
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
    } = req.body;

    const query = `
      INSERT INTO marketer_commitment_form (
        marketer_id,
        promise_accept_false_documents,
        promise_not_request_irrelevant_info,
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
        (SELECT id FROM users WHERE unique_id = $1),
        $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING *
    `;
    const values = [
      marketer_id,
      promise_accept_false_documents,
      promise_not_request_irrelevant_info,
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
    ];

    const result = await pool.query(query, values);

    // Update the user's commitment flag using unique ID
    await pool.query(
      "UPDATE users SET commitment_submitted = true, updated_at = NOW() WHERE unique_id = $1",
      [marketer_id]
    );

    res.status(201).json({
      message: "Commitment form submitted successfully.",
      commitment: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * adminReview
 * Allows the Admin to review a marketer's submitted forms.
 * Expects in req.body: marketerId, bioApproved, guarantorApproved, commitmentApproved.
 */
const adminReview = async (req, res, next) => {
  try {
    const { marketerId, bioApproved, guarantorApproved, commitmentApproved } = req.body;
    if (!marketerId) {
      return res.status(400).json({ message: "Marketer ID is required." });
    }
    // Update the user's verification review flags and set status to 'admin reviewed'
    const query = `
      UPDATE users
      SET bio_submitted = $1,
          guarantor_submitted = $2,
          commitment_submitted = $3,
          overall_verification_status = 'admin reviewed',
          updated_at = NOW()
      WHERE id = $4
      RETURNING *
    `;
    const values = [
      !!bioApproved,
      !!guarantorApproved,
      !!commitmentApproved,
      marketerId,
    ];
    const result = await pool.query(query, values);
    res.status(200).json({
      message: "Marketer reviewed by Admin.",
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * superadminVerify
 * Allows the SuperAdmin to cross-check the marketer's forms.
 * Expects in req.body: marketerId and a boolean verified flag.
 */
const superadminVerify = async (req, res, next) => {
  try {
    const { marketerId, verified } = req.body;
    if (!marketerId) {
      return res.status(400).json({ message: "Marketer ID is required." });
    }
    const status = verified ? "superadmin verified" : "superadmin rejected";
    const query = `
      UPDATE users
      SET overall_verification_status = $1,
          updated_at = NOW()
      WHERE id = $2
      RETURNING *
    `;
    const values = [status, marketerId];
    const result = await pool.query(query, values);
    res.status(200).json({
      message: "Marketer verified by SuperAdmin.",
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

const getSubmissions = async (req, res, next) => {
  try {
    // Fetch submissions from each table
    const biodataResult = await pool.query("SELECT * FROM marketer_biodata ORDER BY created_at DESC");
    const guarantorResult = await pool.query("SELECT * FROM marketer_guarantor_form ORDER BY created_at DESC");
    const commitmentResult = await pool.query("SELECT * FROM marketer_commitment_form ORDER BY created_at DESC");

    // Combine into one response object (you can adjust as needed)
    const submissions = {
      biodata: biodataResult.rows,
      guarantor: guarantorResult.rows,
      commitment: commitmentResult.rows,
    };

    res.status(200).json({ submissions });
  } catch (error) {
    next(error);
  }
};

/**
 * masterApprove
 * Allows the Master Admin to give final approval to a marketer.
 * Expects in req.body: marketerId.
 * Optionally, you could extend this to accept a decision (approved, pending, rejected).
 */
const masterApprove = async (req, res, next) => {
  try {
    const { marketerId } = req.body;
    if (!marketerId) {
      return res.status(400).json({ message: "Marketer ID is required." });
    }
    const query = `
      UPDATE users
      SET overall_verification_status = 'approved',
          account_status = 'active',
          updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `;
    const result = await pool.query(query, [marketerId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Marketer not found." });
    }
    res.status(200).json({
      message: "Marketer final verification approved.",
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  submitBiodata,
  submitGuarantor,
  submitCommitment,
  getSubmissions,
  adminReview,
  superadminVerify,
  masterApprove,
};
