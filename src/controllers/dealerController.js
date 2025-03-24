// src/controllers/dealerController.js
const { pool } = require('../config/database');
const bcrypt = require('bcrypt');

/**
 * updateProfile - Allows a Dealer to update their profile details.
 * Expects the dealer's ID from req.user (set by verifyToken middleware),
 * and the following fields in req.body:
 *   - business_name: Registered business name
 *   - business_address: Registered business address
 *   - bank_details: Business account details
 *   - email: Email address
 *   - phone: Phone number
 *   - newPassword: New password (optional)
 *   - confirmNewPassword: Re-entered new password (optional, must match newPassword)
 *
 * Expects file uploads via Multer:
 *   - cacCertificate: The uploaded CAC certificate file
 *   - profileImage: The uploaded facial profile image
 */
const updateProfile = async (req, res, next) => {
  try {
    const dealerId = req.user.id;
    const {
      business_name,
      business_address,
      bank_details,
      email,
      phone,
      newPassword,
      confirmNewPassword,
    } = req.body;

    // If new password is provided, ensure confirmNewPassword matches.
    let hashedPassword = null;
    if (newPassword) {
      if (!confirmNewPassword || newPassword !== confirmNewPassword) {
        return res.status(400).json({
          message: 'New password and confirmation do not match.',
        });
      }
      const saltRounds = 10;
      hashedPassword = await bcrypt.hash(newPassword, saltRounds);
    }

    // Get file paths from uploaded files.
    // req.files will have properties cacCertificate and profileImage as arrays.
    const cacCertificate =
      req.files && req.files.cacCertificate && req.files.cacCertificate[0]
        ? req.files.cacCertificate[0].path
        : null;
    const profileImage =
      req.files && req.files.profileImage && req.files.profileImage[0]
        ? req.files.profileImage[0].path
        : null;

    // Build the update query. Using COALESCE to keep existing values if no new value is provided.
    const query = `
      UPDATE users
      SET 
          business_name = COALESCE($1, business_name),
          business_address = COALESCE($2, business_address),
          bank_details = COALESCE($3, bank_details),
          email = COALESCE($4, email),
          phone = COALESCE($5, phone),
          cac_certificate = COALESCE($6, cac_certificate),
          profile_image = COALESCE($7, profile_image),
          password = COALESCE($8, password),
          updated_at = NOW()
      WHERE id = $9
      RETURNING *
    `;
    const values = [
      business_name,
      business_address,
      bank_details,
      email,
      phone,
      cacCertificate,
      profileImage,
      hashedPassword,
      dealerId,
    ];
    const result = await pool.query(query, values);

    return res.status(200).json({
      message: 'Dealer profile updated successfully.',
      dealer: result.rows[0],
    });
  } catch (error) {
    next(error);
  }
};

/**
 * uploadInventory - Allows a Dealer to add an inventory item.
 */
const uploadInventory = async (req, res, next) => {
  try {
    const dealerId = req.user.id;
    const { device_name, device_model, device_imei } = req.body;
    if (!device_name || !device_model) {
      return res.status(400).json({ message: 'Device name and model are required.' });
    }
    const query = `
      INSERT INTO dealer_inventory (dealer_id, device_name, device_model, device_imei, uploaded_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING *
    `;
    const values = [dealerId, device_name, device_model, device_imei];
    const result = await pool.query(query, values);
    return res.status(201).json({
      message: 'Inventory item uploaded successfully.',
      inventory: result.rows[0]
    });
  } catch (error) {
    next(error);
  }
};

/**
 * getOrderHistory - Retrieves the order history for the dealer.
 */
const getOrderHistory = async (req, res, next) => {
  try {
    const dealerId = req.user.id;
    const query = `
      SELECT * FROM orders
      WHERE dealer_id = $1
      ORDER BY created_at DESC
    `;
    const result = await pool.query(query, [dealerId]);
    return res.status(200).json({
      message: 'Order history retrieved successfully.',
      orders: result.rows
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  updateProfile,
  uploadInventory,
  getOrderHistory
};
