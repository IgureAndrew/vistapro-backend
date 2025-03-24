// src/app.js
const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');

dotenv.config();

const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(helmet());

// Import routes
const authRoutes = require('./routes/authRoutes');
const masterAdminRoutes = require('./routes/masterAdminRoutes');
const superAdminRoutes = require('./routes/superAdminRoutes');
const adminRoutes = require('./routes/adminRoutes');
const dealerRoutes = require('./routes/dealerRoutes');
const dealerOrderRoutes = require('./routes/dealerOrderRoutes');
const marketerRoutes = require('./routes/marketerRoutes');
const marketerVerificationRoutes = require('./routes/marketerVerificationRoutes');
const marketerStockRoutes = require('./routes/marketerStockRoutes');
const outletRoutes = require('./routes/outletRoutes');
const productRoutes = require('./routes/productRoutes');
const manageOrderRoutes = require('./routes/manageOrderRoutes');
const reportRoutes = require('./routes/reportRoutes');
const profitReportRoutes = require('./routes/profitReportRoutes');
const cashoutRoutes = require('./routes/cashoutRoutes');
const performanceRoutes = require('./routes/performanceRoutes');
const stockRoutes = require('./routes/stockRoutes');
const verificationRoutes = require('./routes/verificationRoutes');


// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/master-admin', masterAdminRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/dealer', dealerRoutes);
app.use('/api/dealer/orders', dealerOrderRoutes);
app.use('/api/marketer', marketerRoutes); // Marketer profile and order endpoints
app.use('/api/marketer/verification', marketerVerificationRoutes);
app.use('/api/marketer/stock-update', marketerStockRoutes);
app.use('/api/outlet', outletRoutes);
app.use('/api/product', productRoutes);
app.use('/api/manage-order', manageOrderRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/profit-report', profitReportRoutes);
app.use('/api/cashout', cashoutRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/stock', stockRoutes);
app.use('/api/verification', verificationRoutes);


// Error handling middleware
const errorHandler = require('./middlewares/errorHandler');
app.use(errorHandler);

module.exports = app;
