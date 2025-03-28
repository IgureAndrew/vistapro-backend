// src/controllers/masterAdminController.js

const bcrypt = require('bcrypt');
const { pool } = require('../config/database');
const { createUser } = require('../models/userModel');
const { generateUniqueID } = require('../utils/uniqueId'); // Helper to generate unique IDs

/**
 * registerMasterAdmin - Registers a new Master Admin using a secret key.
 * Expects in req.body:
 *   - secretKey, first_name, last_name, gender, email, password, phone, address, bank_id or custom_bank_name, account_number, account_name
 *
 * The password must be at least 12 alphanumeric characters.
 */
const registerMasterAdmin = async (req, res, next) => {
  try {
    const { secretKey, first_name, last_name, gender, email, password, phone, address, bank_id, custom_bank_name, account_number, account_name } = req.body;

    // Check the secret key against the environment variable.
    if (secretKey !== process.env.MASTER_ADMIN_SECRET_KEY) {
      return res.status(403).json({ message: "Invalid secret key." });
    }

    // Validate password: Must be at least 12 alphanumeric characters.
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{12,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        message: "Password must be at least 12 alphanumeric characters (letters and numbers only)."
      });
    }

    // Hash the password using bcrypt.
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Generate a unique ID for the user.
    const unique_id = generateUniqueID("USER");

    // Create the new Master Admin record.
    const newUser = await createUser({
      unique_id,
      first_name,
      last_name,
      gender,
      email,
      password: hashedPassword,
      phone,
      address,
      bank_id,
      custom_bank_name,
      account_number,
      account_name,
      role: 'MasterAdmin'
    });

    return res.status(201).json({
      message: "Master Admin registered successfully.",
      user: newUser,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * registerSuperAdmin - Registers a new Super Admin.
 * Only a Master Admin can perform this action.
 * Expects in req.body:
 *   - first_name, last_name, gender, email, password, phone, bank_id or custom_bank_name, account_number, account_name
 */
const registerSuperAdmin = async (req, res, next) => {
  try {
    const { first_name, last_name, gender, email, password, phone, bank_id, custom_bank_name, account_number, account_name } = req.body;
    if (!first_name || !last_name || !gender || !email || !password) {
      return res.status(400).json({ message: "First name, last name, gender, email, and password are required." });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);
    const unique_id = generateUniqueID("USER");

    const newSuperAdmin = await createUser({
      unique_id,
      first_name,
      last_name,
      gender,
      email,
      password: hashedPassword,
      phone,
      bank_id,
      custom_bank_name,
      account_number,
      account_name,
      role: 'SuperAdmin'
    });

    return res.status(201).json({
      message: "Super Admin registered successfully. Login details have been sent to the email.",
      superAdmin: newSuperAdmin,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * updateProfile - Updates the Master Admin profile, including optional profile image upload.
 * Expects in req.body:
 *   - email, phone, gender, newPassword (optional)
 * Uses req.user.id for the current user.
 */
const updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { email, phone, gender, newPassword } = req.body;

    let hashedPassword = null;
    if (newPassword) {
      hashedPassword = await bcrypt.hash(newPassword, 10);
    }

    const profileImage = req.file ? req.file.path : null;

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
      message: "Master Admin profile updated successfully.",
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * addUser - Allows Master Admin to create a new user (SuperAdmin, Admin, Marketer, or Dealer).
 * For SuperAdmin, Admin, and Marketer, expects:
 *   - first_name, last_name, gender, email, password, phone, bank_id (or custom_bank_name), account_number, account_name, role
 * For Dealer, expects:
 *   - business_name, business_address, (optionally CAC document via file upload), phone, bank_id (or custom_bank_name), account_number, account_name, role = "Dealer"
 */
const addUser = async (req, res, next) => {
  try {
    const { role } = req.body;
    const unique_id = generateUniqueID(role === "Dealer" ? "DEALER" : "USER");
    const saltRounds = 10;
    let hashedPassword = null;
    let userData = {};

    if (role === "Dealer") {
      const { password, phone, bank_id, custom_bank_name, account_number, account_name, business_name, business_address } = req.body;
      if (!business_name || !business_address || !phone || !account_number || !account_name || !password) {
        return res.status(400).json({ message: "All dealer fields are required." });
      }
      hashedPassword = await bcrypt.hash(password, saltRounds);
      userData = {
        unique_id,
        first_name: null,
        last_name: null,
        gender: null,
        email: null,
        password: hashedPassword,
        phone,
        bank_id,
        custom_bank_name,
        account_number,
        account_name,
        role,
        business_name,
        business_address
      };
      // File upload for CAC document should be handled separately (e.g., using req.file)
    } else {
      const { first_name, last_name, gender, email, password, phone, bank_id, custom_bank_name, account_number, account_name } = req.body;
      if (!first_name || !last_name || !gender || !email || !password || !phone || !account_number || !account_name) {
        return res.status(400).json({ message: "All required fields must be provided." });
      }
      hashedPassword = await bcrypt.hash(password, saltRounds);
      userData = {
        unique_id,
        first_name,
        last_name,
        gender,
        email,
        password: hashedPassword,
        phone,
        bank_id,
        custom_bank_name,
        account_number,
        account_name,
        role,
        business_name: null,
        business_address: null
      };
    }

    const newUser = await createUser(userData);
    return res.status(201).json({
      message: 'User created successfully',
      user: newUser,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * updateUser - Updates a user (of any role) specified by the URL parameter :id.
 * Now updates first_name and last_name instead of a combined name field.
 */
const updateUser = async (req, res, next) => {
  try {
    const userId = req.params.id;
    // Destructure new fields: first_name, last_name, email, phone, account_number, role
    const { first_name, last_name, email, phone, account_number, role } = req.body;
    
    const query = `
      UPDATE users
      SET
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        email = COALESCE($3, email),
        phone = COALESCE($4, phone),
        account_number = COALESCE($5, account_number),
        role = COALESCE($6, role),
        updated_at = NOW()
      WHERE id = $7
      RETURNING *
    `;
    const values = [first_name, last_name, email, phone, account_number, role, userId];
    const result = await pool.query(query, values);

    return res.status(200).json({
      message: 'User updated successfully',
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * deleteUser - Deletes a user specified by the URL parameter :id.
 */
const deleteUser = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const query = `DELETE FROM users WHERE id = $1 RETURNING *`;
    const result = await pool.query(query, [userId]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    return res.status(200).json({
      message: 'User deleted successfully',
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * lockUser - Locks a user account by setting the "locked" flag to true.
 * Only a Master Admin can perform this action.
 */
const lockUser = async (req, res, next) => {
  try {
    if (req.user.role !== 'MasterAdmin') {
      return res.status(403).json({ message: "Only a Master Admin can lock user accounts." });
    }
    
    const userId = req.params.id;
    const query = `UPDATE users SET locked = true WHERE id = $1 RETURNING *`;
    const result = await pool.query(query, [userId]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "User not found." });
    }
    
    return res.status(200).json({
      message: 'User locked successfully',
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * unlockUser - Unlocks a user account and resets login attempts.
 */
const unlockUser = async (req, res, next) => {
  try {
    if (req.user.role !== 'MasterAdmin') {
      return res.status(403).json({ message: "Only a Master Admin can unlock user accounts." });
    }
    
    const userId = req.params.id;
    const query = `UPDATE users SET locked = false, login_attempts = 0 WHERE id = $1 RETURNING *`;
    const result = await pool.query(query, [userId]);
    
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "User not found." });
    }
    
    return res.status(200).json({
      message: 'User unlocked successfully',
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * getUsers - Retrieves users from the database.
 * If a query parameter "role" is provided, returns only users with that role.
 */
const getUsers = async (req, res, next) => {
  try {
    const { role } = req.query;
    let query;
    let values = [];
    if (role) {
      query = "SELECT * FROM users WHERE role = $1";
      values.push(role);
    } else {
      query = "SELECT * FROM users";
    }
    const result = await pool.query(query, values);
    res.status(200).json({ users: result.rows });
  } catch (error) {
    next(error);
  }
};

/**
 * assignMarketer - Updates a marketer's assigned admin.
 * Expects:
 *   - Route parameter: marketerId
 *   - Request body: { adminId: <ID of the Admin> }
 */
const assignMarketer = async (req, res, next) => {
  try {
    const { marketerId } = req.params;
    const { adminId } = req.body;

    if (!marketerId || !adminId) {
      return res.status(400).json({ message: "MarketerId and adminId are required." });
    }

    const query = `
      UPDATE users 
      SET admin_id = $1 
      WHERE id = $2 AND role = 'Marketer'
      RETURNING *
    `;
    const values = [adminId, marketerId];
    const result = await pool.query(query, values);

    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Marketer not found or update failed." });
    }
    res.status(200).json({
      message: "Marketer assigned successfully.",
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

module.exports = { 
  registerMasterAdmin, 
  registerSuperAdmin,
  updateProfile, 
  addUser, 
  updateUser, 
  deleteUser, 
  lockUser, 
  unlockUser,
  getUsers,
  assignMarketer 
};
