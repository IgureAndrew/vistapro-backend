// src/controllers/VerificationController.js

const { pool } = require("../config/database");
const uploadToCloudinary = require("../utils/uploadToCloudinary"); // Helper to upload file buffers to Cloudinary
const sendSocketNotification = require("../utils/sendSocketNotification");

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
      name, address, phone, religion, date_of_birth, marital_status,
      state_of_origin, state_of_residence, mothers_maiden_name,
      school_attended, means_of_identification, last_place_of_work,
      job_description, reason_for_quitting, medical_condition,
      next_of_kin_name, next_of_kin_phone, next_of_kin_address,
      next_of_kin_relationship, bank_name, account_name,
      account_number,
    } = req.body;

    let passportPhotoUrl = null;
    let identificationFileUrl = null;
    if (req.files?.passport_photo?.[0]?.buffer) {
      const uploadResult = await uploadToCloudinary(
        req.files.passport_photo[0].buffer,
        { folder: "Vistaprouploads", allowed_formats: ["jpg", "jpeg", "png"] }
      );
      passportPhotoUrl = uploadResult.secure_url;
    }
    if (req.files?.id_document?.[0]?.buffer) {
      const uploadResult = await uploadToCloudinary(
        req.files.id_document[0].buffer,
        { folder: "Vistaprouploads", allowed_formats: ["jpg", "jpeg", "png"] }
      );
      identificationFileUrl = uploadResult.secure_url;
    }

    const marketerUniqueId = req.user.unique_id;
    if (!marketerUniqueId) {
      return res.status(400).json({ field: null, message: "Marketer Unique ID is missing." });
    }

    // Prevent duplicate submission
    const checkResult = await pool.query(
      "SELECT bio_submitted FROM users WHERE unique_id = $1",
      [marketerUniqueId]
    );
    if (checkResult.rows[0]?.bio_submitted) {
      return res.status(400).json({ field: null, message: "Biodata form has already been submitted." });
    }

    const dob = date_of_birth === "" ? null : date_of_birth;
    const insertQuery = `
      INSERT INTO marketer_biodata (
        marketer_unique_id, name, address, phone, religion,
        date_of_birth, marital_status, state_of_origin,
        state_of_residence, mothers_maiden_name, school_attended,
        means_of_identification, id_document_url, last_place_of_work,
        job_description, reason_for_quitting, medical_condition,
        next_of_kin_name, next_of_kin_phone, next_of_kin_address,
        next_of_kin_relationship, bank_name, account_name,
        account_number, passport_photo_url
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8,
        $9, $10, $11,
        $12, $13, $14,
        $15, $16, $17,
        $18, $19, $20,
        $21, $22, $23,
        $24, $25
      )
      RETURNING *;
    `;
    const values = [
      marketerUniqueId, name, address, phone, religion,
      dob, marital_status, state_of_origin,
      state_of_residence, mothers_maiden_name, school_attended,
      means_of_identification, identificationFileUrl, last_place_of_work,
      job_description, reason_for_quitting, medical_condition,
      next_of_kin_name, next_of_kin_phone, next_of_kin_address,
      next_of_kin_relationship, bank_name, account_name,
      account_number, passportPhotoUrl,
    ];

    let result;
    try {
      result = await pool.query(insertQuery, values);
    } catch (error) {
      if (error.code === "23505") {
        if (error.constraint === "users_phone_key") {
          return res.status(400).json({
            field: "phone",
            message: "That phone number is already in use."
          });
        }
        if (error.constraint === "users_account_number_key") {
          return res.status(400).json({
            field: "account_number",
            message: "That account number is already in use."
          });
        }
      }
      return next(error);
    }

    // Mark flag true
    const updatedUserResult = await pool.query(
      "UPDATE users SET bio_submitted = TRUE, updated_at = NOW() WHERE unique_id = $1 RETURNING *",
      [marketerUniqueId]
    );

    res.status(201).json({
      message: "Biodata submitted successfully.",
      biodata: result.rows[0],
      updatedUser: updatedUserResult.rows[0],
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
      is_candidate_known, relationship, known_duration, occupation,
      means_of_identification, guarantor_full_name,
      guarantor_home_address, guarantor_office_address,
      guarantor_email, guarantor_phone, candidate_name
    } = req.body;

    let identificationFileUrl = null;
    let signatureUrl = null;
    if (req.files?.identification_file?.[0]?.buffer) {
      const uploadResult = await uploadToCloudinary(
        req.files.identification_file[0].buffer,
        { folder: "Vistaprouploads", allowed_formats: ["jpg", "jpeg", "png"] }
      );
      identificationFileUrl = uploadResult.secure_url;
    }
    if (req.files?.signature?.[0]?.buffer) {
      const uploadResult = await uploadToCloudinary(
        req.files.signature[0].buffer,
        { folder: "Vistaprouploads", allowed_formats: ["jpg", "jpeg", "png"] }
      );
      signatureUrl = uploadResult.secure_url;
    }

    const marketerUniqueId = req.user.unique_id;
    if (!marketerUniqueId) {
      return res.status(400).json({ field: null, message: "Marketer Unique ID is missing." });
    }

    const checkResult = await pool.query(
      "SELECT guarantor_submitted FROM users WHERE unique_id = $1",
      [marketerUniqueId]
    );
    if (checkResult.rows[0]?.guarantor_submitted) {
      return res.status(400).json({ field: null, message: "Guarantor form has already been submitted." });
    }

    const insertQuery = `
      INSERT INTO guarantor_employment_form (
        marketer_unique_id, is_candidate_known, relationship,
        known_duration, occupation, means_of_identification,
        identification_file_url, guarantor_full_name,
        guarantor_home_address, guarantor_office_address,
        guarantor_email, guarantor_phone, candidate_name,
        signature_url, created_at, updated_at
      ) VALUES (
        $1, $2, $3,
        $4, $5, $6,
        $7, $8,
        $9, $10,
        $11, $12, $13,
        $14, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      RETURNING *;
    `;
    const values = [
      marketerUniqueId, is_candidate_known, relationship,
      known_duration, occupation, means_of_identification,
      identificationFileUrl, guarantor_full_name,
      guarantor_home_address, guarantor_office_address,
      guarantor_email, guarantor_phone,
      candidate_name || null, signatureUrl
    ];

    let result;
    try {
      result = await pool.query(insertQuery, values);
    } catch (error) {
      if (error.code === "23505") {
        // example constraint name
        if (error.constraint === "guarantor_employment_form_identification_file_key") {
          return res.status(400).json({
            field: "identification_file",
            message: "That identification file has already been uploaded."
          });
        }
      }
      return next(error);
    }

    const updatedUserResult = await pool.query(
      "UPDATE users SET guarantor_submitted = TRUE, updated_at = NOW() WHERE unique_id = $1 RETURNING *",
      [marketerUniqueId]
    );

    res.status(201).json({
      message: "Guarantor form submitted successfully.",
      guarantor: result.rows[0],
      updatedUser: updatedUserResult.rows[0],
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
      date_signed
    } = req.body;

    if (!req.file?.buffer) {
      return res.status(400).json({ field: "signature", message: "Signature image is required." });
    }
    const uploadResult = await uploadToCloudinary(req.file.buffer, {
      folder: "Vistaprouploads", allowed_formats: ["jpg", "jpeg", "png"]
    });
    const signatureUrl = uploadResult.secure_url;

    const marketerUniqueId = req.user.unique_id;
    if (!marketerUniqueId) {
      return res.status(400).json({ field: null, message: "Marketer Unique ID is missing." });
    }

    const parseBool = val => (val?.toLowerCase() === "yes");
    const insertQuery = `
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
        created_at, updated_at
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
      )
      RETURNING *;
    `;
    const values = [
      marketerUniqueId,
      parseBool(promise_accept_false_documents),
      parseBool(promise_not_request_unrelated_info),
      parseBool(promise_not_charge_customer_fees),
      parseBool(promise_not_modify_contract_info),
      parseBool(promise_not_sell_unapproved_phones),
      parseBool(promise_not_make_unofficial_commitment),
      parseBool(promise_not_operate_customer_account),
      parseBool(promise_accept_fraud_firing),
      parseBool(promise_not_share_company_info),
      parseBool(promise_ensure_loan_recovery),
      parseBool(promise_abide_by_system),
      direct_sales_rep_name,
      signatureUrl,
      date_signed
    ];

    let result;
    try {
      result = await pool.query(insertQuery, values);
    } catch (error) {
      if (error.code === "23505" && error.constraint === "direct_sales_commitment_form_direct_sales_rep_name_key") {
        return res.status(400).json({
          field: "direct_sales_rep_name",
          message: "That Direct Sales Rep name has already been used."
        });
      }
      return next(error);
    }

    await pool.query(
      "UPDATE users SET commitment_submitted = TRUE, updated_at = NOW() WHERE unique_id = $1",
      [marketerUniqueId]
    );

    const { bio_submitted, guarantor_submitted, commitment_submitted } =
      (await pool.query(
        "SELECT bio_submitted, guarantor_submitted, commitment_submitted FROM users WHERE unique_id = $1",
        [marketerUniqueId]
      )).rows[0];

    if (bio_submitted && guarantor_submitted && commitment_submitted) {
      await sendSocketNotification(
        marketerUniqueId,
        "All your forms have been submitted successfully. Your submission is under review and your dashboard is unlocked.",
        req.app
      );
    }

    res.status(201).json({
      message: "Commitment form submitted successfully.",
      commitment: result.rows[0],
      updatedUser: { bio_submitted, guarantor_submitted, commitment_submitted }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * allowRefillForm
 * This endpoint allows a Master Admin to reset a submission flag for a specific form.
 * Optionally, if a submissionId is provided, the corresponding submission record is deleted.
 * Then it resets the appropriate flag in the users table.
 *
 * Input (from req.body):
 *   - marketerUniqueId: The unique ID of the marketer.
 *   - formType: A string ("biodata", "guarantor", or "commitment").
 *   - submissionId (optional): The ID of the submission record to delete.
 */
const allowRefillForm = async (req, res, next) => {
  try {
    const { marketerUniqueId, formType, submissionId } = req.body;
    if (!marketerUniqueId || !formType) {
      return res.status(400).json({ message: "Marketer Unique ID and form type are required." });
    }
    
    // Determine table and flag name.
    let tableName, flagName;
    if (formType.toLowerCase() === "biodata") {
      tableName = "marketer_biodata";
      flagName = "bio_submitted";
    } else if (formType.toLowerCase() === "guarantor") {
      tableName = "guarantor_employment_form";
      flagName = "guarantor_submitted";
    } else if (formType.toLowerCase() === "commitment") {
      tableName = "direct_sales_commitment_form";
      flagName = "commitment_submitted";
    } else {
      return res.status(400).json({ message: "Invalid form type provided." });
    }
    
    // Optionally delete the submission record.
    if (submissionId) {
      const deleteQuery = `DELETE FROM ${tableName} WHERE id = $1 RETURNING *`;
      const deleteResult = await pool.query(deleteQuery, [submissionId]);
      if (deleteResult.rowCount === 0) {
        return res.status(404).json({ message: "Submission not found." });
      }
    }
    
    // Reset the flag (and mark overall status as pending).
    const updateQuery = `
      UPDATE users
      SET ${flagName} = false,
          overall_verification_status = 'pending',
          updated_at = NOW()
      WHERE unique_id = $1
      RETURNING *
    `;
    const result = await pool.query(updateQuery, [marketerUniqueId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Marketer not found." });
    }
    
    // Emit a Socket.IO event to notify the marketer.
    const io = req.app.get('socketio');
    if (io) { marketerUniqueId,   
      io.to(marketerUniqueId).emit('formReset', {
        formType: formType.toLowerCase(),
        message: `Your ${formType} form has been reset. Please refill it.`
      });
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
 * Updates overall_verification_status to "approved".
 */
const masterApprove = async (req, res, next) => {
  try {
    if (req.user.role !== "MasterAdmin") {
      return res.status(403).json({ message: "Only a Master Admin can approve submissions." });
    }
    const { marketerUniqueId } = req.body;
    if (!marketerUniqueId) {
      return res.status(400).json({ message: "Marketer Unique ID is required." });
    }
    const query = `
      UPDATE users
      SET overall_verification_status = 'approved',
          updated_at = NOW()
      WHERE unique_id = $1
      RETURNING *
    `;
    const result = await pool.query(query, [marketerUniqueId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Marketer not found." });
    }
    sendSocketNotification(
      marketerUniqueId,
      "Your account has been approved and your dashboard is now unlocked!",
      req.app
    );
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
 */
const deleteBiodataSubmission = async (req, res, next) => {
  try {
    if (req.user.role !== "MasterAdmin") {
      return res.status(403).json({ message: "Only a Master Admin can delete submissions." });
    }
    const { submissionId } = req.params;
    const { marketerUniqueId } = req.body;
    if (!submissionId || !marketerUniqueId) {
      return res.status(400).json({ message: "Submission ID and marketerUniqueId are required." });
    }

    // 1) Delete the biodata record
    const deleteResult = await pool.query(
      "DELETE FROM marketer_biodata WHERE id = $1 RETURNING *",
      [submissionId]
    );
    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ message: "Biodata submission not found." });
    }

    // 2) Clear the flag and set overall status to pending
    const userResult = await pool.query(
      `UPDATE users
         SET bio_submitted = FALSE,
             overall_verification_status = 'pending',
             updated_at = NOW()
       WHERE unique_id = $1
       RETURNING *`,
      [marketerUniqueId]
    );

    // 3) Notify the marketer via WebSocket
    const io = req.app.get("socketio");
    if (io) {
      io.to(marketerUniqueId).emit("formReset", {
        formType: "biodata",
        message: "Your Biodata form has been reset by Master Admin. Please refill it."
      });
    }

    res.status(200).json({
      message: "Biodata submission deleted and reset.",
      deleted: deleteResult.rows[0],
      user: userResult.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

/**
 * deleteGuarantorSubmission
 */
const deleteGuarantorSubmission = async (req, res, next) => {
  try {
    if (req.user.role !== "MasterAdmin") {
      return res.status(403).json({ message: "Only a Master Admin can delete submissions." });
    }
    const { submissionId } = req.params;
    const { marketerUniqueId } = req.body;
    if (!submissionId || !marketerUniqueId) {
      return res.status(400).json({ message: "Submission ID and marketerUniqueId are required." });
    }

    // 1) Delete the guarantor record
    const deleteResult = await pool.query(
      "DELETE FROM guarantor_employment_form WHERE id = $1 RETURNING *",
      [submissionId]
    );
    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ message: "Guarantor submission not found." });
    }

    // 2) Clear the flag and reset overall status
    const userResult = await pool.query(
      `UPDATE users
         SET guarantor_submitted = FALSE,
             overall_verification_status = 'pending',
             updated_at = NOW()
       WHERE unique_id = $1
       RETURNING *`,
      [marketerUniqueId]
    );

    // 3) Notify via socket
    const io = req.app.get("socketio");
    if (io) {
      io.to(marketerUniqueId).emit("formReset", {
        formType: "guarantor",
        message: "Your Guarantor form has been reset by Master Admin. Please refill it."
      });
    }

    res.status(200).json({
      message: "Guarantor submission deleted and reset.",
      deleted: deleteResult.rows[0],
      user: userResult.rows[0]
    });
  } catch (error) {
    next(error);
  }
};
/**
 * deleteCommitmentSubmission
 */
const deleteCommitmentSubmission = async (req, res, next) => {
  try {
    if (req.user.role !== "MasterAdmin") {
      return res.status(403).json({ message: "Only a Master Admin can delete submissions." });
    }
    const { submissionId } = req.params;
    const { marketerUniqueId } = req.body;
    if (!submissionId || !marketerUniqueId) {
      return res.status(400).json({ message: "Submission ID and marketerUniqueId are required." });
    }

    // 1) Delete the commitment record
    const deleteResult = await pool.query(
      "DELETE FROM direct_sales_commitment_form WHERE id = $1 RETURNING *",
      [submissionId]
    );
    if (deleteResult.rowCount === 0) {
      return res.status(404).json({ message: "Commitment submission not found." });
    }

    // 2) Clear the flag and reset overall status
    const userResult = await pool.query(
      `UPDATE users
         SET commitment_submitted = FALSE,
             overall_verification_status = 'pending',
             updated_at = NOW()
       WHERE unique_id = $1
       RETURNING *`,
      [marketerUniqueId]
    );

    // 3) Notify via socket
    const io = req.app.get("socketio");
    if (io) {
      io.to(marketerUniqueId).emit("formReset", {
        formType: "commitment",
        message: "Your Commitment form has been reset by Master Admin. Please refill it."
      });
    }

    res.status(200).json({
      message: "Commitment submission deleted and reset.",
      deleted: deleteResult.rows[0],
      user: userResult.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

/**
 * getAllSubmissionsForMasterAdmin
 * Retrieves all submissions (biodata, guarantor, and commitment) with marketer's name and location
 * included, by joining with the users table using the marketer's unique ID.
 */
const getAllSubmissionsForMasterAdmin = async (req, res, next) => {
  try {
    const biodataQuery = `
      SELECT
        s.*,
        (u.first_name || ' ' || u.last_name) AS marketer_name,
        u.location AS marketer_location
      FROM marketer_biodata s
      JOIN users u ON s.marketer_unique_id = u.unique_id
      ORDER BY s.created_at DESC
    `;
    const biodataResult = await pool.query(biodataQuery);

    const guarantorQuery = `
      SELECT
        s.*,
        (u.first_name || ' ' || u.last_name) AS marketer_name,
        u.location AS marketer_location
      FROM guarantor_employment_form s
      JOIN users u ON s.marketer_unique_id = u.unique_id
      ORDER BY s.created_at DESC
    `;
    const guarantorResult = await pool.query(guarantorQuery);

    const commitmentQuery = `
      SELECT
        s.*,
        (u.first_name || ' ' || u.last_name) AS marketer_name,
        u.location AS marketer_location
      FROM direct_sales_commitment_form s
      JOIN users u ON s.marketer_unique_id = u.unique_id
      ORDER BY s.created_at DESC
    `;
    const commitmentResult = await pool.query(commitmentQuery);

    res.status(200).json({
      submissions: {
        biodata: biodataResult.rows,
        guarantor: guarantorResult.rows,
        commitment: commitmentResult.rows,
      },
    });
  } catch (error) {
    next(error);
  }
};

/**
 * getSubmissionsForAdmin
 * Retrieves all submissions for marketers assigned to the logged-in Admin.
 */
const getSubmissionsForAdmin = async (req, res, next) => {
  try {
    const adminId = req.user.id; // Logged-in Admin's numeric ID
    const biodataQuery = `
      SELECT mb.*
      FROM marketer_biodata mb
      JOIN users m ON mb.marketer_unique_id = m.unique_id
      WHERE m.admin_id = $1
      ORDER BY mb.created_at DESC
    `;
    const biodataResult = await pool.query(biodataQuery, [adminId]);

    const guarantorQuery = `
      SELECT ge.*
      FROM guarantor_employment_form ge
      JOIN users m ON ge.marketer_unique_id = m.unique_id
      WHERE m.admin_id = $1
      ORDER BY ge.created_at DESC
    `;
    const guarantorResult = await pool.query(guarantorQuery, [adminId]);

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
 * Retrieves all submissions for marketers whose assigned admin is under the logged-in SuperAdmin.
 */
const getSubmissionsForSuperAdmin = async (req, res, next) => {
  try {
    const superadminId = req.user.id; // Logged-in SuperAdmin's numeric ID

    const biodataQuery = `
      SELECT mb.*
      FROM marketer_biodata mb
      JOIN users m ON mb.marketer_unique_id = m.unique_id
      JOIN users a ON m.admin_id = a.id
      WHERE a.super_admin_id = $1
      ORDER BY mb.created_at DESC
    `;
    const biodataResult = await pool.query(biodataQuery, [superadminId]);

    const guarantorQuery = `
      SELECT ge.*
      FROM guarantor_employment_form ge
      JOIN users m ON ge.marketer_unique_id = m.unique_id
      JOIN users a ON m.admin_id = a.id
      WHERE a.super_admin_id = $1
      ORDER BY ge.created_at DESC
    `;
    const guarantorResult = await pool.query(guarantorQuery, [superadminId]);

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


/** 
 * === NEW SUCCESS-ONLY PATCH HANDLERS ===
 * These allow your frontend to simply do PATCH /verification/{form}-success
 * to flip the flag on the user record without re‑submitting the entire form.
 */

const biodataSuccess = async (req, res, next) => {
  try {
    const uniqueId = req.user.unique_id;
    await pool.query(
      `UPDATE users
         SET bio_submitted = TRUE,
             updated_at = NOW()
       WHERE unique_id = $1`,
      [uniqueId]
    );
    return res.sendStatus(204);
  } catch (err) {
    next(err);
  }
};

const guarantorSuccess = async (req, res, next) => {
  try {
    const uniqueId = req.user.unique_id;
    await pool.query(
      `UPDATE users
         SET guarantor_submitted = TRUE,
             updated_at = NOW()
       WHERE unique_id = $1`,
      [uniqueId]
    );
    return res.sendStatus(204);
  } catch (err) {
    next(err);
  }
};

const commitmentSuccess = async (req, res, next) => {
  try {
    const uniqueId = req.user.unique_id;
    await pool.query(
      `UPDATE users
         SET commitment_submitted = TRUE,
             updated_at = NOW()
       WHERE unique_id = $1`,
      [uniqueId]
    );
    return res.sendStatus(204);
  } catch (err) {
    next(err);
  }
};

/**
 * MasterAdmin: get every marketer whose overall_verification_status = 'approved'
 */
async function getVerifiedMarketersMaster(req, res, next) {
  try {
    const { rows } = await pool.query(`
      SELECT
        u.unique_id,
        u.first_name,
        u.last_name,
        u.email,
        b.phone,
        u.location
      FROM users u
      LEFT JOIN marketer_biodata b
        ON b.marketer_unique_id = u.unique_id
      WHERE u.overall_verification_status = 'approved'
      ORDER BY u.first_name, u.last_name
    `);
    res.json({ marketers: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * SuperAdmin: only the marketers whose admin.super_admin_id = this superadmin
 */
async function getVerifiedMarketersSuperadmin(req, res, next) {
  try {
    const superadminId = req.user.id;
    const { rows } = await pool.query(`
      SELECT
        m.unique_id,
        m.first_name,
        m.last_name,
        m.email,
        b.phone,
        m.location
      FROM users m
      JOIN users a     ON m.admin_id = a.id
      LEFT JOIN marketer_biodata b
        ON b.marketer_unique_id = m.unique_id
      WHERE a.super_admin_id = $1
        AND m.overall_verification_status = 'approved'
      ORDER BY m.first_name, m.last_name
    `, [superadminId]);
    res.json({ marketers: rows });
  } catch (err) {
    next(err);
  }
}

/**
 * Admin: only the marketers assigned to this admin
 */
async function getVerifiedMarketersAdmin(req, res, next) {
  try {
    const adminId = req.user.id;
    const { rows } = await pool.query(`
      SELECT
        u.unique_id,
        u.first_name,
        u.last_name,
        u.email,
        b.phone,
        u.location
      FROM users u
      LEFT JOIN marketer_biodata b
        ON b.marketer_unique_id = u.unique_id
      WHERE u.admin_id = $1
        AND u.overall_verification_status = 'approved'
      ORDER BY u.first_name, u.last_name
    `, [adminId]);
    res.json({ marketers: rows });
  } catch (err) {
    next(err);
  }
}


module.exports = {
  // form‐submission endpoints
  submitBiodata,
  submitGuarantor,
  submitCommitment,
  allowRefillForm,

  // review & approval
  adminReview,
  superadminVerify,
  masterApprove,

  // deletion
  deleteBiodataSubmission,
  deleteGuarantorSubmission,
  deleteCommitmentSubmission,

  // fetching
  getAllSubmissionsForMasterAdmin,
  getSubmissionsForAdmin,
  getSubmissionsForSuperAdmin,

  // **new** one‐line success flips
  biodataSuccess,
  guarantorSuccess,
  commitmentSuccess,

  getVerifiedMarketersMaster,
  getVerifiedMarketersSuperadmin,
  getVerifiedMarketersAdmin,
};