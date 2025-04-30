// src/controllers/dealerController.js
const { pool } = require('../config/database');
const bcrypt = require('bcrypt');

/**
 * getAccountSettings - Retrieves current dealer’s account info.
 * Returns business_name, business_address, bank_details, email, phone,
 * location, cac_certificate and profile_image.
 */
async function getAccountSettings(req, res, next) {
  try {
    const dealerUniqueId = req.user.unique_id;
    if (!dealerUniqueId) {
      return res.status(400).json({ message: "Dealer unique ID not available." });
    }

    const { rows } = await pool.query(
      `
      SELECT
        business_name,
        business_address,
        bank_details,
        email,
        phone,
        location,
        cac_certificate,
        profile_image
      FROM users
      WHERE unique_id = $1
      `,
      [dealerUniqueId]
    );

    if (!rows.length) {
      return res.status(404).json({ message: "User not found." });
    }

    res.json({ settings: rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * updateAccountSettings - Partially updates dealer’s profile.
 * Fields in req.body:
 *   business_name, business_address, bank_details,
 *   email, phone, location,
 *   newPassword, confirmNewPassword
 *
 * Files via Multer in req.files:
 *   cacCertificate, profileImage
 */
async function updateAccountSettings(req, res, next) {
  try {
    const dealerUniqueId = req.user.unique_id;
    if (!dealerUniqueId) {
      return res.status(400).json({ message: "Dealer unique ID not available." });
    }

    const {
      business_name,
      business_address,
      bank_details,
      email,
      phone,
      location,
      newPassword,
      confirmNewPassword,
    } = req.body;

    let clauses = [];
    let values = [];
    let idx = 1;

    // 1) Handle password change
    if (newPassword) {
      if (!confirmNewPassword || newPassword !== confirmNewPassword) {
        return res.status(400).json({ message: "New password and confirmation do not match." });
      }
      const hash = await bcrypt.hash(newPassword, 10);
      clauses.push(`password = $${idx++}`);
      values.push(hash);
    }

    // 2) Other optional fields
    if (business_name) {
      clauses.push(`business_name = $${idx++}`);
      values.push(business_name);
    }
    if (business_address) {
      clauses.push(`business_address = $${idx++}`);
      values.push(business_address);
    }
    if (bank_details) {
      clauses.push(`bank_details = $${idx++}`);
      values.push(bank_details);
    }
    if (email) {
      clauses.push(`email = $${idx++}`);
      values.push(email);
    }
    if (phone) {
      clauses.push(`phone = $${idx++}`);
      values.push(phone);
    }
    if (location) {
      clauses.push(`location = $${idx++}`);
      values.push(location);
    }

    // 3) File uploads
    if (req.files?.cacCertificate?.[0]) {
      clauses.push(`cac_certificate = $${idx++}`);
      values.push(req.files.cacCertificate[0].path);
    }
    if (req.files?.profileImage?.[0]) {
      clauses.push(`profile_image = $${idx++}`);
      values.push(req.files.profileImage[0].path);
    }

    if (!clauses.length) {
      return res.status(400).json({ message: "No fields provided for update." });
    }

    // 4) Add updated_at and unique_id for WHERE
    clauses.push(`updated_at = NOW()`);
    values.push(dealerUniqueId);

    const query = `
      UPDATE users
         SET ${clauses.join(', ')}
       WHERE unique_id = $${idx}
       RETURNING
         unique_id,
         business_name,
         business_address,
         bank_details,
         email,
         phone,
         location,
         cac_certificate,
         profile_image,
         updated_at
    `;

    const { rows } = await pool.query(query, values);

    if (!rows.length) {
      return res.status(404).json({ message: "User not found." });
    }

    res.json({ message: "Account updated successfully.", dealer: rows[0] });
  } catch (err) {
    next(err);
  }
}

/**
 * uploadInventory - Allows a Dealer to add an inventory item.
 */
async function uploadInventory(req, res, next) {
  try {
    const dealerId = req.user.id;
    const { device_name, device_model, device_imei } = req.body;
    if (!device_name || !device_model) {
      return res.status(400).json({ message: 'Device name and model are required.' });
    }
    const { rows } = await pool.query(
      `
      INSERT INTO dealer_inventory (dealer_id, device_name, device_model, device_imei, uploaded_at)
      VALUES ($1, $2, $3, $4, NOW())
      RETURNING *
      `,
      [dealerId, device_name, device_model, device_imei]
    );
    res.status(201).json({ message: 'Inventory item uploaded successfully.', inventory: rows[0] });
  } catch (error) {
    next(error);
  }
}

/**
 * getOrderHistory - Retrieves the order history for the dealer.
 */
async function getOrderHistory(req, res, next) {
  try {
    const dealerId = req.user.id;
    const { rows } = await pool.query(
      `
      SELECT *
        FROM orders
       WHERE dealer_id = $1
       ORDER BY created_at DESC
      `,
      [dealerId]
    );
    res.json({ message: 'Order history retrieved successfully.', orders: rows });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getAccountSettings,
  updateAccountSettings,
  uploadInventory,
  getOrderHistory,
};
