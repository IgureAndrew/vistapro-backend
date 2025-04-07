const bcrypt = require('bcrypt');
const { pool } = require('../config/database');
const { createUser } = require('../models/userModel');
const { generateUniqueID } = require('../utils/uniqueId');

// Updated password regex: Minimum 12 characters, at least one letter, one digit, and one special character.
const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{12,}$/;

/**
 * registerMasterAdmin - Registers a new Master Admin using a secret key.
 */
const registerMasterAdmin = async (req, res, next) => {
  try {
    const { secretKey, first_name, last_name, gender, email, password } = req.body;
    if (secretKey !== process.env.MASTER_ADMIN_SECRET_KEY) {
      return res.status(403).json({ message: "Invalid secret key." });
    }
    if (!first_name || !last_name || !gender || !email || !password) {
      return res.status(400).json({ message: "All required fields must be provided." });
    }
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        message: "Password must be at least 12 characters with letters, numbers, and special characters."
      });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    // Generate a role-specific ID for Master Admin (e.g., RSM001, RSM002, etc.)
    const unique_id = await generateUniqueID("MasterAdmin");
    const newUser = await createUser({
      unique_id,
      first_name,
      last_name,
      gender,
      email,
      password: hashedPassword,
      role: 'MasterAdmin',
      bank_name: null,
      account_number: null,
      account_name: null,
      location: null,
      business_name: null,
      business_address: null,
      business_account_name: null,
      business_account_number: null,
      registration_certificate_url: null,
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
 */
const registerSuperAdmin = async (req, res, next) => {
  try {
    const { first_name, last_name, gender, email, password, bank_name, account_number, account_name, location } = req.body;
    if (!first_name || !last_name || !gender || !email || !password || !bank_name || !account_number || !account_name || !location) {
      return res.status(400).json({ message: "All required fields must be provided." });
    }
    if (!/^\d{10}$/.test(account_number)) {
      return res.status(400).json({ message: "Account number must be exactly 10 digits." });
    }
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        message: "Password must be at least 12 characters with letters, numbers, and special characters."
      });
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    // Generate a role-specific ID for Super Admin (e.g., SM000001, SM000002, etc.)
    const unique_id = await generateUniqueID("SuperAdmin");
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
      business_account_name: null,
      business_account_number: null,
      registration_certificate_url: null,
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
 * updateProfile - Updates the Master Admin profile.
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
 * addUser - Allows Master Admin to create a new user.
 * For SuperAdmin, Admin, and Marketer: expects basic user fields.
 * For Dealer: also expects registration certificate file (PDF only).
 */
const addUser = async (req, res, next) => {
  try {
    const { role } = req.body;
    let unique_id;
    if (role === "Dealer") {
      unique_id = await generateUniqueID("Dealer");
    } else if (role === "Admin") {
      unique_id = await generateUniqueID("Admin");
    } else if (role === "Marketer") {
      unique_id = await generateUniqueID("Marketer");
    } else if (role === "SuperAdmin") {
      unique_id = await generateUniqueID("SuperAdmin");
    } else {
      unique_id = await generateUniqueID("User");
    }
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
        registered_business_name,
        registered_business_address,
        business_account_name,
        business_account_number,
        bank_name,
        account_number,
        account_name,
        location,
      } = req.body;
      if (
        !first_name || !last_name || !gender || !email || !password ||
        !registered_business_name || !registered_business_address ||
        !business_account_name || !business_account_number ||
        !bank_name || !account_number || !account_name || !location
      ) {
        return res.status(400).json({ message: "All dealer fields are required." });
      }
      if (!/^\d{10}$/.test(account_number)) {
        return res.status(400).json({ message: "Bank account number must be exactly 10 digits." });
      }
      if (!passwordRegex.test(password)) {
        return res.status(400).json({
          message: "Password must be at least 12 characters with letters, numbers, and special characters."
        });
      }
      if (!req.file) {
        return res.status(400).json({ message: "Registration certificate (CAC) is required and must be a PDF." });
      }
      if (req.file.mimetype !== "application/pdf") {
        return res.status(400).json({ message: "Registration certificate must be in PDF format." });
      }
      const registration_certificate_url = req.file.path;
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
        business_name: registered_business_name,
        business_address: registered_business_address,
        business_account_name,
        business_account_number,
        registration_certificate_url,
      };
    } else {
      const {
        first_name,
        last_name,
        gender,
        email,
        password,
        bank_name,
        account_number,
        account_name,
        location,
      } = req.body;
      if (!first_name || !last_name || !gender || !email || !password || !bank_name || !account_number || !account_name || !location) {
        return res.status(400).json({ message: "All required fields must be provided." });
      }
      if (!/^\d{10}$/.test(account_number)) {
        return res.status(400).json({ message: "Account number must be exactly 10 digits." });
      }
      if (!passwordRegex.test(password)) {
        return res.status(400).json({
          message: "Password must be at least 12 characters with letters, numbers, and special characters."
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
        business_address: null,
        business_account_name: null,
        business_account_number: null,
        registration_certificate_url: null,
      };
    }
    const newUser = await createUser(userData);
    return res.status(201).json({
      message: "User created successfully",
      user: newUser,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * updateUser - Updates a user specified by :id.
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
      message: "User updated successfully",
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * deleteUser - Deletes a user specified by :id.
 */
const deleteUser = async (req, res, next) => {
  try {
    const userId = req.params.id;
    const query = `DELETE FROM users WHERE id = $1 RETURNING *`;
    const result = await pool.query(query, [userId]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "User not found" });
    }
    return res.status(200).json({
      message: "User deleted successfully",
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * lockUser - Locks a user account (Master Admin only).
 */
const lockUser = async (req, res, next) => {
  try {
    if (req.user.role !== "MasterAdmin") {
      return res.status(403).json({ message: "Only a Master Admin can lock user accounts." });
    }
    const userId = req.params.id;
    const query = `UPDATE users SET locked = true WHERE id = $1 RETURNING *`;
    const result = await pool.query(query, [userId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "User not found." });
    }
    return res.status(200).json({
      message: "User locked successfully",
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * unlockUser - Unlocks a user account (Master Admin only).
 */
const unlockUser = async (req, res, next) => {
  try {
    if (req.user.role !== "MasterAdmin") {
      return res.status(403).json({ message: "Only a Master Admin can unlock user accounts." });
    }
    const userId = req.params.id;
    const query = `UPDATE users SET locked = false WHERE id = $1 RETURNING *`;
    const result = await pool.query(query, [userId]);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "User not found." });
    }
    return res.status(200).json({
      message: "User unlocked successfully",
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * getUsers - Retrieves users from the database.
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
 * getUserSummary - Provides a summary of user activities.
 */
const getUserSummary = async (req, res, next) => {
  try {
    const totalResult = await pool.query("SELECT COUNT(*) FROM users");
    const roleResult = await pool.query("SELECT role, COUNT(*) AS count FROM users GROUP BY role");
    const lockedResult = await pool.query("SELECT COUNT(*) FROM users WHERE locked = true");
    
    res.status(200).json({
      totalUsers: totalResult.rows[0].count,
      usersByRole: roleResult.rows,
      lockedUsers: lockedResult.rows[0].count,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * assignMarketer - Assigns a single marketer to an admin using unique IDs.
 * Expects: req.params.marketerUniqueId and req.body.adminUniqueId
 */
const assignMarketer = async (req, res, next) => {
  try {
    const { marketerUniqueId } = req.params;
    const { adminUniqueId } = req.body;
    if (!marketerUniqueId || !adminUniqueId) {
      return res.status(400).json({ message: "marketerUniqueId and adminUniqueId are required." });
    }
    const query = `
      UPDATE users 
      SET admin_id = (SELECT id FROM users WHERE unique_id = $1)
      WHERE unique_id = $2 AND role = 'Marketer'
      RETURNING *
    `;
    const values = [adminUniqueId, marketerUniqueId];
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
 * assignMarketers - Assigns one or multiple Marketers to an Admin using unique IDs.
 * Expects: req.body.adminUniqueId and req.body.marketerUniqueIds (can be a string or an array)
 */
const assignMarketers = async (req, res, next) => {
  try {
    if (req.user.role !== "MasterAdmin") {
      return res.status(403).json({ message: "Only a Master Admin can assign marketers to an Admin." });
    }
    let { adminUniqueId, marketerUniqueIds } = req.body;
    if (!adminUniqueId || !marketerUniqueIds) {
      return res.status(400).json({ message: "Both adminUniqueId and marketerUniqueIds are required." });
    }
    // If a single marketer is provided as a string, wrap it in an array.
    if (!Array.isArray(marketerUniqueIds)) {
      marketerUniqueIds = [marketerUniqueIds];
    }
    if (marketerUniqueIds.length === 0) {
      return res.status(400).json({ message: "At least one marketer ID must be provided." });
    }
    // Check that the provided admin exists and has role Admin.
    const adminCheck = await pool.query(
      "SELECT unique_id FROM users WHERE unique_id = $1 AND role = 'Admin'",
      [adminUniqueId]
    );
    if (adminCheck.rowCount === 0) {
      return res.status(404).json({ message: "Admin not found." });
    }
    // Validate provided marketer IDs.
    const marketerCheck = await pool.query(
      "SELECT unique_id FROM users WHERE unique_id = ANY($1::text[]) AND role = 'Marketer'",
      [marketerUniqueIds]
    );
    const validMarketerUniqueIds = marketerCheck.rows.map(row => row.unique_id);
    const invalidMarketerIds = marketerUniqueIds.filter(id => !validMarketerUniqueIds.includes(id));
    if (invalidMarketerIds.length > 0) {
      return res.status(404).json({ message: `The following IDs are not valid Marketers: ${invalidMarketerIds.join(", ")}` });
    }
    const query = `
      UPDATE users
      SET admin_id = (SELECT id FROM users WHERE unique_id = $1),
          updated_at = NOW()
      WHERE unique_id = ANY($2::text[]) AND role = 'Marketer'
      RETURNING *
    `;
    const values = [adminUniqueId, marketerUniqueIds];
    const result = await pool.query(query, values);
    return res.status(200).json({
      message: "Marketers assigned to Admin successfully.",
      assignedMarketers: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * assignAdminToSuperAdmin - Assigns a single Admin to a Super Admin using unique IDs.
 * Expects: req.body.adminUniqueId and req.body.superAdminUniqueId
 */
const assignAdminToSuperAdmin = async (req, res, next) => {
  try {
    if (req.user.role !== "MasterAdmin") {
      return res.status(403).json({ message: "Only a Master Admin can assign admin accounts to a Super Admin." });
    }
    const { adminUniqueId, superAdminUniqueId } = req.body;
    if (!adminUniqueId || !superAdminUniqueId) {
      return res.status(400).json({ message: "Both adminUniqueId and superAdminUniqueId are required." });
    }
    // Verify that the Admin exists.
    const adminCheck = await pool.query(
      "SELECT id FROM users WHERE unique_id = $1 AND role = 'Admin'",
      [adminUniqueId]
    );
    if (adminCheck.rowCount === 0) {
      return res.status(404).json({ message: "Admin not found." });
    }
    // Verify that the Super Admin exists.
    const superAdminCheck = await pool.query(
      "SELECT id FROM users WHERE unique_id = $1 AND role = 'SuperAdmin'",
      [superAdminUniqueId]
    );
    if (superAdminCheck.rowCount === 0) {
      return res.status(404).json({ message: "Super Admin not found." });
    }
    const query = `
      UPDATE users
      SET super_admin_id = (SELECT id FROM users WHERE unique_id = $1),
          updated_at = NOW()
      WHERE unique_id = $2
      RETURNING *
    `;
    const values = [superAdminUniqueId, adminUniqueId];
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
 * unassignMarketersFromAdmin - Unassigns a marketer from an admin using unique IDs.
 * Expects in req.body: { marketerUniqueId, adminUniqueId }
 */
const unassignMarketersFromAdmin = async (req, res, next) => {
  try {
    const { marketerUniqueId, adminUniqueId } = req.body;
    if (!marketerUniqueId || !adminUniqueId) {
      return res.status(400).json({ message: "Both marketerUniqueId and adminUniqueId are required." });
    }
    const query = `
      UPDATE users
      SET admin_id = NULL,
          updated_at = NOW()
      WHERE unique_id = $1 
        AND admin_id = (SELECT id FROM users WHERE unique_id = $2)
        AND role = 'Marketer'
      RETURNING *
    `;
    const values = [marketerUniqueId, adminUniqueId];
    const result = await pool.query(query, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Marketer not found or already unassigned." });
    }
    res.status(200).json({
      message: "Marketer unassigned successfully.",
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * unassignAdminsFromSuperadmin - Unassigns an admin from a super admin using unique IDs.
 * Expects in req.body: { adminUniqueId, superAdminUniqueId }
 */
const unassignAdminsFromSuperadmin = async (req, res, next) => {
  try {
    const { adminUniqueId, superAdminUniqueId } = req.body;
    if (!adminUniqueId || !superAdminUniqueId) {
      return res.status(400).json({ message: "Both adminUniqueId and superAdminUniqueId are required." });
    }
    const query = `
      UPDATE users
      SET super_admin_id = NULL,
          updated_at = NOW()
      WHERE unique_id = $1
        AND super_admin_id = (SELECT id FROM users WHERE unique_id = $2)
        AND role = 'Admin'
      RETURNING *
    `;
    const values = [adminUniqueId, superAdminUniqueId];
    const result = await pool.query(query, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Admin not found or already unassigned." });
    }
    res.status(200).json({
      message: "Admin unassigned successfully.",
      user: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * getDashboardSummary - Provides a summary of the activities on the dashboard overview.
 */
const getDashboardSummary = async (req, res, next) => {
  try {
    const totalUsersResult = await pool.query("SELECT COUNT(*) AS total FROM users");
    const totalOrdersResult = await pool.query("SELECT COUNT(*) AS total FROM orders");
    const pendingApprovalsResult = await pool.query(
      "SELECT COUNT(*) AS total FROM users WHERE overall_verification_status = 'pending'"
    );
    const totalSalesResult = await pool.query(
      "SELECT COALESCE(SUM(sold_amount), 0) AS total_sales FROM orders"
    );
    const activeSessions = 0; // Add your own session tracking logic if needed

    const totalUsers = parseInt(totalUsersResult.rows[0].total, 10);
    const totalOrders = parseInt(totalOrdersResult.rows[0].total, 10);
    const pendingApprovals = parseInt(pendingApprovalsResult.rows[0].total, 10);
    const totalSales = parseFloat(totalSalesResult.rows[0].total_sales) || 0;

    res.status(200).json({
      totalUsers,
      totalOrders,
      pendingApprovals,
      activeSessions,
      totalSales,
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
  getUserSummary,
  getDashboardSummary,
  assignMarketer,
  assignMarketers,
  assignAdminToSuperAdmin,
  unassignMarketersFromAdmin,
  unassignAdminsFromSuperadmin,
};
