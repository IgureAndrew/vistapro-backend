// src/controllers/marketerVerificationController.js
const { pool } = require('../config/database');

/**
 * getVerificationStatus - Retrieves the verification status for the marketer.
 * Returns details such as whether the agreement form has been signed and bank details.
 */
const getVerificationStatus = async (req, res, next) => {
  try {
    const marketerId = req.user.id;
    const query = `
      SELECT id, name, email, is_verified, agreement_signed, bank_details
      FROM users
      WHERE id = $1 AND role = 'Marketer'
    `;
    const result = await pool.query(query, [marketerId]);
    if(result.rows.length === 0){
      return res.status(404).json({ message: "Marketer not found." });
    }
    return res.status(200).json({
      message: "Verification status retrieved successfully.",
      verification: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

/**
 * submitVerification - Allows a marketer to submit their verification details.
 * Expects in req.body:
 *   - agreement_signed (boolean)
 *   - bank_details (string)
 * When the agreement is signed, the marketer is marked as verified.
 */
const submitVerification = async (req, res, next) => {
  try {
    const marketerId = req.user.id;
    const { agreement_signed, bank_details } = req.body;
    
    // Here, if the agreement is signed, we mark the marketer as verified.
    const is_verified = agreement_signed === true;
    
    const query = `
      UPDATE users
      SET is_verified = $1,
          bank_details = COALESCE($2, bank_details),
          agreement_signed = $3,
          updated_at = NOW()
      WHERE id = $4 AND role = 'Marketer'
      RETURNING id, name, email, is_verified, agreement_signed, bank_details
    `;
    const values = [is_verified, bank_details, agreement_signed, marketerId];
    const result = await pool.query(query, values);
    
    if(result.rows.length === 0){
      return res.status(404).json({ message: "Marketer not found or update failed." });
    }
    
    return res.status(200).json({
      message: "Verification details submitted successfully.",
      marketer: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getVerificationStatus,
  submitVerification
};
