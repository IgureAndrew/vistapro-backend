// src/utils/uniqueId.js

const { v4: uuidv4 } = require("uuid");

/**
 * generateUniqueID - returns a string that includes a prefix and a UUID.
 * E.g., "USER-4c3b9b34-11ac-4f2f-9d6e-6757ac945b44"
 * Adjust the logic to your needs (like an incremental ID).
 */
function generateUniqueID(prefix = "USER") {
  const uuid = uuidv4(); // or any other approach
  return `${prefix}-${uuid}`;
}

module.exports = { generateUniqueID };
