// src/utils/uniqueId.js
const { pool } = require("../config/database");

const getNextSequenceValue = async (sequenceName) => {
  const result = await pool.query(`SELECT nextval('${sequenceName}') AS seq`);
  return result.rows[0].seq;
};

// Generate a custom ID based on role.
// For example, Marketer's ID: DSR00001, Admin's ID: ASM000001, etc.
const generateUniqueID = async (role) => {
  let prefix, seqName, padLength;
  switch (role) {
    case "Marketer":
      prefix = "DSR";
      seqName = "seq_marketer";
      padLength = 5; // e.g., DSR00001
      break;
    case "Admin":
      prefix = "ASM";
      seqName = "seq_admin";
      padLength = 6; // e.g., ASM000001
      break;
    case "SuperAdmin":
      prefix = "SM";
      seqName = "seq_superadmin";
      padLength = 6; // e.g., SM000001
      break;
    case "MasterAdmin":
      prefix = "RSM";
      seqName = "seq_masteradmin";
      padLength = 3; // e.g., RSM001
      break;
    case "Dealer":
      prefix = "DLR";
      seqName = "seq_dealer";
      padLength = 5;
      break;
    default:
      prefix = "USR";
      seqName = "seq_dealer"; // fallback sequence
      padLength = 5;
  }
  const nextVal = await getNextSequenceValue(seqName);
  const formattedNumber = String(nextVal).padStart(padLength, "0");
  return prefix + formattedNumber;
};

module.exports = { generateUniqueID };
