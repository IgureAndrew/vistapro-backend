// src/controllers/adminController.js
const bcrypt = require('bcrypt');
const { pool } = require('../config/database');
const { createUser } = require('../models/userModel');
const { logAudit } = require('../utils/auditLogger');

const updateAdminAccountSettings = async (req, res, next) => {
  try {
    const adminId = req.user.id;
    const { displayName, email, phone, oldPassword, newPassword } = req.body;
    let updateClauses = [];
    let values = [];
    let paramIndex = 1;
    
    if (newPassword) {
      if (!oldPassword) {
        return res.status(400).json({ message: "Old password is required to change password." });
      }
      const currentRes = await pool.query("SELECT password FROM users WHERE id = $1", [adminId]);
      if (!currentRes.rowCount) {
        return res.status(404).json({ message: "User not found." });
      }
      const isMatch = await bcrypt.compare(oldPassword, currentRes.rows[0].password);
      if (!isMatch) {
        return res.status(400).json({ message: "Old password is incorrect." });
      }
      const hashedNew = await bcrypt.hash(newPassword, 10);
      updateClauses.push(`password = $${paramIndex}`);
      values.push(hashedNew);
      paramIndex++;
    }
    
    if (displayName) {
      updateClauses.push(`first_name = $${paramIndex}`);
      values.push(displayName);
      paramIndex++;
    }
    if (email) {
      updateClauses.push(`email = $${paramIndex}`);
      values.push(email);
      paramIndex++;
    }
    if (phone) {
      updateClauses.push(`phone = $${paramIndex}`);
      values.push(phone);
      paramIndex++;
    }
    if (req.file) {
      updateClauses.push(`profile_image = $${paramIndex}`);
      values.push(req.file.path);
      paramIndex++;
    }
    
    if (updateClauses.length === 0) {
      return res.status(400).json({ message: "No fields provided for update." });
    }
    
    updateClauses.push("updated_at = NOW()");
    const query = `
      UPDATE users
      SET ${updateClauses.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING id, unique_id, first_name, email, phone, profile_image, updated_at
    `;
    values.push(adminId);
    
    const result = await pool.query(query, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "User not found." });
    }
    
    return res.status(200).json({
      message: "Admin account settings updated successfully.",
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Error updating Admin account settings:", error);
    next(error);
  }
};

module.exports = { updateAdminAccountSettings };

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
  updateAdminAccountSettings,
  registerDealer,
  registerMarketer,
};
