const bcrypt = require('bcrypt');
const { pool } = require('../config/database');
const { createUser } = require('../models/userModel');
const { generateUniqueID } = require('../utils/uniqueId');
const logActivity = require('../utils/logActivity');

// Updated password regex: Minimum 12 characters, at least one letter, one digit, and one special character.
const passwordRegex = /^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{12,}$/;

/**
 * registerMasterAdmin - Registers a new Master Admin using a secret key.
 */
const registerMasterAdmin = async (req, res, next) => {
  try {
    const { secretKey, first_name, last_name, gender, email, password } = req.body;
    if (secretKey !== process.env.MASTER_ADMIN_SECRET_KEY) {
      return res.status(403).json({ message: 'Invalid secret key.' });
    }
    if (!first_name || !last_name || !gender || !email || !password) {
      return res.status(400).json({ message: 'All required fields must be provided.' });
    }
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        message: 'Password must be at least 12 characters with letters, numbers, and special characters.'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const unique_id = await generateUniqueID('MasterAdmin');
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
      registration_certificate_url: null
    });

    await logActivity(
      req.user.id,
      `${req.user.first_name} ${req.user.last_name}`,
      'Register Master Admin',
      'MasterAdmin',
      newUser.unique_id
    );

    return res.status(201).json({
      message: 'Master Admin registered successfully.',
      user: newUser
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
    const {
      first_name, last_name, gender,
      email, password, bank_name,
      account_number, account_name, location
    } = req.body;

    if (
      !first_name || !last_name || !gender ||
      !email || !password ||
      !bank_name || !account_number || !account_name || !location
    ) {
      return res.status(400).json({ message: 'All required fields must be provided.' });
    }
    if (!/^\d{10}$/.test(account_number)) {
      return res.status(400).json({ message: 'Account number must be exactly 10 digits.' });
    }
    if (!passwordRegex.test(password)) {
      return res.status(400).json({
        message: 'Password must be at least 12 characters with letters, numbers, and special characters.'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const unique_id = await generateUniqueID('SuperAdmin');
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
      registration_certificate_url: null
    });

    await logActivity(
      req.user.id,
      `${req.user.first_name} ${req.user.last_name}`,
      'Register Super Admin',
      'SuperAdmin',
      newSuperAdmin.unique_id
    );

    return res.status(201).json({
      message: 'Super Admin registered successfully. Login details have been sent to the email.',
      superAdmin: newSuperAdmin
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
    const { email, gender, newPassword, phone } = req.body;
    let hashedPassword = null;

    if (newPassword) {
      hashedPassword = await bcrypt.hash(newPassword, 10);
    }

    const profileImage = req.file ? req.file.path : null;
    const query = `
      UPDATE users
      SET email          = COALESCE($1, email),
          gender         = COALESCE($2, gender),
          phone          = COALESCE($3, phone),
          profile_image  = COALESCE($4, profile_image),
          password       = COALESCE($5, password),
          updated_at     = NOW()
      WHERE id = $6
      RETURNING *
    `;
    const values = [email, gender, phone, profileImage, hashedPassword, userId];
    const { rows } = await pool.query(query, values);

    await logActivity(
      userId,
      `${req.user.first_name} ${req.user.last_name}`,
      'Update Profile',
      'MasterAdmin',
      req.user.unique_id
    );

    return res.status(200).json({
      message: 'Master Admin profile updated successfully.',
      user: rows[0]
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

    switch (role) {
      case 'Dealer':     unique_id = await generateUniqueID('Dealer');     break;
      case 'Admin':      unique_id = await generateUniqueID('Admin');      break;
      case 'Marketer':   unique_id = await generateUniqueID('Marketer');   break;
      case 'SuperAdmin': unique_id = await generateUniqueID('SuperAdmin'); break;
      default:           unique_id = await generateUniqueID('User');
    }

    const saltRounds = 10;
    let hashedPassword, userData = {};

    if (role === 'Dealer') {
      const {
        first_name, last_name, gender,
        email, password,
        registered_business_name,
        registered_business_address, location
      } = req.body;

      if (
        !first_name || !last_name || !gender ||
        !email || !password ||
        !registered_business_name ||
        !registered_business_address || !location
      ) {
        return res.status(400).json({ message: 'All dealer fields are required.' });
      }
      if (!passwordRegex.test(password)) {
        return res.status(400).json({
          message: 'Password must be at least 12 characters with letters, numbers, and special characters.'
        });
      }
      if (!req.file) {
        return res.status(400).json({ message: 'Registration certificate (CAC) is required and must be a PDF.' });
      }
      if (req.file.mimetype !== 'application/pdf') {
        return res.status(400).json({ message: 'Registration certificate must be PDF.' });
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
        business_name: registered_business_name,
        business_address: registered_business_address,
        business_account_name: null,
        business_account_number: null,
        bank_name: null,
        account_number: null,
        account_name: null,
        registration_certificate_url: req.file.path
      };
    } else {
      const {
        first_name, last_name, gender,
        email, password,
        bank_name, account_number,
        account_name, location
      } = req.body;

      if (
        !first_name || !last_name || !gender ||
        !email || !password ||
        !bank_name || !account_number ||
        !account_name || !location
      ) {
        return res.status(400).json({ message: 'All required fields must be provided.' });
      }
      if (!/^\d{10}$/.test(account_number)) {
        return res.status(400).json({ message: 'Account number must be exactly 10 digits.' });
      }
      if (!passwordRegex.test(password)) {
        return res.status(400).json({
          message: 'Password must be at least 12 characters with letters, numbers, and special characters.'
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
        bank_name,
        account_number,
        account_name,
        business_name: null,
        business_address: null,
        business_account_name: null,
        business_account_number: null,
        registration_certificate_url: null
      };
    }

    const newUser = await createUser(userData);

    if (newUser.role === 'Marketer') {
      await pool.query(
        `INSERT INTO wallets (user_unique_id) VALUES ($1)`,
        [newUser.unique_id]
      );
    }

    await logActivity(
      req.user.id,
      `${req.user.first_name} ${req.user.last_name}`,
      'Create User',
      newUser.role,
      newUser.unique_id
    );

    return res.status(201).json({
      message: 'User created successfully',
      user: newUser
    });
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'users_email_key') {
      return res.status(409).json({ message: 'Email already exists' });
    }
    console.error(error);
    return res.status(500).json({ message: 'Internal server error' });
  }
};

/**
 * updateUser - Updates a user specified by :id.
 */
const updateUser = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const {
      first_name, last_name, email,
      bank_name, account_number,
      role, location, phone, profile_image
    } = req.body;

    const clauses = [];
    const values = [];
    let idx = 1;

    if (first_name)      { clauses.push(`first_name = $${idx}`);      values.push(first_name);      idx++; }
    if (last_name)       { clauses.push(`last_name = $${idx}`);       values.push(last_name);       idx++; }
    if (email)           { clauses.push(`email = $${idx}`);           values.push(email);           idx++; }
    if (bank_name)       { clauses.push(`bank_name = $${idx}`);       values.push(bank_name);       idx++; }
    if (account_number)  { clauses.push(`account_number = $${idx}`);  values.push(account_number);  idx++; }
    if (role)            { clauses.push(`role = $${idx}`);            values.push(role);            idx++; }
    if (location)        { clauses.push(`location = $${idx}`);        values.push(location);        idx++; }
    if (phone)           { clauses.push(`phone = $${idx}`);           values.push(phone);           idx++; }
    if (profile_image)   { clauses.push(`profile_image = $${idx}`);   values.push(profile_image);   idx++; }

    if (clauses.length === 0) {
      return res.status(400).json({ message: 'No fields provided for update.' });
    }

    clauses.push(`updated_at = NOW()`);
    const sql = `
      UPDATE users
         SET ${clauses.join(', ')}
       WHERE id = $${idx}
       RETURNING *
    `;
    values.push(userId);
    const { rowCount, rows } = await pool.query(sql, values);

    if (rowCount === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    await logActivity(
      req.user.id,
      `${req.user.first_name} ${req.user.last_name}`,
      'Update User',
      'User',
      rows[0].unique_id
    );

    return res.json({
      message: 'User updated successfully.',
      user: rows[0]
    });
  } catch (error) {
    if (error.code === '23505' && error.constraint === 'users_email_key') {
      return res.status(409).json({ message: 'That email is already in use.' });
    }
    next(error);
  }
};

/**
 * deleteUser - Deletes a user specified by :id.
 */
const deleteUser = async (req, res, next) => {
  try {
    const userId = parseInt(req.params.id, 10);
    const { rowCount, rows } = await pool.query(
      `DELETE FROM users WHERE id = $1 RETURNING *`,
      [userId]
    );
    if (rowCount === 0) {
      return res.status(404).json({ message: 'User not found' });
    }

    await logActivity(
      req.user.id,
      `${req.user.first_name} ${req.user.last_name}`,
      'Delete User',
      'User',
      rows[0].unique_id
    );

    return res.json({
      message: 'User deleted successfully',
      user: rows[0]
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
    if (req.user.role !== 'MasterAdmin') {
      return res.status(403).json({ message: 'Only a Master Admin can lock user accounts.' });
    }
    const userId = req.params.id;
    const { rowCount, rows } = await pool.query(
      `UPDATE users SET locked = true WHERE id = $1 RETURNING *`,
      [userId]
    );
    if (rowCount === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    await logActivity(
      req.user.id,
      `${req.user.first_name} ${req.user.last_name}`,
      'Lock User',
      'User',
      rows[0].unique_id
    );

    return res.status(200).json({
      message: 'User locked successfully',
      user: rows[0]
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
    if (req.user.role !== 'MasterAdmin') {
      return res.status(403).json({ message: 'Only a Master Admin can unlock user accounts.' });
    }
    const userId = req.params.id;
    const { rowCount, rows } = await pool.query(
      `UPDATE users SET locked = false WHERE id = $1 RETURNING *`,
      [userId]
    );
    if (rowCount === 0) {
      return res.status(404).json({ message: 'User not found.' });
    }

    await logActivity(
      req.user.id,
      `${req.user.first_name} ${req.user.last_name}`,
      'Unlock User',
      'User',
      rows[0].unique_id
    );

    return res.status(200).json({
      message: 'User unlocked successfully',
      user: rows[0]
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
    let query = 'SELECT * FROM users';
    const values = [];
    if (role) {
      query += ' WHERE role = $1';
      values.push(role);
    }
    const { rows } = await pool.query(query, values);
    return res.status(200).json({ users: rows });
  } catch (error) {
    next(error);
  }
};

/**
 * getUserSummary - Provides a summary of user activities.
 */
const getUserSummary = async (req, res, next) => {
  try {
    const totalResult = await pool.query('SELECT COUNT(*) FROM users');
    const roleResult = await pool.query('SELECT role, COUNT(*) AS count FROM users GROUP BY role');
    const lockedResult = await pool.query('SELECT COUNT(*) FROM users WHERE locked = true');

    return res.status(200).json({
      totalUsers: parseInt(totalResult.rows[0].count, 10),
      usersByRole: roleResult.rows,
      lockedUsers: parseInt(lockedResult.rows[0].count, 10)
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
    const totalUsersResult = await pool.query('SELECT COUNT(*) AS total FROM users');
    const totalOrdersResult = await pool.query('SELECT COUNT(*) AS total FROM orders');
    const pendingApprovalsResult = await pool.query(
      "SELECT COUNT(*) AS total FROM users WHERE overall_verification_status = 'pending'"
    );
    const totalSalesResult = await pool.query(
      'SELECT COALESCE(SUM(sold_amount), 0) AS total_sales FROM orders'
    );

    return res.status(200).json({
      totalUsers: parseInt(totalUsersResult.rows[0].total, 10),
      totalOrders: parseInt(totalOrdersResult.rows[0].total, 10),
      pendingApprovals: parseInt(pendingApprovalsResult.rows[0].total, 10),
      totalSales: parseFloat(totalSalesResult.rows[0].total_sales) || 0,
      activeSessions: 0
    });
  } catch (error) {
    next(error);
  }
};

/**
 * assignMarketersToAdmin - Assigns one or multiple Marketers to an Admin using unique IDs.
 */
const assignMarketersToAdmin = async (req, res, next) => {
  try {
    if (req.user.role !== 'MasterAdmin') {
      return res.status(403).json({ message: 'Only a Master Admin can assign marketers to an Admin.' });
    }
    let { adminUniqueId, marketerUniqueIds } = req.body;
    if (!adminUniqueId || !marketerUniqueIds) {
      return res.status(400).json({ message: 'Both adminUniqueId and marketerUniqueIds are required.' });
    }
    if (!Array.isArray(marketerUniqueIds)) marketerUniqueIds = [marketerUniqueIds];
    if (marketerUniqueIds.length === 0) {
      return res.status(400).json({ message: 'At least one marketer ID must be provided.' });
    }

    const adminCheck = await pool.query(
      "SELECT unique_id FROM users WHERE unique_id = $1 AND role = 'Admin'",
      [adminUniqueId]
    );
    if (adminCheck.rowCount === 0) {
      return res.status(404).json({ message: 'Admin not found.' });
    }

    const marketerCheck = await pool.query(
      "SELECT unique_id FROM users WHERE unique_id = ANY($1::text[]) AND role = 'Marketer'",
      [marketerUniqueIds]
    );
    const validMarketerUniqueIds = marketerCheck.rows.map(r => r.unique_id);
    const invalidIds = marketerUniqueIds.filter(id => !validMarketerUniqueIds.includes(id));
    if (invalidIds.length > 0) {
      return res.status(404).json({ message: `Invalid marketers: ${invalidIds.join(', ')}` });
    }

    const query = `
      UPDATE users
      SET admin_id   = (SELECT id FROM users WHERE unique_id = $1),
          updated_at = NOW()
      WHERE unique_id = ANY($2::text[])
        AND role = 'Marketer'
      RETURNING *
    `;
    const { rows } = await pool.query(query, [adminUniqueId, marketerUniqueIds]);

    await logActivity(
      req.user.id,
      `${req.user.first_name} ${req.user.last_name}`,
      'Assign Marketers to Admin',
      'Marketer',
      marketerUniqueIds.join(',')
    );

    return res.status(200).json({
      message: 'Marketers assigned to Admin successfully.',
      assignedMarketers: rows
    });
  } catch (error) {
    next(error);
  }
};

/**
 * assignAdminToSuperAdmin - Assigns one or multiple Admins to a Super Admin using unique IDs.
 */
const assignAdminToSuperAdmin = async (req, res, next) => {
  try {
    if (req.user.role !== 'MasterAdmin') {
      return res.status(403).json({ message: 'Only a Master Admin can assign admins to a Super Admin.' });
    }
    let { superAdminUniqueId, adminUniqueIds } = req.body;
    if (!superAdminUniqueId || !adminUniqueIds) {
      return res.status(400).json({ message: 'Both superAdminUniqueId and adminUniqueIds are required.' });
    }
    if (!Array.isArray(adminUniqueIds)) adminUniqueIds = [adminUniqueIds];
    if (adminUniqueIds.length === 0) {
      return res.status(400).json({ message: 'At least one admin ID must be provided.' });
    }

    const superAdminCheck = await pool.query(
      "SELECT id FROM users WHERE unique_id = $1 AND role = 'SuperAdmin'",
      [superAdminUniqueId]
    );
    if (superAdminCheck.rowCount === 0) {
      return res.status(404).json({ message: 'Super Admin not found.' });
    }

    const adminCheck = await pool.query(
      "SELECT unique_id FROM users WHERE unique_id = ANY($1::text[]) AND role = 'Admin'",
      [adminUniqueIds]
    );
    const validAdminIds = adminCheck.rows.map(r => r.unique_id);
    const invalidIds = adminUniqueIds.filter(id => !validAdminIds.includes(id));
    if (invalidIds.length > 0) {
      return res.status(404).json({ message: `Invalid admins: ${invalidIds.join(', ')}` });
    }

    const query = `
      UPDATE users
      SET super_admin_id = (SELECT id FROM users WHERE unique_id = $1),
          updated_at     = NOW()
      WHERE unique_id = ANY($2::text[])
        AND role = 'Admin'
      RETURNING *
    `;
    const { rows } = await pool.query(query, [superAdminUniqueId, adminUniqueIds]);

    await logActivity(
      req.user.id,
      `${req.user.first_name} ${req.user.last_name}`,
      'Assign Admins to Super Admin',
      'Admin',
      adminUniqueIds.join(',')
    );

    return res.status(200).json({
      message: 'Admins assigned to Super Admin successfully.',
      assignedAdmins: rows
    });
  } catch (error) {
    next(error);
  }
};

/**
 * unassignMarketersFromAdmin - Unassigns one or multiple Marketers from an Admin.
 */
const unassignMarketersFromAdmin = async (req, res, next) => {
  try {
    let { adminUniqueId, marketerUniqueIds } = req.body;
    if (!adminUniqueId || !marketerUniqueIds) {
      return res.status(400).json({ message: 'Both adminUniqueId and marketerUniqueIds are required.' });
    }
    if (!Array.isArray(marketerUniqueIds)) marketerUniqueIds = [marketerUniqueIds];
    if (marketerUniqueIds.length === 0) {
      return res.status(400).json({ message: 'At least one marketer ID must be provided.' });
    }

    const query = `
      UPDATE users
      SET admin_id   = NULL,
          updated_at = NOW()
      WHERE unique_id = ANY($1::text[])
        AND admin_id = (SELECT id FROM users WHERE unique_id = $2)
        AND role = 'Marketer'
      RETURNING *
    `;
    const { rows, rowCount } = await pool.query(query, [marketerUniqueIds, adminUniqueId]);

    if (rowCount === 0) {
      return res.status(404).json({ message: 'Marketer(s) not found or already unassigned.' });
    }

    await logActivity(
      req.user.id,
      `${req.user.first_name} ${req.user.last_name}`,
      'Unassign Marketers from Admin',
      'Marketer',
      marketerUniqueIds.join(',')
    );

    return res.status(200).json({
      message: 'Marketer(s) unassigned successfully.',
      unassignedMarketers: rows
    });
  } catch (error) {
    next(error);
  }
};

/**
 * unassignAdminsFromSuperadmin - Unassigns one or multiple Admins from a Super Admin.
 */
const unassignAdminsFromSuperadmin = async (req, res, next) => {
  try {
    let { superAdminUniqueId, adminUniqueIds } = req.body;
    if (!superAdminUniqueId || !adminUniqueIds) {
      return res.status(400).json({ message: 'Both superAdminUniqueId and adminUniqueIds are required.' });
    }
    if (!Array.isArray(adminUniqueIds)) adminUniqueIds = [adminUniqueIds];
    if (adminUniqueIds.length === 0) {
      return res.status(400).json({ message: 'At least one admin ID must be provided.' });
    }

    const query = `
      UPDATE users
      SET super_admin_id = NULL,
          updated_at     = NOW()
      WHERE unique_id = ANY($1::text[])
        AND super_admin_id = (SELECT id FROM users WHERE unique_id = $2)
        AND role = 'Admin'
      RETURNING *
    `;
    const { rows, rowCount } = await pool.query(query, [adminUniqueIds, superAdminUniqueId]);

    if (rowCount === 0) {
      return res.status(404).json({ message: 'No matching admins found or already unassigned.' });
    }

    await logActivity(
      req.user.id,
      `${req.user.first_name} ${req.user.last_name}`,
      'Unassign Admins from Super Admin',
      'Admin',
      adminUniqueIds.join(',')
    );

    return res.status(200).json({
      message: 'Admins unassigned successfully.',
      unassignedAdmins: rows
    });
  } catch (error) {
    next(error);
  }
};

/**
 * listMarketersByAdmin - Retrieves a list of Marketers assigned to a given Admin.
 */
const listMarketersByAdmin = async (req, res, next) => {
  try {
    const { adminUniqueId } = req.params;
    const adminResult = await pool.query(
      "SELECT id FROM users WHERE unique_id = $1 AND role = 'Admin'",
      [adminUniqueId]
    );
    if (adminResult.rowCount === 0) {
      return res.status(404).json({ message: 'Admin not found.' });
    }
    const adminId = adminResult.rows[0].id;

    const query = `
      SELECT unique_id, first_name, last_name, email, location, admin_id
      FROM users
      WHERE role = 'Marketer' AND admin_id = $1
      ORDER BY first_name, last_name
    `;
    const { rows } = await pool.query(query, [adminId]);
    return res.status(200).json({ assignedMarketers: rows });
  } catch (error) {
    next(error);
  }
};

/**
 * listAdminsBySuperAdmin - Retrieves a list of Admins assigned to a given SuperAdmin.
 */
const listAdminsBySuperAdmin = async (req, res, next) => {
  try {
    const { superAdminUniqueId } = req.params;
    const superAdminResult = await pool.query(
      "SELECT id FROM users WHERE unique_id = $1 AND role = 'SuperAdmin'",
      [superAdminUniqueId]
    );
    if (superAdminResult.rowCount === 0) {
      return res.status(404).json({ message: 'SuperAdmin not found.' });
    }
    const superAdminId = superAdminResult.rows[0].id;

    const query = `
      SELECT unique_id, first_name, last_name, email, location, super_admin_id
      FROM users
      WHERE role = 'Admin' AND super_admin_id = $1
      ORDER BY first_name, last_name
    `;
    const { rows } = await pool.query(query, [superAdminId]);
    return res.status(200).json({ assignedAdmins: rows });
  } catch (error) {
    next(error);
  }
};

/**
 * getAllAssignments - Retrieves all current assignment relationships.
 */
const getAllAssignments = async (req, res, next) => {
  try {
    const marketersAssignedResult = await pool.query(`
      SELECT 
        u.unique_id AS marketer_unique_id,
        u.admin_id,
        (SELECT unique_id FROM users WHERE id = u.admin_id) AS admin_unique_id,
        u.first_name, u.last_name, u.location
      FROM users u
      WHERE u.role = 'Marketer' AND u.admin_id IS NOT NULL
      ORDER BY u.first_name, u.last_name
    `);

    const adminsAssignedResult = await pool.query(`
      SELECT 
        u.unique_id AS admin_unique_id,
        u.super_admin_id,
        (SELECT unique_id FROM users WHERE id = u.super_admin_id) AS super_admin_unique_id,
        u.first_name, u.last_name, u.location
      FROM users u
      WHERE u.role = 'Admin' AND u.super_admin_id IS NOT NULL
      ORDER BY u.first_name, u.last_name
    `);

    return res.status(200).json({
      assignedMarketers: marketersAssignedResult.rows,
      assignedAdmins: adminsAssignedResult.rows
    });
  } catch (error) {
    next(error);
  }
};

/**
 * getAllDealers - Returns a list of all dealers from the users table.
 */
const getAllDealers = async (req, res, next) => {
  try {
    const { rows } = await pool.query(
          `SELECT id, unique_id, business_name, location
             FROM users
            WHERE role = 'Dealer'`
        );
    return res.json({ dealers: rows });
  } catch (error) {
    next(error);
  }
};

/**
 * getTotalUsers - returns the count of all users.
 */
async function getTotalUsers(req, res, next) {
  try {
    const { rows } = await pool.query(`
      SELECT COUNT(*)::int AS total_users
      FROM users
    `);
    return res.json({ totalUsers: rows[0].total_users });
  } catch (error) {
    next(error);
  }
}

/**
 * getStats - Provides various platform statistics.
 */
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
    return res.json(rows[0]);
  } catch (error) {
    next(error);
  }
}

/**
 * getRecentActivity - Returns the latest activity log entries.
 */
async function getRecentActivity(req, res, next) {
  try {
    const limit = parseInt(req.query.limit, 10) || 20;
    const { rows } = await pool.query(
      `SELECT id, actor_name, activity_type, entity_type, entity_unique_id, created_at
         FROM activity_logs
        ORDER BY created_at DESC
        LIMIT $1`,
      [limit]
    );
    return res.json({ activities: rows });
  } catch (error) {
    next(error);
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
  assignMarketersToAdmin,
  assignAdminToSuperAdmin,
  unassignMarketersFromAdmin,
  unassignAdminsFromSuperadmin,
  listMarketersByAdmin,
  listAdminsBySuperAdmin,
  getAllAssignments,
  getAllDealers,
  getTotalUsers,
  getStats,
  getRecentActivity
};
