// src/controllers/masterAdminController.js

const bcrypt = require('bcrypt');
const { pool } = require('../config/database');
const { createUser } = require('../models/userModel');

/**
 * registerMasterAdmin - Registers a new Master Admin using a secret key.
 * Expects the following fields in req.body:
 *   - secretKey, name, email, password, phone, gender
 */
const registerMasterAdmin = async (req, res, next) => {
  try {
    const { secretKey, name, email, password, phone, gender } = req.body;

    // Check the secret key against the environment variable
    if (secretKey !== process.env.MASTER_ADMIN_SECRET_KEY) {
      return res.status(403).json({ message: "Invalid secret key." });
    }

    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create a new Master Admin using only the required fields.
    const newUser = await createUser({
      name,
      email,
      password: hashedPassword,
      role: 'MasterAdmin',
      phone,
      gender,
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
 * The login details (including a temporary password) are sent back in the response.
 */
const registerSuperAdmin = async (req, res, next) => {
  try {
    // The current user is already verified as Master Admin via the middleware.
    const { name, email, password, phone } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password are required." });
    }
    
    // Hash the provided password
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create the new Super Admin user with role 'SuperAdmin'
    const newSuperAdmin = await createUser({
      name,
      email,
      password: hashedPassword,
      role: 'SuperAdmin',
      phone,
      account_number: null, // Not applicable for SuperAdmin
    });

    // In a real-world scenario, you might send an email with the login details.
    // For demonstration, we simply return the new user data.
    return res.status(201).json({
      message: "Super Admin registered successfully. Login details have been sent to the email.",
      superAdmin: newSuperAdmin,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * updateProfile - Updates the Master Admin profile, including an optional profile image upload.
 * Expects:
 *  - Fields in req.body: email, phone, gender, newPassword (optional)
 *  - A file upload for the profile image (field name 'profileImage') via Multer in req.file.
 */
const updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { email, phone, gender, newPassword } = req.body;

    let hashedPassword = null;
    if (newPassword) {
      hashedPassword = await bcrypt.hash(newPassword, 10);
    }

    // Get the uploaded file's path if available.
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
 * addUser - Allows MasterAdmin to create a new user (Super Admin, Admin, Dealer, or Marketer).
 */
const addUser = async (req, res, next) => {
  try {
    const { name, email, password, role, phone, account_number } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: 'Name, email, password, and role are required.' });
    }
    
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    const newUser = await createUser({
      name,
      email,
      password: hashedPassword,
      role,
      phone,
      account_number,
    });
    
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
 */
const updateUser = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const { name, email, phone, account_number, role } = req.body;
    
    const query = `
      UPDATE users
      SET
        name = COALESCE($1, name),
        email = COALESCE($2, email),
        phone = COALESCE($3, phone),
        account_number = COALESCE($4, account_number),
        role = COALESCE($5, role),
        updated_at = NOW()
      WHERE id = $6
      RETURNING *
    `;
    const values = [name, email, phone, account_number, role, userId];
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
 */
const lockUser = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const query = `UPDATE users SET locked = true WHERE id = $1 RETURNING *`;
    const result = await pool.query(query, [userId]);
    
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
    const userId = req.params.id;
    const query = `UPDATE users SET locked = false, login_attempts = 0 WHERE id = $1 RETURNING *`;
    const result = await pool.query(query, [userId]);
    
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
 * If a query parameter "role" is provided, it returns only users with that role.
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
 * Only updates if the user's role is "Marketer".
 */
const assignMarketer = async (req, res, next) => {
  try {
    const { marketerId } = req.params;
    const { adminId } = req.body;

    if (!marketerId || !adminId) {
      return res.status(400).json({ message: "MarketerId and adminId are required." });
    }

    // Update the user (only if the user is a Marketer)
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
