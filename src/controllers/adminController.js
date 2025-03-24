// src/controllers/adminController.js
const bcrypt = require('bcrypt');
const { pool } = require('../config/database');
const { createUser } = require('../models/userModel');
const { logAudit } = require('../utils/auditLogger');

/**
 * updateProfile - Allows an Admin to update their profile details.
 * Expects the Admin's ID from req.user (populated by verifyToken middleware)
 * and fields like email, phone, gender, address, newPassword, and an optional facial profile image via req.file.
 */
const updateProfile = async (req, res, next) => {
  try {
    // Extract the Admin's ID from the JWT payload
    const userId = req.user.id;
    const { email, phone, gender, address, newPassword } = req.body;

    // If a new password is provided, hash it; otherwise, leave it unchanged.
    let hashedPassword = null;
    if (newPassword) {
      const saltRounds = 10;
      hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    }

    // Check if a facial profile image was uploaded (using Multer)
    const profileImage = req.file ? req.file.path : null;

    // Update the Admin's profile
    const query = `
      UPDATE users
      SET email = COALESCE($1, email),
          phone = COALESCE($2, phone),
          gender = COALESCE($3, gender),
          address = COALESCE($4, address),
          profile_image = COALESCE($5, profile_image),
          password = COALESCE($6, password),
          updated_at = NOW()
      WHERE id = $7
      RETURNING *
    `;
    const values = [email, phone, gender, address, profileImage, hashedPassword, userId];
    const result = await pool.query(query, values);

    return res.status(200).json({
      message: 'Admin profile updated successfully.',
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * registerDealer - Allows an Admin to register a new Dealer account.
 * Expects: name, email, password, phone, and account_number in req.body.
 */
const registerDealer = async (req, res, next) => {
  try {
    const { name, email, password, phone, account_number } = req.body;

    // Validate required fields
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required.' });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create the new Dealer account with role 'Dealer'
    const newDealer = await createUser({
      name,
      email,
      password: hashedPassword,
      role: 'Dealer',
      phone,
      account_number,
    });

    // Optional: Log the action for audit purposes
    await logAudit(req.user.id, 'REGISTER_DEALER', `Admin registered Dealer with email: ${email}`);

    return res.status(201).json({
      message: 'Dealer registered successfully.',
      dealer: newDealer,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * registerMarketer - Allows an Admin to register a new Marketer account.
 * Expects in req.body:
 *  - name, email, password, phone, account_number,
 *  - agreement_signed (boolean) indicating if the marketer's agreement has been signed,
 *  - bank_details (string) for the marketer.
 *
 * If agreement_signed is true, the marketer is automatically marked as verified.
 */
const registerMarketer = async (req, res, next) => {
    try {
      const { name, email, password, phone, account_number, agreement_signed, bank_details } = req.body;
  
      // Validate required fields
      if (!name || !email || !password) {
        return res.status(400).json({ message: 'Name, email, and password are required.' });
      }
  
      // Hash the provided password
      const saltRounds = 10;
      const hashedPassword = await bcrypt.hash(password, saltRounds);
  
      // Determine verification status based on agreement_signed
      const is_verified = agreement_signed === true;
  
      // Create the new Marketer account with role 'Marketer'
      const newMarketer = await createUser({
        name,
        email,
        password: hashedPassword,
        role: 'Marketer',
        phone,
        account_number,
        is_verified,       // Mark as verified if the agreement is signed
        agreement_signed,  // You might want to store the raw value
        bank_details,      // Save bank details provided during registration
      });
  
      // Optional: Log the registration action for audit purposes.
      await logAudit(req.user.id, 'REGISTER_MARKETER', `Admin registered Marketer with email: ${email}. Verified: ${is_verified}`);
  
      return res.status(201).json({
        message: 'Marketer registered successfully. Login details have been sent to the email.',
        marketer: newMarketer,
      });
    } catch (error) {
      next(error);
    }
  };
  

module.exports = {
  updateProfile,
  registerDealer,
  registerMarketer,
};
