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
 * updateProfile - Updates the Master Admin profile, including the phone field.
 */
const updateProfile = async (req, res, next) => {
  try {
    const userId = req.user.id;
    // Include phone in the destructuring from req.body
    const { email, gender, newPassword, phone } = req.body;
    let hashedPassword = null;
    if (newPassword) {
      hashedPassword = await bcrypt.hash(newPassword, 10);
    }
    // Get profile image file path if uploaded
    const profileImage = req.file ? req.file.path : null;

    // Updated SQL query now includes the "phone" field.
    const query = `
      UPDATE users
      SET email = COALESCE($1, email),
          gender = COALESCE($2, gender),
          phone = COALESCE($3, phone),
          profile_image = COALESCE($4, profile_image),
          password = COALESCE($5, password),
          updated_at = NOW()
      WHERE id = $6
      RETURNING *
    `;
    const values = [email, gender, phone, profileImage, hashedPassword, userId];

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
    let hashedPassword;
    let userData = {};

    if (role === "Dealer") {
      // Dealers: only business info + location + CAC PDF
      const {
        first_name,
        last_name,
        gender,
        email,
        password,
        registered_business_name,
        registered_business_address,
        location,
      } = req.body;

      // validation
      if (
        !first_name ||
        !last_name ||
        !gender ||
        !email ||
        !password ||
        !registered_business_name ||
        !registered_business_address ||
        !location
      ) {
        return res
          .status(400)
          .json({ message: "All dealer fields are required." });
      }
      if (!passwordRegex.test(password)) {
        return res.status(400).json({
          message:
            "Password must be at least 12 characters with letters, numbers, and special characters.",
        });
      }
      if (!req.file) {
        return res.status(400).json({
          message:
            "Registration certificate (CAC) is required and must be a PDF.",
        });
      }
      if (req.file.mimetype !== "application/pdf") {
        return res
          .status(400)
          .json({ message: "Registration certificate must be PDF." });
      }

      // hash + assemble
      hashedPassword = await bcrypt.hash(password, saltRounds);
      userData = {
        unique_id,
        first_name,
        last_name,
        gender,
        email,
        password: hashedPassword,
        role,
        location,

        // Dealer-specific business fields
        business_name: registered_business_name,
        business_address: registered_business_address,
        business_account_name: null,
        business_account_number: null,

        // banking always null for Dealers
        bank_name: null,
        account_number: null,
        account_name: null,

        registration_certificate_url: req.file.path,
      };
    } else {
      // All other roles: require bank details + location
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
        return res
          .status(400)
          .json({ message: "All required fields must be provided." });
      }
      if (!/^\d{10}$/.test(account_number)) {
        return res
          .status(400)
          .json({ message: "Account number must be exactly 10 digits." });
      }
      if (!passwordRegex.test(password)) {
        return res.status(400).json({
          message:
            "Password must be at least 12 characters with letters, numbers, and special characters.",
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
        role,
        location,

        // banking fields
        bank_name,
        account_number,
        account_name,

        // no business info for non-Dealers
        business_name: null,
        business_address: null,
        business_account_name: null,
        business_account_number: null,
        registration_certificate_url: null,
      };
    }

    // Create the new user
    const newUser = await createUser(userData);

    // initialize wallet for marketers
    if (newUser.role === "Marketer") {
      await pool.query(
        `INSERT INTO wallets (user_unique_id) VALUES ($1)`,
        [newUser.unique_id]
      );
    }

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
    // Use the user's unique ID provided as a route parameter.
    const userUniqueId = req.params.uniqueId;
    
    // Destructure the fields that can be updated from the request body.
    // You can add more fields as necessary.
    const {
      first_name,
      last_name,
      email,
      bank_name,
      account_number,
      role,
      location,
      phone,
      profile_image
    } = req.body;
    
    // Create arrays to hold the dynamic parts of the SQL query.
    let updateClauses = [];
    let values = [];
    let index = 1;
    
    // Dynamically push each provided field into the update query.
    if (first_name) {
      updateClauses.push(`first_name = $${index}`);
      values.push(first_name);
      index++;
    }
    if (last_name) {
      updateClauses.push(`last_name = $${index}`);
      values.push(last_name);
      index++;
    }
    if (email) {
      updateClauses.push(`email = $${index}`);
      values.push(email);
      index++;
    }
    if (bank_name) {
      updateClauses.push(`bank_name = $${index}`);
      values.push(bank_name);
      index++;
    }
    if (account_number) {
      updateClauses.push(`account_number = $${index}`);
      values.push(account_number);
      index++;
    }
    if (role) {
      updateClauses.push(`role = $${index}`);
      values.push(role);
      index++;
    }
    if (location) {
      updateClauses.push(`location = $${index}`);
      values.push(location);
      index++;
    }
    if (phone) {
      updateClauses.push(`phone = $${index}`);
      values.push(phone);
      index++;
    }
    if (profile_image) {
      updateClauses.push(`profile_image = $${index}`);
      values.push(profile_image);
      index++;
    }
    
    // If no fields are provided, return an error.
    if (updateClauses.length === 0) {
      return res.status(400).json({ message: "No fields provided for update." });
    }
    
    // Always update the updated_at field.
    updateClauses.push(`updated_at = NOW()`);
    
    // Use the user's unique ID as the final parameter.
    const query = `
      UPDATE users
      SET ${updateClauses.join(", ")}
      WHERE unique_id = $${index}
      RETURNING *
    `;
    values.push(userUniqueId);
    
    // Execute the query.
    const result = await pool.query(query, values);
    
    if (!result.rowCount) {
      return res.status(404).json({ message: "User not found." });
    }
    
    return res.status(200).json({
      message: "User updated successfully.",
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
 * assignMarketersToAdmin - Assigns one or multiple Marketers to an Admin using unique IDs.
 * Expects in req.body:
 * {
 *   "adminUniqueId": "TARGET_ADMIN_ID",
 *   "marketerUniqueIds": "MARKETER_ID"  // or an array of IDs
 * }
 */
const assignMarketersToAdmin = async (req, res, next) => {
  try {
    if (req.user.role !== "MasterAdmin") {
      return res.status(403).json({ message: "Only a Master Admin can assign marketers to an Admin." });
    }
    let { adminUniqueId, marketerUniqueIds } = req.body;
    if (!adminUniqueId || !marketerUniqueIds) {
      return res.status(400).json({ message: "Both adminUniqueId and marketerUniqueIds are required." });
    }
    // Ensure marketerUniqueIds is an array
    if (!Array.isArray(marketerUniqueIds)) {
      marketerUniqueIds = [marketerUniqueIds];
    }
    if (marketerUniqueIds.length === 0) {
      return res.status(400).json({ message: "At least one marketer ID must be provided." });
    }
    // Verify that the admin exists and has role "Admin"
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
 * assignAdminToSuperAdmin - Assigns one or multiple Admins to a Super Admin using unique IDs.
 * Expects in req.body:
 * {
 *   "superAdminUniqueId": "TARGET_SUPERADMIN_ID",
 *   "adminUniqueIds": "ADMIN_ID"  // or an array of IDs
 * }
 */
const assignAdminToSuperAdmin = async (req, res, next) => {
  try {
    if (req.user.role !== "MasterAdmin") {
      return res.status(403).json({ message: "Only a Master Admin can assign admins to a Super Admin." });
    }
    let { superAdminUniqueId, adminUniqueIds } = req.body;
    if (!superAdminUniqueId || !adminUniqueIds) {
      return res.status(400).json({ message: "Both superAdminUniqueId and adminUniqueIds are required." });
    }
    // Ensure adminUniqueIds is an array
    if (!Array.isArray(adminUniqueIds)) {
      adminUniqueIds = [adminUniqueIds];
    }
    if (adminUniqueIds.length === 0) {
      return res.status(400).json({ message: "At least one admin ID must be provided." });
    }
    // Verify that the Super Admin exists.
    const superAdminCheck = await pool.query(
      "SELECT id FROM users WHERE unique_id = $1 AND role = 'SuperAdmin'",
      [superAdminUniqueId]
    );
    if (superAdminCheck.rowCount === 0) {
      return res.status(404).json({ message: "Super Admin not found." });
    }
    // Validate provided admin IDs.
    const adminCheck = await pool.query(
      "SELECT unique_id FROM users WHERE unique_id = ANY($1::text[]) AND role = 'Admin'",
      [adminUniqueIds]
    );
    const validAdminUniqueIds = adminCheck.rows.map(row => row.unique_id);
    const invalidIds = adminUniqueIds.filter(id => !validAdminUniqueIds.includes(id));
    if (invalidIds.length > 0) {
      return res.status(404).json({ message: `The following IDs are not valid Admins: ${invalidIds.join(", ")}` });
    }
    const query = `
      UPDATE users
      SET super_admin_id = (SELECT id FROM users WHERE unique_id = $1),
          updated_at = NOW()
      WHERE unique_id = ANY($2::text[]) AND role = 'Admin'
      RETURNING *
    `;
    const values = [superAdminUniqueId, adminUniqueIds];
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
 * unassignMarketersFromAdmin - Unassigns one or multiple Marketers from an Admin using unique IDs.
 * Expects in req.body:
 * {
 *   "adminUniqueId": "TARGET_ADMIN_ID",
 *   "marketerUniqueIds": "MARKETER_ID" // or an array of IDs
 * }
 */
const unassignMarketersFromAdmin = async (req, res, next) => {
  try {
    let { adminUniqueId, marketerUniqueIds } = req.body;
    if (!adminUniqueId || !marketerUniqueIds) {
      return res.status(400).json({ message: "Both adminUniqueId and marketerUniqueIds are required." });
    }
    if (!Array.isArray(marketerUniqueIds)) {
      marketerUniqueIds = [marketerUniqueIds];
    }
    if (marketerUniqueIds.length === 0) {
      return res.status(400).json({ message: "At least one marketer ID must be provided." });
    }
    const query = `
      UPDATE users
      SET admin_id = NULL,
          updated_at = NOW()
      WHERE unique_id = ANY($1::text[])
        AND admin_id = (SELECT id FROM users WHERE unique_id = $2)
        AND role = 'Marketer'
      RETURNING *
    `;
    // Here, $1 is the array of marketer IDs and $2 is the adminUniqueId.
    const values = [marketerUniqueIds, adminUniqueId];
    const result = await pool.query(query, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "Marketer(s) not found or already unassigned." });
    }
    res.status(200).json({
      message: "Marketer(s) unassigned successfully.",
      unassignedMarketers: result.rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * unassignAdminsFromSuperadmin - Unassigns one or multiple Admins from a Super Admin using unique IDs.
 * Expects in req.body:
 * {
 *   "superAdminUniqueId": "TARGET_SUPERADMIN_ID",
 *   "adminUniqueIds": "ADMIN_ID" // or an array of IDs
 * }
 */
const unassignAdminsFromSuperadmin = async (req, res, next) => {
  try {
    let { superAdminUniqueId, adminUniqueIds } = req.body;
    if (!superAdminUniqueId || !adminUniqueIds) {
      return res.status(400).json({ message: "Both superAdminUniqueId and adminUniqueIds are required." });
    }
    if (!Array.isArray(adminUniqueIds)) {
      adminUniqueIds = [adminUniqueIds];
    }
    if (adminUniqueIds.length === 0) {
      return res.status(400).json({ message: "At least one admin ID must be provided." });
    }
    const query = `
      UPDATE users
      SET super_admin_id = NULL,
          updated_at = NOW()
      WHERE unique_id = ANY($1::text[])
        AND super_admin_id = (SELECT id FROM users WHERE unique_id = $2)
        AND role = 'Admin'
      RETURNING *
    `;
    const values = [adminUniqueIds, superAdminUniqueId];
    const result = await pool.query(query, values);
    if (result.rowCount === 0) {
      return res.status(404).json({ message: "No matching admins found or already unassigned." });
    }
    return res.status(200).json({
      message: "Admins unassigned successfully.",
      unassignedAdmins: result.rows,
    });
  } catch (error) {
    next(error);
  }
};



/**
 * listMarketersByAdmin
 * Retrieves a list of Marketers assigned to a given Admin.
 * Expects the admin's unique ID as a route parameter.
 */
const listMarketersByAdmin = async (req, res, next) => {
  try {
    const { adminUniqueId } = req.params;
    // Verify the provided admin exists and has role "Admin".
    const adminResult = await pool.query(
      "SELECT id FROM users WHERE unique_id = $1 AND role = 'Admin'",
      [adminUniqueId]
    );
    if (adminResult.rowCount === 0) {
      return res.status(404).json({ message: "Admin not found." });
    }
    const adminId = adminResult.rows[0].id;

    // Retrieve all marketers assigned to that admin.
    const query = `
      SELECT unique_id, first_name, last_name, email, location, admin_id
      FROM users
      WHERE role = 'Marketer' AND admin_id = $1
      ORDER BY first_name, last_name
    `;
    const result = await pool.query(query, [adminId]);
    res.status(200).json({ assignedMarketers: result.rows });
  } catch (error) {
    next(error);
  }
};

/**
 * listAdminsBySuperAdmin
 * Retrieves a list of Admins assigned to a given SuperAdmin.
 * Expects the super admin's unique ID as a route parameter.
 */
const listAdminsBySuperAdmin = async (req, res, next) => {
  try {
    const { superAdminUniqueId } = req.params;
    // Verify the provided superadmin exists.
    const superAdminResult = await pool.query(
      "SELECT id FROM users WHERE unique_id = $1 AND role = 'SuperAdmin'",
      [superAdminUniqueId]
    );
    if (superAdminResult.rowCount === 0) {
      return res.status(404).json({ message: "SuperAdmin not found." });
    }
    const superAdminId = superAdminResult.rows[0].id;

    // Retrieve all admins assigned to that superadmin.
    const query = `
      SELECT unique_id, first_name, last_name, email, location, super_admin_id
      FROM users
      WHERE role = 'Admin' AND super_admin_id = $1
      ORDER BY first_name, last_name
    `;
    const result = await pool.query(query, [superAdminId]);
    res.status(200).json({ assignedAdmins: result.rows });
  } catch (error) {
    next(error);
  }
};

/**
 * getAllAssignments
 * Retrieves all current assignment relationships from the system.
 *
 * - For marketers: Returns all marketers that are assigned to an admin.
 * - For admins: Returns all admins that are assigned to a super admin.
 *
 * The response includes:
 *   - assignedMarketers: Array of objects representing marketer assignments to admins.
 *   - assignedAdmins: Array of objects representing admin assignments to superadmins.
 */
const getAllAssignments = async (req, res, next) => {
  try {
    // Fetch marketers assigned to an admin.
    const marketersAssignedResult = await pool.query(
      `
      SELECT 
        u.unique_id AS marketer_unique_id,
        u.admin_id,
        (SELECT unique_id FROM users WHERE id = u.admin_id) AS admin_unique_id,
        u.first_name,
        u.last_name,
        u.location
      FROM users u
      WHERE u.role = 'Marketer' AND u.admin_id IS NOT NULL
      ORDER BY u.first_name, u.last_name
      `
    );

    // Fetch admins assigned to a super admin.
    const adminsAssignedResult = await pool.query(
      `
      SELECT 
        u.unique_id AS admin_unique_id,
        u.super_admin_id,
        (SELECT unique_id FROM users WHERE id = u.super_admin_id) AS super_admin_unique_id,
        u.first_name,
        u.last_name,
        u.location
      FROM users u
      WHERE u.role = 'Admin' AND u.super_admin_id IS NOT NULL
      ORDER BY u.first_name, u.last_name
      `
    );

    res.status(200).json({
      assignedMarketers: marketersAssignedResult.rows,
      assignedAdmins: adminsAssignedResult.rows,
    });
  } catch (error) {
    next(error);
  }
};

/**
 * getAllDealers
 * Returns a list of all dealers from the users table (role = 'Dealer').
 */
const getAllDealers = async (req, res, next) => {
  const { rows } = await pool.query(
    `SELECT id, unique_id, business_name FROM users WHERE role = 'Dealer'`
  );
  res.json({ dealers: rows });
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

/**
 * getTotalUsers - returns the count of all users
 */
async function getTotalUsers(req, res, next) {
  try {
    const { rows } = await pool.query(`
      SELECT COUNT(*)::int AS total_users
      FROM users
    `);
    return res.json({ totalUsers: rows[0].total_users });
  } catch (err) {
    next(err);
  }
}

async function getStats(req, res, next) {
  try {
    const { rows } = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM users)                             AS "totalUsers",
        (SELECT COUNT(*) FROM orders WHERE status = 'pending')   AS "totalPendingOrders",
        (SELECT COUNT(*) FROM orders WHERE status = 'completed') AS "totalConfirmedOrders",
        (SELECT COALESCE(SUM(sold_amount),0) FROM orders)         AS "totalSales",
        (SELECT COUNT(*) FROM products AS p
           JOIN inventory_items AS i ON i.product_id = p.id
          WHERE i.status = 'available')                          AS "totalAvailableProducts",
        (SELECT COUNT(*) FROM users WHERE overall_verification_status = 'pending') AS "pendingVerification",
        (SELECT COUNT(*) FROM stock_updates WHERE status = 'pending')             AS "totalPickupStocks"
    `);
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}
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
  assignMarketersToAdmin, // Multi-assignment for marketers to admin
  assignAdminToSuperAdmin, // Multi-assignment for admins to super admin
  unassignMarketersFromAdmin,
  unassignAdminsFromSuperadmin,
  listMarketersByAdmin,
  getAllAssignments,
  listAdminsBySuperAdmin,
  getAllDealers,
  getTotalUsers,
  getStats,
  
};
