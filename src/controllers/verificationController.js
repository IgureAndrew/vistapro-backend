// src/controllers/VerificationController.js

const { pool } = require("../config/database");
const uploadToCloudinary = require("../utils/uploadToCloudinary"); // Helper to upload file buffers to Cloudinary
const { sendSocketNotification } = require("../utils/notifications");

/**
 * submitBiodata
 * Inserts a new biodata record into the marketer_biodata table and updates the submission flag.
 * Expects text fields in req.body and two file uploads (as buffers) in req.files:
 * - "passport_photo": the passport photo.
 * - "id_document": the image for the selected means of identification.
 * Uses the marketer's unique ID (req.user.unique_id) for all records.
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
    
    // Initialize file URLs.
    let passportPhotoUrl = null;
    let identificationFileUrl = null;
    
    // Upload passport photo if provided.
    if (req.files && req.files["passport_photo"] && req.files["passport_photo"][0].buffer) {
      const uploadResult = await uploadToCloudinary(
        req.files["passport_photo"][0].buffer,
        { folder: "Vistaprouploads", allowed_formats: ["jpg", "jpeg", "png"] }
      );
      passportPhotoUrl = uploadResult.secure_url;
    }
    
    // Upload identification file if provided.
    if (req.files && req.files["id_document"] && req.files["id_document"][0].buffer) {
      const uploadResult = await uploadToCloudinary(
        req.files["id_document"][0].buffer,
        { folder: "Vistaprouploads", allowed_formats: ["jpg", "jpeg", "png"] }
      );
      identificationFileUrl = uploadResult.secure_url;
    }
    
    const marketerUniqueId = req.user.unique_id;
    if (!marketerUniqueId) {
      return res.status(400).json({ message: "Marketer Unique ID is missing from token." });
    }
    
    // Check if the marketer already submitted biodata.
    const checkQuery = "SELECT bio_submitted FROM users WHERE unique_id = $1";
    const checkResult = await pool.query(checkQuery, [marketerUniqueId]);
    if (checkResult.rowCount > 0 && checkResult.rows[0].bio_submitted) {
      return res.status(400).json({ message: "Biodata form has already been submitted." });
    }
    
    const dob = date_of_birth === "" ? null : date_of_birth;
    
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
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20, $21,
        $22, $23, $24, $25
      )
      RETURNING *
    `;
    
    const values = [
      marketerUniqueId,
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
      identificationFileUrl,
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
      passportPhotoUrl,
    ];
    
    const result = await pool.query(query, values);
    
    // Update marketer's submission flag.
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
 * Inserts a new record into the guarantor_employment_form table and updates the user's flag.
 * Expects text fields in req.body and file uploads in req.files:
 * - "identification_file": for the image of the selected identification.
 * - "signature": for the guarantor's signature image.
 * Uses the marketer's unique ID from req.user.unique_id.
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
      marketerUniqueId,
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
      signatureUrl,
    ];
    
    const result = await pool.query(query, values);
    
    // Update the flag.
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
 * Inserts a new record into the direct_sales_commitment_form table and updates the marketer's flag.
 * Expects text fields in req.body and a file upload via multer (as a buffer) under the field "signature".
 * Uses the marketer's unique ID from req.user.unique_id.
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
    
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: "Direct Sales Rep signature image is required." });
    }

    const uploadResult = await uploadToCloudinary(req.file.buffer, {
      folder: "Vistaprouploads",
      allowed_formats: ["jpg", "jpeg", "png"],
    });
    const directSalesRepSignatureUrl = uploadResult.secure_url;
    
    const marketerUniqueId = req.user.unique_id;
    if (!marketerUniqueId) {
      return res.status(400).json({ message: "Marketer Unique ID is missing from token." });
    }
    
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
    
    await pool.query(
      "UPDATE users SET commitment_submitted = true, updated_at = NOW() WHERE unique_id = $1",
      [marketerUniqueId]
    );
    
    // Check if all three forms are submitted and send a final notification.
    const statusQuery = "SELECT bio_submitted, guarantor_submitted, commitment_submitted FROM users WHERE unique_id = $1";
    const statusResult = await pool.query(statusQuery, [marketerUniqueId]);
    const { bio_submitted, guarantor_submitted, commitment_submitted } = statusResult.rows[0];
    
    if (bio_submitted && guarantor_submitted && commitment_submitted) {
      await sendSocketNotification(
        marketerUniqueId,
        "All your forms have been submitted successfully. Your submission is complete. You will be notified once reviewed and approved; your dashboard is now unlocked."
      );
    }
    
    res.status(201).json({
      message: "Commitment Handbook form submitted successfully.",
      commitment: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * updateBiodata
 * Allows a marketer to update their biodata record.
 * Accepts updated text fields (and optionally file uploads) in req.body/req.files.
 * Uses the marketer's unique ID from req.user.unique_id.
 */
const updateBiodata = async (req, res, next) => {
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
    
    const marketerUniqueId = req.user.unique_id;
    if (!marketerUniqueId) {
      return res.status(400).json({ message: "Marketer Unique ID is missing from token." });
    }
    
    const dob = date_of_birth === "" ? null : date_of_birth;
    
    const query = `
      UPDATE marketer_biodata
      SET name = $2,
          address = $3,
          phone = $4,
          religion = $5,
          date_of_birth = $6,
          marital_status = $7,
          state_of_origin = $8,
          state_of_residence = $9,
          mothers_maiden_name = $10,
          school_attended = $11,
          means_of_identification = $12,
          id_document_url = $13,
          last_place_of_work = $14,
          job_description = $15,
          reason_for_quitting = $16,
          medical_condition = $17,
          next_of_kin_name = $18,
          next_of_kin_phone = $19,
          next_of_kin_address = $20,
          next_of_kin_relationship = $21,
          bank_name = $22,
          account_name = $23,
          account_number = $24,
          passport_photo_url = $25,
          updated_at = NOW()
      WHERE marketer_unique_id = $1
      RETURNING *
    `;
    
    const values = [
      marketerUniqueId,
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
      identificationFileUrl,
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
      passportPhotoUrl,
    ];
    
    const result = await pool.query(query, values);
    
    res.status(200).json({
      message: "Biodata updated successfully.",
      biodata: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * allowRefillForm
 * Allows a Master Admin to reset a submission flag for a specific form type (biodata, guarantor, or commitment),
 * thereby letting the marketer re-submit (update) that form without starting all over.
 *
 * Expects in req.body: 
 *   - marketerUniqueId: The marketer’s unique ID.
 *   - formType: One of "biodata", "guarantor", or "commitment".
 */
const allowRefillForm = async (req, res, next) => {
  try {
    const { marketerUniqueId, formType } = req.body;
    if (!marketerUniqueId || !formType) {
      return res.status(400).json({ message: "Marketer Unique ID and form type are required." });
    }
    
    // Determine which flag to reset based on the formType value.
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
    
    // Reset the specified flag for the marketer.
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
 * adminReview
 * Allows an Admin to review a marketer's submitted forms.
 * Expects { marketerUniqueId, bioApproved, guarantorApproved, commitmentApproved, admin_review_report } in req.body.
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
      !!(bioApproved && bioApproved.toLowerCase() === "yes"),
      !!(guarantorApproved && guarantorApproved.toLowerCase() === "yes"),
      !!(commitmentApproved && commitmentApproved.toLowerCase() === "yes"),
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
 * Expects { marketerUniqueId, verified, superadmin_review_report } in req.body.
 * Only allows verification if the marketer is assigned to an admin whose super_admin_id matches the logged-in SuperAdmin.
 */
const superadminVerify = async (req, res, next) => {
  try {
    const { marketerUniqueId, verified, superadmin_review_report } = req.body;
    if (!marketerUniqueId) {
      return res.status(400).json({ message: "Marketer Unique ID is required." });
    }
    
    const superadminId = req.user.id;
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
    
    const overallStatus = (verified && verified.toLowerCase() === "yes") ? "superadmin verified" : "superadmin rejected";
    
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
 * masterApprove
 * Allows the Master Admin to give final approval to a marketer.
 * Expects { marketerUniqueId } in req.body.
 * Sets overall_verification_status to "approved", account_status to "active", and triggers (optional) notifications.
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
    // Optionally, you can trigger a notification to the marketer here.
    // For example:
    // await sendSocketNotification(marketerUniqueId, "Your account has been verified and approved. Your dashboard is now unlocked!");
    res.status(200).json({
      message: "Marketer final verification approved and dashboard unlocked.",
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
    const query = "DELETE FROM guarantor_employment_form WHERE id = $1 RETURNING *";
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
    const query = "DELETE FROM direct_sales_commitment_form WHERE id = $1 RETURNING *";
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
 * getBiodataSubmissionById
 * Retrieves a single biodata submission by its submission ID.
 * Joins marketer_biodata and users to provide additional marketer details.
 */
const getBiodataSubmissionById = async (req, res, next) => {
  try {
    const submissionId = req.params.id;
    const query = `
      SELECT 
        b.id AS biodata_submission_id,
        b.marketer_unique_id,
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
      JOIN users u ON b.marketer_unique_id = u.unique_id
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

const getAllSubmissionsForMasterAdmin = async (req, res, next) => {
  try {
    // Fetch submissions from all three forms without filtering by assignment.
    const biodataResult = await pool.query("SELECT * FROM marketer_biodata ORDER BY created_at DESC");
    const guarantorResult = await pool.query("SELECT * FROM guarantor_employment_form ORDER BY created_at DESC");
    const commitmentResult = await pool.query("SELECT * FROM direct_sales_commitment_form ORDER BY created_at DESC");

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
 * getSubmissionsForAdmin
 * Retrieves all submissions (biodata, guarantor, and commitment) for marketers assigned to the logged-in Admin.
 * Assumes that the marketers' records in the "users" table have an "admin_id" field that matches the logged-in Admin's id.
 */
const getSubmissionsForAdmin = async (req, res, next) => {
  try {
    const adminId = req.user.id; // Logged-in Admin's internal id
    // For simplicity, we fetch all submissions (biodata, guarantor, commitment) based on the marketer's "admin_id".
    // Biodata submissions.
    const biodataQuery = `
      SELECT mb.*
      FROM marketer_biodata mb
      JOIN users m ON mb.marketer_unique_id = m.unique_id
      WHERE m.admin_id = $1
      ORDER BY mb.created_at DESC
    `;
    const biodataResult = await pool.query(biodataQuery, [adminId]);

    // Guarantor submissions.
    const guarantorQuery = `
      SELECT ge.*
      FROM guarantor_employment_form ge
      JOIN users m ON ge.marketer_unique_id = m.unique_id
      WHERE m.admin_id = $1
      ORDER BY ge.created_at DESC
    `;
    const guarantorResult = await pool.query(guarantorQuery, [adminId]);

    // Commitment submissions.
    const commitmentQuery = `
      SELECT dc.*
      FROM direct_sales_commitment_form dc
      JOIN users m ON dc.marketer_unique_id = m.unique_id
      WHERE m.admin_id = $1
      ORDER BY dc.created_at DESC
    `;
    const commitmentResult = await pool.query(commitmentQuery, [adminId]);

    res.status(200).json({
      biodata: biodataResult.rows,
      guarantor: guarantorResult.rows,
      commitment: commitmentResult.rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * getSubmissionsForSuperAdmin
 * Retrieves all submissions (biodata, guarantor, and commitment) for marketers whose assigned admin is under the logged-in SuperAdmin.
 * Assumes that in the "users" table, an admin's record contains "super_admin_id" and that the marketer's "admin_id" links to that admin.
 */
const getSubmissionsForSuperAdmin = async (req, res, next) => {
  try {
    const superadminId = req.user.id; // Logged-in SuperAdmin's internal id

    // Biodata submissions.
    const biodataQuery = `
      SELECT mb.*
      FROM marketer_biodata mb
      JOIN users m ON mb.marketer_unique_id = m.unique_id
      JOIN users a ON m.admin_id = a.id
      WHERE a.super_admin_id = $1
      ORDER BY mb.created_at DESC
    `;
    const biodataResult = await pool.query(biodataQuery, [superadminId]);

    // Guarantor submissions.
    const guarantorQuery = `
      SELECT ge.*
      FROM guarantor_employment_form ge
      JOIN users m ON ge.marketer_unique_id = m.unique_id
      JOIN users a ON m.admin_id = a.id
      WHERE a.super_admin_id = $1
      ORDER BY ge.created_at DESC
    `;
    const guarantorResult = await pool.query(guarantorQuery, [superadminId]);

    // Commitment submissions.
    const commitmentQuery = `
      SELECT dc.*
      FROM direct_sales_commitment_form dc
      JOIN users m ON dc.marketer_unique_id = m.unique_id
      JOIN users a ON m.admin_id = a.id
      WHERE a.super_admin_id = $1
      ORDER BY dc.created_at DESC
    `;
    const commitmentResult = await pool.query(commitmentQuery, [superadminId]);

    res.status(200).json({
      biodata: biodataResult.rows,
      guarantor: guarantorResult.rows,
      commitment: commitmentResult.rows,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  // Submission endpoints.
  submitBiodata,
  submitGuarantor,
  submitCommitment,
  updateBiodata,
  allowRefillForm,
  // Review and approval endpoints.
  adminReview,
  superadminVerify,
  masterApprove,
  // Deletion endpoints.
  deleteBiodataSubmission,
  deleteGuarantorSubmission,
  deleteCommitmentSubmission,
  // GET endpoints.
  getBiodataSubmissionById,
  getAllSubmissionsForMasterAdmin,
  getSubmissionsForAdmin,
  getSubmissionsForSuperAdmin,
};
