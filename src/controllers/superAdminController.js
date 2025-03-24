const bcrypt = require('bcrypt');
const { pool } = require('../config/database');
const { createUser } = require('../models/userModel');
const { logAudit } = require('../utils/auditLogger'); // Optional: for audit trails

/**
 * updateProfile - Allows Super Admins to update their profile details.
 * Expects the Super Admin's ID from req.user (set by verifyToken middleware),
 * and fields in req.body: email, phone, gender, newPassword (optional).
 * Also accepts an optional file upload for the profile image (field name 'profileImage').
 */
const updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { email, phone, gender, newPassword } = req.body;

    let hashedPassword = null;
    if (newPassword) {
      hashedPassword = await bcrypt.hash(newPassword, 10);
    }

    // Get the uploaded file's path if available
    const profileImage = req.file ? req.file.path : null;

    // Update the Super Admin's profile using COALESCE to preserve existing data if no new value is provided.
    const query = `
      UPDATE users
      SET email = COALESCE($1, email),
          phone = COALESCE($2, phone),
          gender = COALESCE($3, gender),
          profile_image = COALESCE($4, profile_image),
          password = COALESCE($5, password),
          updated_at = NOW()
      WHERE id = $6
      RETURNING *
    `;
    const values = [email, phone, gender, profileImage, hashedPassword, userId];
    const result = await pool.query(query, values);

    return res.status(200).json({
      message: "Super Admin profile updated successfully.",
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};
/**
 * registerAdmin - Allows Super Admins to register a new Admin account.
 * Expects name, email, password, phone, and account_number in req.body.
 */
const registerAdmin = async (req, res, next) => {
  try {
    const { name, email, password, phone, account_number } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: 'Name, email, and password are required.' });
    }
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newAdmin = await createUser({
      name,
      email,
      password: hashedPassword,
      role: 'Admin',
      phone,
      account_number,
    });

    // Optional: Log this action in audit logs
    await logAudit(req.user.id, 'REGISTER_ADMIN', `Super Admin registered Admin with email: ${email}`);

    return res.status(201).json({
      message: 'Admin registered successfully. Login details have been sent to the email.',
      admin: newAdmin,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  updateProfile,
  registerAdmin,
};
