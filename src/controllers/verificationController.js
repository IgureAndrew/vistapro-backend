// src/controllers/verificationController.js
const { pool } = require('../config/database');

/**
 * submitVerification - Allows a marketer to submit their verification forms.
 * Expected req.body: { marketer_id, bio_data, guarantor_data, commitment_data }
 * All three forms must be filled before submission.
 */
const submitVerification = async (req, res, next) => {
  try {
    const { marketer_id, bio_data, guarantor_data, commitment_data } = req.body;
    if (!marketer_id || !bio_data || !guarantor_data || !commitment_data) {
      return res.status(400).json({ message: 'All verification forms are required.' });
    }
    
    // Insert a new verification record or update if it already exists.
    // Assumes a unique constraint on marketer_id in the verifications table.
    const query = `
      INSERT INTO verifications 
        (marketer_id, bio_data, guarantor_data, commitment_data, submitted_at, approved)
      VALUES ($1, $2, $3, $4, NOW(), false)
      ON CONFLICT (marketer_id) DO UPDATE
        SET bio_data = EXCLUDED.bio_data,
            guarantor_data = EXCLUDED.guarantor_data,
            commitment_data = EXCLUDED.commitment_data,
            submitted_at = NOW(),
            approved = false
      RETURNING *
    `;
    const values = [marketer_id, bio_data, guarantor_data, commitment_data];
    const result = await pool.query(query, values);
    
    return res.status(200).json({
      message: 'Verification forms submitted successfully.',
      verification: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * getPendingVerifications - Retrieves a list of marketers who have submitted all
 * verification forms but are not yet approved.
 * This is used by the Master Admin for review.
 */
const getPendingVerifications = async (req, res, next) => {
  try {
    const query = `
      SELECT v.*, m.name AS marketer_name, m.email AS marketer_email
      FROM verifications v
      JOIN marketers m ON v.marketer_id = m.id
      WHERE v.bio_data IS NOT NULL
        AND v.guarantor_data IS NOT NULL
        AND v.commitment_data IS NOT NULL
        AND v.approved = false
      ORDER BY v.submitted_at DESC
    `;
    const result = await pool.query(query);
    return res.status(200).json({
      message: 'Pending verifications retrieved successfully.',
      data: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * approveVerification - Allows the Master Admin to approve a marketer's verification.
 * Expects req.params: { marketer_id }.
 */
const approveVerification = async (req, res, next) => {
  try {
    const { marketer_id } = req.params;
    if (!marketer_id) {
      return res.status(400).json({ message: 'marketer_id is required.' });
    }
    const query = `
      UPDATE verifications
      SET approved = true, reviewed_at = NOW()
      WHERE marketer_id = $1
      RETURNING *
    `;
    const result = await pool.query(query, [marketer_id]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: 'Verification record not found.' });
    }
    return res.status(200).json({
      message: 'Verification approved successfully.',
      verification: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  submitVerification,
  getPendingVerifications,
  approveVerification,
};
