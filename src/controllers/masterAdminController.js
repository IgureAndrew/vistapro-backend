// src/controllers/masterAdminController.js

const bcrypt = require('bcrypt');
const { pool } = require('../config/database');
const { createUser } = require('../models/userModel');
const { generateUniqueID } = require('../utils/uniqueId'); // Helper to generate unique IDs

/**
 * registerMasterAdmin - Registers a new Master Admin using a secret key.
 * Expects in req.body:
 *   - secretKey, first_name, last_name, gender, email, password,
 *     bank_name, account_number, account_name, location
 *
 * The password must be at least 12 alphanumeric characters.
 */
const registerMasterAdmin = async (req, res, next) => {
  try {
    const {
      secretKey,
      first_name,
      last_name,
      gender,
      email,
      password
    } = req.body;

    // Check the secret key
    if (secretKey !== process.env.MASTER_ADMIN_SECRET_KEY) {
      return res.status(403).json({ message: "Invalid secret key." });
    }

    // Validate required fields
    if (!first_name || !last_name || !gender || !email || !password) {
      return res.status(400).json({ message: "All required fields must be provided." });
    }

    // Validate password: Must be at least 12 alphanumeric characters.
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{12,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        message: "Password must be at least 12 alphanumeric characters (letters and numbers only)."
      });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Generate a unique ID for the user.
    const unique_id = generateUniqueID("USER");

    // Create the new Master Admin record
    const newUser = await createUser({
      unique_id,
      first_name,
      last_name,
      gender,
      email,
      password: hashedPassword,
      role: 'MasterAdmin',
      //business_name: null,
      //business_address: null,
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
 *   - first_name, last_name, gender, email, password,
 *     bank_name, account_number, account_name, location
 */
const registerSuperAdmin = async (req, res, next) => {
  try {
    const {
      first_name,
      last_name,
      gender,
      email,
      password,
      bank_name,
      account_number,
      account_name,
      location
    } = req.body;

    // Validate required fields
    if (
      !first_name ||
      !last_name ||
      !gender ||
      !email ||
      !password ||
      !bank_name ||
      !account_number ||
      !account_name ||
      !location
    ) {
      return res.status(400).json({ message: "All required fields must be provided." });
    }

    // Validate password complexity
    const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{12,}$/;
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        message: "Password must be at least 12 alphanumeric characters (letters and numbers only)."
      });
    }

    // Hash the password
    const hashedPassword = await bcrypt.hash(password, 10);
    const unique_id = generateUniqueID("USER");

    const newSuperAdmin = await createUser({
      unique_id,
      first_name,
      last_name,
      gender,
      email,
      password: hashedPassword,
      bank_name,
      account_number,
      account_name,
      location,
      role: 'SuperAdmin',
      business_name: null,
      business_address: null,
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
 *   - email, gender, newPassword (optional)
 * Uses req.user.id for the current user.
 */
const updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const { email, gender, newPassword } = req.body;

    let hashedPassword = null;
    if (newPassword) {
      hashedPassword = await bcrypt.hash(newPassword, 10);
    }

    const profileImage = req.file ? req.file.path : null;

    const query = `
      UPDATE users
      SET email = COALESCE($1, email),
          gender = COALESCE($2, gender),
          profile_image = COALESCE($3, profile_image),
          password = COALESCE($4, password),
          updated_at = NOW()
      WHERE id = $5
      RETURNING *
    `;
    const values = [email, gender, profileImage, hashedPassword, userId];
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
 * For non-dealers (SuperAdmin, Admin, Marketer): expects first_name, last_name, gender, email, password, bank_name, account_number, account_name, location.
 * For Dealer: expects first_name, last_name, gender, email, business_name, business_address, password, bank_name, account_number, account_name, location.
 */
const addUser = async (req, res, next) => {
  try {
    const { role } = req.body;
    const unique_id = generateUniqueID(role === "Dealer" ? "DEALER" : "USER");
    const saltRounds = 10;
    let hashedPassword = null;
    let userData = {};

    if (role === "Dealer") {
      const {
        first_name,
        last_name,
        gender,
        email,
        password,
        bank_name,
        account_number,
        account_name,
        business_name,
        business_address,
        location
      } = req.body;

      // Validate required fields for Dealer (including first_name, last_name, gender, and email)
      if (
        !first_name ||
        !last_name ||
        !gender ||
        !email ||
        !business_name ||
        !business_address ||
        !password ||
        !bank_name ||
        !account_number ||
        !account_name ||
        !location
      ) {
        return res.status(400).json({ message: "All dealer fields are required." });
      }

      const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{12,}$/;
      if (!passwordRegex.test(password)) {
        return res.status(400).json({
          message: "Password must be at least 12 alphanumeric characters."
        });
      }

      hashedPassword = await bcrypt.hash(password, saltRounds);

      userData = {
        unique_id,
        first_name,
        last_name,
        gender,
        email,
        password: hashedPassword,
        bank_name,
        account_number,
        account_name,
        location,
        role,
        business_name,
        business_address
      };
    } else {
      // For SuperAdmin, Admin, Marketer
      const {
        first_name,
        last_name,
        gender,
        email,
        password,
        bank_name,
        account_number,
        account_name,
        location
      } = req.body;

      if (
        !first_name ||
        !last_name ||
        !gender ||
        !email ||
        !password ||
        !bank_name ||
        !account_number ||
        !account_name ||
        !location
      ) {
        return res.status(400).json({ message: "All required fields must be provided." });
      }

      const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)[A-Za-z\d]{12,}$/;
      if (!passwordRegex.test(password)) {
        return res.status(400).json({
          message: "Password must be at least 12 alphanumeric characters."
        });
      }

      hashedPassword = await bcrypt.hash(password, saltRounds);

      userData = {
        unique_id,
        first_name,
        last_name,
        gender,
        email,
        password: hashedPassword,
        bank_name,
        account_number,
        account_name,
        location,
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
 * updateUser - Updates a user specified by the URL parameter :id.
 * Updates first_name, last_name, email, bank_name, account_number, role, and location.
 */
const updateUser = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const { first_name, last_name, email, bank_name, account_number, role, location } = req.body;
    
    const query = `
      UPDATE users
      SET
        first_name = COALESCE($1, first_name),
        last_name = COALESCE($2, last_name),
        email = COALESCE($3, email),
        bank_name = COALESCE($4, bank_name),
        account_number = COALESCE($5, account_number),
        role = COALESCE($6, role),
        location = COALESCE($7, location),
        updated_at = NOW()
      WHERE id = $8
      RETURNING *
    `;
    const values = [first_name, last_name, email, bank_name, account_number, role, location, userId];
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

/**
 * assignAdminToSuperAdmin - Allows a Master Admin to assign a single Admin to a Super Admin.
 * Only a Master Admin can perform this action.
 * Expects in req.body:
 *   - adminId: The ID of the Admin to be assigned.
 *   - superAdminId: The ID of the Super Admin under whom the Admin will be assigned.
 *
 * The function verifies that:
 *   - The request is made by a Master Admin.
 *   - The target user with adminId has role "Admin".
 *   - The target user with superAdminId has role "SuperAdmin".
 * Then, it updates the admin's record by setting super_admin_id.
 */
const assignAdminToSuperAdmin = async (req, res, next) => {
  try {
    if (req.user.role !== 'MasterAdmin') {
      return res.status(403).json({ message: "Only a Master Admin can assign admin accounts to a Super Admin." });
    }
    
    const { adminId, superAdminId } = req.body;
    if (!adminId || !superAdminId) {
      return res.status(400).json({ message: "Both adminId and superAdminId are required." });
    }

    const adminCheck = await pool.query("SELECT * FROM users WHERE id = $1 AND role = 'Admin'", [adminId]);
    if (adminCheck.rowCount === 0) {
      return res.status(404).json({ message: "Admin not found." });
    }

    const superAdminCheck = await pool.query("SELECT * FROM users WHERE id = $1 AND role = 'SuperAdmin'", [superAdminId]);
    if (superAdminCheck.rowCount === 0) {
      return res.status(404).json({ message: "Super Admin not found." });
    }

    const query = `UPDATE users SET super_admin_id = $1, updated_at = NOW() WHERE id = $2 RETURNING *`;
    const values = [superAdminId, adminId];
    const result = await pool.query(query, values);

    return res.status(200).json({
      message: "Admin assigned to Super Admin successfully.",
      admin: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * assignAdminsToSuperAdmin - Allows a Master Admin to assign multiple Admins to a single Super Admin.
 * Only a Master Admin can perform this action.
 * Expects in req.body:
 *   - superAdminId: The ID of the Super Admin.
 *   - adminIds: An array of Admin IDs to be assigned.
 *
 * The function verifies that:
 *   - The request is made by a Master Admin.
 *   - The user with superAdminId has role "SuperAdmin".
 *   - Each admin in the adminIds array has role "Admin".
 * Then, it updates all Admin records to set their super_admin_id.
 */
const assignAdminsToSuperAdmin = async (req, res, next) => {
  try {
    if (req.user.role !== 'MasterAdmin') {
      return res.status(403).json({ message: "Only a Master Admin can assign admins to a Super Admin." });
    }

    const { superAdminId, adminIds } = req.body;
    if (!superAdminId || !Array.isArray(adminIds) || adminIds.length === 0) {
      return res.status(400).json({ message: "superAdminId and a non-empty adminIds array are required." });
    }

    const superAdminCheck = await pool.query(
      "SELECT * FROM users WHERE id = $1 AND role = 'SuperAdmin'",
      [superAdminId]
    );
    if (superAdminCheck.rowCount === 0) {
      return res.status(404).json({ message: "Super Admin not found." });
    }

    const adminCheck = await pool.query(
      "SELECT id FROM users WHERE id = ANY($1::int[]) AND role = 'Admin'",
      [adminIds]
    );
    const validAdminIds = adminCheck.rows.map((row) => row.id);
    const invalidIds = adminIds.filter((id) => !validAdminIds.includes(id));
    if (invalidIds.length > 0) {
      return res.status(404).json({ message: `The following IDs are not valid Admins: ${invalidIds.join(", ")}` });
    }

    const query = `
      UPDATE users
      SET super_admin_id = $1,
          updated_at = NOW()
      WHERE id = ANY($2::int[]) AND role = 'Admin'
      RETURNING *
    `;
    const values = [superAdminId, adminIds];
    const result = await pool.query(query, values);

    return res.status(200).json({
      message: "Admins assigned to Super Admin successfully.",
      assignedAdmins: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * assignMarketersToAdmin - Allows a Master Admin to assign one or multiple Marketers to a single Admin.
 * Expects in req.body:
 *   - adminId: The ID of the Admin.
 *   - marketerIds: Either a single marketer ID or an array of Marketer IDs.
 *
 * The function verifies that:
 *   - The request is made by a Master Admin.
 *   - The target user with adminId has role "Admin".
 *   - Each marketer in marketerIds has role "Marketer".
 * Then, it updates all corresponding Marketer records to set admin_id.
 */
const assignMarketersToAdmin = async (req, res, next) => {
  try {
    if (req.user.role !== 'MasterAdmin') {
      return res.status(403).json({ message: "Only a Master Admin can assign marketers to an Admin." });
    }

    let { adminId, marketerIds } = req.body;
    if (!adminId || !marketerIds) {
      return res.status(400).json({ message: "Both adminId and marketerIds are required." });
    }
    if (!Array.isArray(marketerIds)) {
      marketerIds = [marketerIds];
    }
    if (marketerIds.length === 0) {
      return res.status(400).json({ message: "At least one marketer ID must be provided." });
    }

    const adminCheck = await pool.query("SELECT * FROM users WHERE id = $1 AND role = 'Admin'", [adminId]);
    if (adminCheck.rowCount === 0) {
      return res.status(404).json({ message: "Admin not found." });
    }

    const marketerCheck = await pool.query(
      "SELECT id FROM users WHERE id = ANY($1::int[]) AND role = 'Marketer'",
      [marketerIds]
    );
    const validMarketerIds = marketerCheck.rows.map((row) => row.id);
    const invalidMarketerIds = marketerIds.filter((id) => !validMarketerIds.includes(id));
    if (invalidMarketerIds.length > 0) {
      return res.status(404).json({ message: `The following IDs are not valid Marketers: ${invalidMarketerIds.join(", ")}` });
    }

    const query = `
      UPDATE users
      SET admin_id = $1,
          updated_at = NOW()
      WHERE id = ANY($2::int[]) AND role = 'Marketer'
      RETURNING *
    `;
    const values = [adminId, marketerIds];
    const result = await pool.query(query, values);

    return res.status(200).json({
      message: "Marketers assigned to Admin successfully.",
      assignedMarketers: result.rows,
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
  assignMarketer,
  assignAdminToSuperAdmin,   // Single admin assignment function
  assignAdminsToSuperAdmin,  // Function for multiple admin assignment
  assignMarketersToAdmin     // Function for single/multiple marketer assignment to an Admin
};
