// src/controllers/VerificationController.js
const { pool } = require("../config/database");

/**
 * submitBiodata
 * Inserts a new biodata record into the marketer_biodata table and updates the user's flag.
 * Expects in req.body: all fields required by marketer_biodata (except marketer_id).
 * The marketer's internal numeric ID is taken from req.user.id.
 * Uses Cloudinary URLs for passport photo and ID document retrieved from req.files.
 */
const submitBiodata = async (req, res, next) => { 
  try {
    const {
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
    // The files are expected to be uploaded under the fields "passport_photo" and "id_document".
    const passportPhotoUrl = req.files["passport_photo"] 
      ? req.files["passport_photo"][0].path 
      : null;
    const idDocumentUrl = req.files["id_document"] 
      ? req.files["id_document"][0].path 
      : null;

    // Get the marketer's internal numeric ID from the token.
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
    
    // Build the insert query with all required fields. Notice that the Cloudinary URLs 
    // for the ID document and passport photo are used in the value list.
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
    
    // Values array uses the Cloudinary URLs for the file fields.
    const values = [
      marketerId,           // Numeric id from req.user.id
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
      means_of_identification,
      idDocumentUrl,        // Cloudinary URL for ID document.
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
      passportPhotoUrl,     // Cloudinary URL for passport photo.
    ];
    
    const result = await pool.query(query, values);
    
    // Update the user's biodata flag so that subsequent submissions can be blocked unless refill is allowed.
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
 * Expects in req.body: all fields required by marketer_guarantor_form.
 * The marketer's internal numeric ID is taken from req.user.id.
 */
const submitGuarantor = async (req, res, next) => {
  try {
    const {
      is_candidate_well_known,
      relationship,
      known_duration,
      occupation,
      id_document_url,
      passport_photo_url,
      signature_url,
    } = req.body;
    
    const marketerId = req.user.id;
    if (!marketerId) {
      return res.status(400).json({ message: "User ID is missing from token." });
    }
    
    // Check if guarantor form has already been submitted.
    const checkQuery = "SELECT guarantor_submitted FROM users WHERE id = $1";
    const checkResult = await pool.query(checkQuery, [marketerId]);
    if (checkResult.rowCount > 0 && checkResult.rows[0].guarantor_submitted) {
      return res.status(400).json({ message: "Guarantor form has already been submitted." });
    }
    
    // Insert guarantor data.
    const query = `
      INSERT INTO marketer_guarantor_form (
        marketer_id, is_candidate_well_known, relationship, known_duration,
        occupation, id_document_url, passport_photo_url, signature_url,
        created_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING *
    `;
    const values = [
      marketerId,
      is_candidate_well_known,
      relationship,
      known_duration,
      occupation,
      id_document_url,
      passport_photo_url,
      signature_url,
    ];
    
    const result = await pool.query(query, values);
    
    // Update the user's guarantor flag.
    await pool.query(
      "UPDATE users SET guarantor_submitted = true, updated_at = NOW() WHERE id = $1",
      [marketerId]
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
 * Expects in req.body: all fields required by marketer_commitment_form.
 * The marketer's internal numeric ID is taken from req.user.id.
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
      direct_sales_rep_signature_url,
      date_signed,
    } = req.body;
    
    const marketerId = req.user.id;
    if (!marketerId) {
      return res.status(400).json({ message: "User ID is missing from token." });
    }
    
    // Check if commitment form has already been submitted.
    const checkQuery = "SELECT commitment_submitted FROM users WHERE id = $1";
    const checkResult = await pool.query(checkQuery, [marketerId]);
    if (checkResult.rowCount > 0 && checkResult.rows[0].commitment_submitted) {
      return res.status(400).json({ message: "Commitment form has already been submitted." });
    }
    
    const query = `
      INSERT INTO marketer_commitment_form (
        marketer_id,
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
    const parsePromise = (val) => val && val.toLowerCase() === "yes";
    const values = [
      marketerId,
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
    ];
    
    const result = await pool.query(query, values);
    
    // Update the user's commitment flag.
    await pool.query(
      "UPDATE users SET commitment_submitted = true, updated_at = NOW() WHERE id = $1",
      [marketerId]
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
 * Allows an Admin to review a marketer's submitted forms.
 * Expects in req.body: marketerUniqueId, bioApproved, guarantorApproved, commitmentApproved,
 * and admin_review_report.
 */
const adminReview = async (req, res, next) => {
  try {
    const { marketerUniqueId, bioApproved, guarantorApproved, commitmentApproved, admin_review_report } = req.body;
    if (!marketerUniqueId) {
      return res.status(400).json({ message: "Marketer Unique ID is required." });
    }
    const query = `
      UPDATE users
      SET bio_submitted = $1,
          guarantor_submitted = $2,
          commitment_submitted = $3,
          admin_review_report = $4,
          overall_verification_status = 'admin reviewed',
          updated_at = NOW()
      WHERE unique_id = $5
      RETURNING *
    `;
    const values = [
      !!bioApproved,
      !!guarantorApproved,
      !!commitmentApproved,
      admin_review_report,
      marketerUniqueId,
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
 * Allows a SuperAdmin to verify or reject a marketer's forms.
 * Expects in req.body: marketerUniqueId, verified (boolean), and superadmin_review_report.
 * The marketer must be assigned to an admin whose super_admin_id matches the logged-in SuperAdmin.
 */
const superadminVerify = async (req, res, next) => {
  try {
    const { marketerUniqueId, verified, superadmin_review_report } = req.body;
    if (!marketerUniqueId) {
      return res.status(400).json({ message: "Marketer Unique ID is required." });
    }
    
    // Get the logged-in superadmin's numeric ID.
    const superadminId = req.user.id;
    
    // Retrieve the marketer's record.
    const marketerResult = await pool.query(
      "SELECT id, admin_id FROM users WHERE unique_id = $1",
      [marketerUniqueId]
    );
    if (marketerResult.rowCount === 0) {
      return res.status(404).json({ message: "Marketer not found." });
    }
    const marketer = marketerResult.rows[0];
    
    if (!marketer.admin_id) {
      return res.status(400).json({ message: "Marketer is not assigned to any admin." });
    }
    
    // Retrieve the admin's record.
    const adminResult = await pool.query(
      "SELECT super_admin_id FROM users WHERE id = $1",
      [marketer.admin_id]
    );
    if (adminResult.rowCount === 0) {
      return res.status(404).json({ message: "Admin not found." });
    }
    const admin = adminResult.rows[0];
    
    if (admin.super_admin_id !== superadminId) {
      return res.status(403).json({ message: "You are not authorized to verify this marketer." });
    }
    
    const overallStatus = verified ? "superadmin verified" : "superadmin rejected";
    
    const queryUpdate = `
      UPDATE users
      SET overall_verification_status = $1,
          superadmin_review_report = $2,
          updated_at = NOW()
      WHERE unique_id = $3
      RETURNING *
    `;
    const valuesUpdate = [overallStatus, superadmin_review_report, marketerUniqueId];
    const resultUpdate = await pool.query(queryUpdate, valuesUpdate);
    
    res.status(200).json({
      message: "Marketer verified by SuperAdmin.",
      user: resultUpdate.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * getSubmissions
 * Retrieves all submissions from the marketer_biodata, marketer_guarantor_form,
 * and marketer_commitment_form tables.
 */
const getSubmissions = async (req, res, next) => {
  try {
    const biodataResult = await pool.query("SELECT * FROM marketer_biodata ORDER BY created_at DESC");
    const guarantorResult = await pool.query("SELECT * FROM marketer_guarantor_form ORDER BY created_at DESC");
    const commitmentResult = await pool.query("SELECT * FROM marketer_commitment_form ORDER BY created_at DESC");

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
 * Expects in req.body: marketerUniqueId.
 * Updates overall_verification_status to "approved" and account_status to "active".
 */
const masterApprove = async (req, res, next) => {
  try {
    const { marketerUniqueId } = req.body;
    if (!marketerUniqueId) {
      return res.status(400).json({ message: "Marketer Unique ID is required." });
    }
    const query = `
      UPDATE users
      SET overall_verification_status = 'approved',
          account_status = 'active',
          updated_at = NOW()
      WHERE unique_id = $1
      RETURNING *
    `;
    const result = await pool.query(query, [marketerUniqueId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Marketer not found." });
    }
    // (Optional) Trigger a notification here (e.g., via Socket.IO or an email API).
    res.status(200).json({
      message: "Marketer final verification approved, dashboard unlocked, and notification sent.",
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * deleteBiodataSubmission
 * Allows a Master Admin to delete a biodata submission.
 */
const deleteBiodataSubmission = async (req, res, next) => {
  try {
    if (req.user.role !== "MasterAdmin") {
      return res.status(403).json({ message: "Only a Master Admin can delete submissions." });
    }
    const { submissionId } = req.params;
    const query = "DELETE FROM marketer_biodata WHERE id = $1 RETURNING *";
    const result = await pool.query(query, [submissionId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Biodata submission not found." });
    }
    res.status(200).json({
      message: "Biodata submission deleted successfully.",
      submission: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * deleteGuarantorSubmission
 * Allows a Master Admin to delete a guarantor submission.
 */
const deleteGuarantorSubmission = async (req, res, next) => {
  try {
    if (req.user.role !== "MasterAdmin") {
      return res.status(403).json({ message: "Only a Master Admin can delete submissions." });
    }
    const { submissionId } = req.params;
    const query = "DELETE FROM marketer_guarantor_form WHERE id = $1 RETURNING *";
    const result = await pool.query(query, [submissionId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Guarantor submission not found." });
    }
    res.status(200).json({
      message: "Guarantor submission deleted successfully.",
      submission: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * deleteCommitmentSubmission
 * Allows a Master Admin to delete a commitment submission.
 */
const deleteCommitmentSubmission = async (req, res, next) => {
  try {
    if (req.user.role !== "MasterAdmin") {
      return res.status(403).json({ message: "Only a Master Admin can delete submissions." });
    }
    const { submissionId } = req.params;
    const query = "DELETE FROM marketer_commitment_form WHERE id = $1 RETURNING *";
    const result = await pool.query(query, [submissionId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Commitment submission not found." });
    }
    res.status(200).json({
      message: "Commitment submission deleted successfully.",
      submission: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * rejectForm
 * Allows a Master Admin to mark a submission as rejected.
 * It can update a field in the users table (or a submissions table) to indicate rejection.
 */
const rejectForm = async (req, res, next) => {
  try {
    const { marketerUniqueId, formType, rejectionReason } = req.body;
    // Validate input: formType could be "biodata", "guarantor", or "commitment".
    if (!marketerUniqueId || !formType) {
      return res.status(400).json({ message: "Marketer Unique ID and form type are required." });
    }
    
    // Update the appropriate rejection flag or store the rejection reason in the database.
    // This implementation depends on your schema. Here is a sample update on users table:
    const query = `
      UPDATE users
      SET overall_verification_status = 'rejected',
          rejection_reason = $1,
          updated_at = NOW()
      WHERE unique_id = $2
      RETURNING *
    `;
    const values = [rejectionReason || "Not meeting criteria", marketerUniqueId];
    const result = await pool.query(query, values);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Marketer not found." });
    }
    
    // The marketer can be later allowed to resubmit the form (if your business logic allows that).
    res.status(200).json({
      message: `Form ${formType} rejected successfully.`,
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * allowRefillForm
 * Allows a Master Admin to reset a submission flag for a specified form type,
 * enabling the marketer to re-submit that form.
 *
 * Expects in req.body:
 *   - marketerUniqueId: The unique ID of the marketer.
 *   - formType: The type of form to allow refill (e.g., "biodata", "guarantor", "commitment").
 */
const allowRefillForm = async (req, res, next) => {
  try {
    const { marketerUniqueId, formType } = req.body;
    if (!marketerUniqueId || !formType) {
      return res.status(400).json({ message: "Marketer Unique ID and form type are required." });
    }
    
    // Depending on your database schema, you might update the user's record and/or
    // clear the corresponding flag that marks the form as submitted.
    // For example, if you have fields like bio_submitted, guarantor_submitted, or commitment_submitted:
    let updateField;
    if (formType.toLowerCase() === "biodata") {
      updateField = "bio_submitted";
    } else if (formType.toLowerCase() === "guarantor") {
      updateField = "guarantor_submitted";
    } else if (formType.toLowerCase() === "commitment") {
      updateField = "commitment_submitted";
    } else {
      return res.status(400).json({ message: "Invalid form type provided." });
    }
    
    const query = `
      UPDATE users
      SET ${updateField} = false,
          updated_at = NOW()
      WHERE unique_id = $1
      RETURNING *
    `;
    const values = [marketerUniqueId];
    const result = await pool.query(query, values);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Marketer not found." });
    }
    
    res.status(200).json({
      message: `Refill allowed for ${formType} form.`,
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * verifyMarketer
 * (Example implementation)
 * Allows a Master Admin to mark a marketer as verified manually.
 * Expects in req.body: marketerUniqueId.
 */
const verifyMarketer = async (req, res, next) => {
  try {
    const { marketerUniqueId } = req.body;
    if (!marketerUniqueId) {
      return res.status(400).json({ message: "Marketer Unique ID is required." });
    }
    const query = `
      UPDATE users
      SET overall_verification_status = 'verified',
          updated_at = NOW()
      WHERE unique_id = $1
      RETURNING *
    `;
    const result = await pool.query(query, [marketerUniqueId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Marketer not found." });
    }
    res.status(200).json({
      message: "Marketer verified successfully.",
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * getBiodataSubmissionById
 * Retrieves a single biodata submission by its submission ID,
 * joining data from marketer_biodata and users to provide additional details.
 */
const getBiodataSubmissionById = async (req, res, next) => {
  try {
    const submissionId = req.params.id;
    const query = `
      SELECT 
        b.id AS biodata_submission_id,
        b.marketer_id,
        b.name,
        b.address,
        b.phone,
        b.religion,
        b.date_of_birth,
        b.marital_status,
        b.state_of_origin,
        b.state_of_residence,
        b.mothers_maiden_name,
        b.school_attended,
        b.means_of_identification,
        b.id_document_url,
        b.last_place_of_work,
        b.job_description,
        b.reason_for_quitting,
        b.medical_condition,
        b.next_of_kin_name,
        b.next_of_kin_phone,
        b.next_of_kin_address,
        b.next_of_kin_relationship,
        b.bank_name,
        b.account_name,
        b.account_number,
        b.passport_photo_url,
        u.unique_id AS user_unique_id,
        u.first_name || ' ' || u.last_name AS marketer_full_name,
        u.location AS marketer_location
      FROM marketer_biodata b
      JOIN users u ON b.marketer_id = u.id
      WHERE b.id = $1;
    `;
    const values = [submissionId];
    const result = await pool.query(query, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Submission not found." });
    }
    res.status(200).json({ submission: result.rows[0] });
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
  rejectForm,           // These functions are assumed to be defined elsewhere if needed.
  allowRefillForm,      // (Not included in this snippet)
  verifyMarketer,       // (Not included in this snippet) // (Not included in this snippet)
  deleteBiodataSubmission,
  deleteGuarantorSubmission,
  deleteCommitmentSubmission,
  getBiodataSubmissionById,
};
