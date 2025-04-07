const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require("express-rate-limit");
const session = require('express-session'); // Import express-session

dotenv.config();

const app = express();

// Tell Express to trust the first proxy in front of it.
app.set('trust proxy', 1);

// Configure and apply the rate limiter middleware.
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: "Too many requests from this IP, please try again later."
});
app.use(limiter);

// Other middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure CORS to allow requests from your Vercel domain and local development.
const allowedOrigins = [
  "https://vistapro-4xlusoclj-vistapros-projects.vercel.app",
  "http://localhost:5173",
  "https://www.vistapro.ng"
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));

app.use(helmet());

// Configure session middleware for secure cookies.
app.use(session({
  secret: process.env.SESSION_SECRET, // Define SESSION_SECRET in your .env file
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production', // true in production (requires HTTPS)
    httpOnly: true,
    sameSite: 'lax'
  }
}));

// Import routes
const authRoutes = require('./routes/authRoutes');
const masterAdminRoutes = require('./routes/masterAdminRoutes');
const superAdminRoutes = require('./routes/superAdminRoutes');
const adminRoutes = require('./routes/adminRoutes');
const dealerRoutes = require('./routes/dealerRoutes');
const dealerOrderRoutes = require('./routes/dealerOrderRoutes');
const marketerRoutes = require('./routes/marketerRoutes');
const verificationRoutes = require("./routes/verificationRoutes");
const marketerStockRoutes = require('./routes/marketerStockRoutes');
const outletRoutes = require('./routes/outletRoutes');
const productRoutes = require('./routes/productRoutes');
const manageOrderRoutes = require('./routes/manageOrderRoutes');
const reportRoutes = require('./routes/reportRoutes');
const profitReportRoutes = require('./routes/profitReportRoutes');
const cashoutRoutes = require('./routes/cashoutRoutes');
const performanceRoutes = require('./routes/performanceRoutes');
const stockupdateRoutes = require('./routes/stockupdateRoutes');
const bankRoutes = require("./routes/bankRoutes");

// Mount routes
app.use('/api/auth', authRoutes);
app.use('/api/master-admin', masterAdminRoutes);
app.use('/api/super-admin', superAdminRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/dealer', dealerRoutes);
app.use('/api/dealer/orders', dealerOrderRoutes);
app.use('/api/marketer', marketerRoutes);
app.use('/api/marketer/stock-update', marketerStockRoutes);
app.use('/api/outlet', outletRoutes);
app.use('/api/product', productRoutes);
app.use('/api/manage-order', manageOrderRoutes);
app.use('/api/report', reportRoutes);
app.use('/api/profit-report', profitReportRoutes);
app.use('/api/cashout', cashoutRoutes);
app.use('/api/performance', performanceRoutes);
app.use('/api/stock', stockupdateRoutes);
app.use("/api/banks", bankRoutes);
app.use("/api/verification", verificationRoutes);

// Error handling middleware
const errorHandler = require('./middlewares/errorHandler');
app.use(errorHandler);

module.exports = app;
