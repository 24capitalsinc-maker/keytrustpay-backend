import express from 'express';
import path from 'path';
import fs from 'fs';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { connectDB } from './config/database';

import authRoutes from './routes/authRoutes';
import transactionRoutes from './routes/transactionRoutes';
import adminRoutes from './routes/adminRoutes';
import userRoutes from './routes/userRoutes';
import publicRoutes from './routes/publicRoutes';
import { errorHandler } from './middleware/errorMiddleware';

const app = express();

// Trust reverse proxy (Vercel, Cloudflare, etc.) so req.ip and express-rate-limit read forwarded headers correctly
app.set('trust proxy', 1);

// Helper function to validate allowed origins
const isOriginAllowed = (origin?: string): boolean => {
    if (!origin) return true; // Server-to-server, curl, mobile apps, Postman

    const cleanOrigin = origin.trim().replace(/\/+$/, '');

    // Allow keytrustpay.org and all subdomains (www.keytrustpay.org, app.keytrustpay.org, etc.)
    if (/^https?:\/\/([a-zA-Z0-9-]+\.)*keytrustpay\.org$/i.test(cleanOrigin)) {
        return true;
    }

    // Allow all Vercel deployment and preview URLs (*.vercel.app)
    if (/^https?:\/\/([a-zA-Z0-9-]+\.)*vercel\.app$/i.test(cleanOrigin)) {
        return true;
    }

    // Allow local development (localhost / 127.0.0.1 on any port)
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(cleanOrigin)) {
        return true;
    }

    // Allow local network IPs
    if (/^https?:\/\/(192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/i.test(cleanOrigin)) {
        return true;
    }

    // Allow FRONTEND_URL from environment variable (and its www/non-www variants)
    if (process.env.FRONTEND_URL) {
        const fe = process.env.FRONTEND_URL.trim().replace(/\/+$/, '');
        if (cleanOrigin.toLowerCase() === fe.toLowerCase()) return true;

        const feNoWww = fe.replace(/^https?:\/\/www\./i, 'https://');
        const feWithWww = fe.replace(/^https?:\/\/(?!www\.)/i, 'https://www.');
        if (cleanOrigin.toLowerCase() === feNoWww.toLowerCase() || cleanOrigin.toLowerCase() === feWithWww.toLowerCase()) {
            return true;
        }
    }

    return false;
};

// CORS configuration - mounted FIRST so OPTIONS preflights resolve immediately
const corsOptions: cors.CorsOptions = {
    origin: (origin, callback) => {
        if (isOriginAllowed(origin)) {
            callback(null, true);
        } else {
            console.warn(`[CORS] Blocked request from origin: ${origin}`);
            callback(null, false);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
        'Content-Type',
        'Authorization',
        'X-Requested-With',
        'Accept',
        'Origin',
        'Cache-Control',
        'Pragma',
        'X-Forwarded-For'
    ],
    exposedHeaders: ['Content-Range', 'X-Content-Range', 'Authorization'],
    optionsSuccessStatus: 200,
    maxAge: 86400 // Cache preflight response for 24 hours
};

// 1. Mount CORS first & handle OPTIONS preflight globally
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// 2. Helmet with crossOriginResourcePolicy allowing cross-origin API clients
app.use(helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

const uploadDir = path.join(__dirname, '../uploads');
// Guard filesystem operations for Vercel/Serverless (read-only)
if (process.env.NODE_ENV !== 'production' && !fs.existsSync(uploadDir)) {
    try {
        fs.mkdirSync(uploadDir, { recursive: true });
    } catch (err) {
        console.warn('Warning: Could not create uploads directory (expected in serverless/vercel):', err);
    }
}

// 3. Rate Limiting
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, default: true },
    message: 'Too many requests from this IP, please try again after 15 minutes.'
});
app.use(globalLimiter);

// 4. Database Connection Middleware for Serverless/Vercel
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        next(err);
    }
});

// 5. Body parsers & static assets
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ limit: '10mb', extended: true }));
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Routes
app.use('/api/public', publicRoutes);
app.use('/api/auth', authRoutes);
app.use('/api/transactions', transactionRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/users', userRoutes);

// Basic route
app.get('/', (req, res) => {
    res.send('Banking API is running... ok!');
});

// Error Handler
app.use(errorHandler);

export default app;
