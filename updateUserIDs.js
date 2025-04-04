const { pool } = require('./src/config/database');
const { generateUniqueID } = require('./src/utils/uniqueId');

const updateExistingUsers = async () => {
  try {
    const result = await pool.query("SELECT id, role FROM users");
    for (const user of result.rows) {
      const newUniqueId = await generateUniqueID(user.role);
      await pool.query("UPDATE users SET unique_id = $1 WHERE id = $2", [newUniqueId, user.id]);
      console.log(`Updated user ${user.id} with new ID: ${newUniqueId}`);
    }
    console.log("Existing users updated successfully.");
    process.exit(0);
  } catch (error) {
    console.error("Error updating existing users:", error);
    process.exit(1);
  }
};

updateExistingUsers();
