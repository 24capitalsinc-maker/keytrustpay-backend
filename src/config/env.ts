import dotenv from 'dotenv';

dotenv.config();

export const ENV = {
    PORT: process.env.PORT || 5000,
    MONGO_URI: (process.env.MONGO_URI as string) || 'mongodb://localhost:27017/banking_db',
    JWT_SECRET: (process.env.JWT_SECRET as string) || 'secret_key',
    REFRESH_TOKEN_SECRET: (process.env.REFRESH_TOKEN_SECRET as string) || 'refresh_secret_key',
    RESEND_API_KEY: (process.env.RESEND_API_KEY as string) || 're_your_api_key',
    ADMIN_EMAIL: (process.env.ADMIN_EMAIL as string) || 'admin@keytrustpay.org',
    SMTP_HOST: (process.env.SMTP_HOST as string) || 'server345.web-hosting.com',
    SMTP_PORT: parseInt(process.env.SMTP_PORT || '465'),
    SMTP_USER: (process.env.SMTP_USER as string) || 'support@keytrustpay.org',
    SMTP_PASS: (process.env.SMTP_PASS as string) || '',
    EMAIL_FROM: (process.env.EMAIL_FROM as string) || (process.env.FROM_EMAIL as string) || (process.env.SMTP_USER as string) || 'support@keytrustpay.org',
    FRONTEND_URL: process.env.FRONTEND_URL || 'http://localhost:3000',
    JWT_EXPIRES_IN: '24h',
    REFRESH_TOKEN_EXPIRES_IN: '7d',
};
