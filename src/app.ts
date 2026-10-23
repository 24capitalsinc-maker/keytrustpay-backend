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

const uploadDir = path.join(__dirname, '../uploads');
// Guard filesystem operations for Vercel/Serverless (read-only)
if (process.env.NODE_ENV !== 'production' && !fs.existsSync(uploadDir)) {
    try {
        fs.mkdirSync(uploadDir, { recursive: true });
    } catch (err) {
        console.warn('Warning: Could not create uploads directory (expected in serverless/vercel):', err);
    }
}

// Database Connection Middleware for Serverless/Vercel
app.use(async (req, res, next) => {
    try {
        await connectDB();
        next();
    } catch (err) {
        next(err);
    }
});

// Rate Limiting
const globalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 1000, // Limit each IP to 1000 requests per window
    standardHeaders: true,
    legacyHeaders: false,
    validate: { xForwardedForHeader: false, default: true },
    message: 'Too many requests from this IP, please try again after 15 minutes.'
});

// Middlewares
app.use(helmet());
app.use(globalLimiter);
app.use(cors({
    origin: (origin, callback) => {
        const allowed = [
            process.env.FRONTEND_URL,
            'http://localhost:3000',
            'http://localhost:3001',
            'http://192.168.1.239:3000',
        ].filter(Boolean);
        if (!origin || allowed.includes(origin) || (typeof origin === 'string' && origin.endsWith('.vercel.app'))) {
            callback(null, origin || '*');
        } else {
            callback(new Error(`CORS: Origin ${origin} not allowed`));
        }
    },
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
}));
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
