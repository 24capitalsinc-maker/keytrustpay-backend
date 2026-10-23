import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import { ENV } from '../config/env';

// Initialize Resend client if valid API key is available
let resendClient: Resend | null = null;
if (ENV.RESEND_API_KEY && ENV.RESEND_API_KEY.startsWith('re_') && !ENV.RESEND_API_KEY.includes('your_api_key')) {
    try {
        resendClient = new Resend(ENV.RESEND_API_KEY);
    } catch (err) {
        console.warn('[EmailService] Could not initialize Resend client:', err);
    }
}

// Check if SMTP credentials appear configured
const isSmtpConfigured = (): boolean => {
    if (!ENV.SMTP_HOST || !ENV.SMTP_USER || !ENV.SMTP_PASS) return false;
    const pass = (ENV.SMTP_PASS || '').trim().toLowerCase();
    const isPlaceholder =
        pass === '' ||
        pass === 'your_mailbox_password_here' ||
        pass === 'yourpassword' ||
        pass === 'changeme';
    return !isPlaceholder;
};

// Create a configured SMTP transporter with resilient timeouts
const getTransporter = () => {
    return nodemailer.createTransport({
        host: ENV.SMTP_HOST,
        port: ENV.SMTP_PORT, // 465 for SSL, 587 for TLS
        secure: ENV.SMTP_PORT === 465,
        auth: {
            user: ENV.SMTP_USER,
            pass: ENV.SMTP_PASS,
        },
        tls: {
            rejectUnauthorized: false,
            minVersion: 'TLSv1.2',
        },
        connectionTimeout: 10000,
        greetingTimeout: 10000,
        socketTimeout: 15000,
    });
};

/**
 * Universal email dispatcher:
 * 1. Attempts Resend (REST API) if available (ultra-reliable on Vercel/serverless)
 * 2. Falls back to Nodemailer (SMTP)
 * 3. Gracefully logs diagnostic output if neither service is configured
 */
const sendEmail = async ({
    to,
    subject,
    html,
    text,
    fromName = 'KeyTrust Pay',
}: {
    to: string;
    subject: string;
    html: string;
    text: string;
    fromName?: string;
}): Promise<boolean> => {
    const fromAddress = `"${fromName}" <${ENV.SMTP_USER || 'support@keytrustpay.org'}>`;

    // 1. Try Resend if configured
    if (resendClient) {
        try {
            const result = await resendClient.emails.send({
                from: fromAddress,
                to: [to],
                subject,
                html,
                text,
            });
            console.log(`✅ [Resend] Email delivered to ${to} (Subject: ${subject}, ID: ${result.data?.id})`);
            return true;
        } catch (resendError: any) {
            console.warn(`⚠️ [Resend] Failed to send to ${to}, attempting SMTP fallback:`, resendError.message);
        }
    }

    // 2. Try SMTP
    if (isSmtpConfigured()) {
        try {
            const transporter = getTransporter();
            const info = await transporter.sendMail({
                from: fromAddress,
                to,
                subject,
                html,
                text,
            });
            console.log(`✅ [SMTP] Email delivered to ${to} (Subject: ${subject}, MessageID: ${info.messageId})`);
            return true;
        } catch (smtpError: any) {
            console.error(`❌ [SMTP] Error delivering email to ${to}:`, smtpError.message);
            return false;
        }
    }

    console.warn(`⚠️ [EmailService] Skipped email to ${to} ("${subject}"). Set SMTP_PASS or RESEND_API_KEY in Vercel.`);
    return false;
};

// Base HTML Template with KeyTrust Pay Obsidian/Cyan Institutional Styling
const getBaseTemplate = (title: string, content: string, category: string = 'KeyTrust Pay Notification') => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
</head>
<body style="margin: 0; padding: 0; background-color: #060911; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #e2e8f0;">
    <div style="background-color: #060911; padding: 40px 16px;">
        <div style="max-width: 580px; margin: 0 auto; background-color: #0f172a; border: 1px solid rgba(56, 189, 248, 0.25); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0,0,0,0.6);">
            
            <!-- Header with KeyTrust Pay Branding -->
            <div style="padding: 28px 32px; background: linear-gradient(135deg, #0b1120 0%, #1e293b 100%); border-bottom: 1px solid rgba(56, 189, 248, 0.2);">
                <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px;">
                    <span style="color: #38bdf8; font-size: 11px; letter-spacing: 0.18em; text-transform: uppercase; font-weight: 700;">${category}</span>
                    <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: #34d399;"></span>
                </div>
                <div style="margin-top: 4px;">
                    <span style="font-size: 20px; font-weight: 800; color: #ffffff; letter-spacing: -0.02em;">KeyTrust</span>
                    <span style="font-size: 20px; font-weight: 800; color: #38bdf8; margin-left: 2px;">PAY</span>
                </div>
                <h1 style="font-size: 19px; font-weight: 600; margin: 16px 0 0 0; color: #ffffff; letter-spacing: -0.01em;">${title}</h1>
            </div>
            
            <!-- Email Body Content -->
            <div style="padding: 32px; text-align: left; line-height: 1.65; color: #cbd5e1; font-size: 14px;">
                ${content}
            </div>
            
            <!-- Institutional Footer -->
            <div style="padding: 24px 32px; border-top: 1px solid #1e293b; background-color: #0a0f1d; text-align: center;">
                <p style="color: #64748b; font-size: 12px; margin: 0 0 8px 0; line-height: 1.5;">
                    This is an automated security communication from <strong>KeyTrust Pay</strong>.<br>
                    Need assistance? Contact our team at <a href="mailto:${ENV.ADMIN_EMAIL}" style="color: #38bdf8; text-decoration: none;">${ENV.ADMIN_EMAIL}</a>
                </p>
                <p style="color: #475569; font-size: 11px; margin: 0;">
                    &copy; 2026 KeyTrust Pay Inc. All rights reserved. 256-Bit TLS Bank-Grade Security.
                </p>
            </div>
        </div>
    </div>
</body>
</html>
`;

/**
 * 1. Registration / Login 2FA Verification Code Email
 */
export const sendVerificationEmail = async (
    email: string,
    name: string,
    code: string,
    type: 'registration' | 'login' = 'registration'
) => {
    const isLogin = type === 'login';
    const title = isLogin ? 'Sign-In Authorization Code' : 'Verify Your Email Address';
    const subheader = isLogin
        ? 'A sign-in request was initiated for your KeyTrust Pay account after an extended session interval. Enter the authorization code below to complete sign-in:'
        : 'Thank you for registering with KeyTrust Pay. Please confirm your email address using the one-time authorization code below:';

    const html = getBaseTemplate(
        title,
        `<p style="margin-top: 0;">Hello <strong>${name}</strong>,</p>
         <p>${subheader}</p>
         <div style="background: rgba(15, 23, 42, 0.9); border: 1px solid rgba(56, 189, 248, 0.4); padding: 26px; text-align: center; margin: 26px 0; border-radius: 12px; box-shadow: inset 0 2px 8px rgba(0,0,0,0.4);">
            <p style="color: #94a3b8; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; margin: 0 0 8px 0; font-weight: 600;">One-Time Security PIN</p>
            <p style="color: #38bdf8; font-size: 38px; font-weight: 800; letter-spacing: 0.28em; margin: 0; font-family: 'Courier New', Courier, monospace;">${code}</p>
            <p style="color: #64748b; font-size: 12px; margin: 10px 0 0 0;">This code will expire in <strong>15 minutes</strong></p>
         </div>
         <p style="font-size: 13px; color: #94a3b8; line-height: 1.5;">
            <strong>Security Notice:</strong> KeyTrust Pay representatives will never ask you for this code. If you did not initiate this request, someone may be trying to access your account. Please notify support immediately.
         </p>`,
        isLogin ? 'Login Security' : 'Account Activation'
    );

    const text = `Hello ${name},\n\nYour KeyTrust Pay one-time security code is: ${code}\n\nThis code expires in 15 minutes.\n\nIf you did not initiate this request, contact support immediately.`;

    await sendEmail({
        to: email,
        subject: `${code} is your KeyTrust Pay verification code`,
        html,
        text,
        fromName: 'KeyTrust Pay Security',
    });
};

/**
 * 2. Login Alert Notification Email (Dispatched when user logs in)
 */
export const sendLoginAlertEmail = async (
    email: string,
    name: string,
    details: { ip?: string; userAgent?: string; time?: Date } = {}
) => {
    const loginTime = (details.time || new Date()).toUTCString();
    const ip = details.ip || 'Recorded at login';
    const device = details.userAgent || 'Web Browser';

    const html = getBaseTemplate(
        'Account Login Notification',
        `<p style="margin-top: 0;">Hello <strong>${name}</strong>,</p>
         <p>Your KeyTrust Pay account was recently accessed.</p>
         <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 20px; margin: 24px 0;">
            <table style="width: 100%; font-size: 13px; color: #cbd5e1; border-collapse: collapse;">
                <tr>
                    <td style="color: #64748b; padding: 6px 0;">Date & Time</td>
                    <td style="text-align: right; color: #ffffff; font-weight: 500;">${loginTime}</td>
                </tr>
                <tr>
                    <td style="color: #64748b; padding: 6px 0;">IP Address</td>
                    <td style="text-align: right; font-family: monospace; color: #38bdf8;">${ip}</td>
                </tr>
                <tr>
                    <td style="color: #64748b; padding: 6px 0;">Client</td>
                    <td style="text-align: right; color: #cbd5e1; max-width: 260px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${device}</td>
                </tr>
                <tr>
                    <td style="color: #64748b; padding: 6px 0;">Status</td>
                    <td style="text-align: right; color: #34d399; font-weight: 600;">SUCCESSFUL</td>
                </tr>
            </table>
         </div>
         <p style="font-size: 13px; color: #94a3b8;">
            If this was you, no action is needed. If you did not log in, please reset your password immediately or contact our security department at <a href="mailto:${ENV.ADMIN_EMAIL}" style="color: #38bdf8;">${ENV.ADMIN_EMAIL}</a>.
         </p>`,
        'Account Activity'
    );

    const text = `KeyTrust Pay Security: Successful login for ${name} at ${loginTime}. IP: ${ip}. If this was not you, secure your account immediately.`;

    await sendEmail({
        to: email,
        subject: 'KeyTrust Pay: New Sign-in Alert',
        html,
        text,
        fromName: 'KeyTrust Pay Security',
    });
};

/**
 * 3. Welcome Email (After registration email verification)
 */
export const sendWelcomeEmail = async (email: string, name: string, accountNumber?: string) => {
    const html = getBaseTemplate(
        'Welcome to KeyTrust Pay',
        `<p style="margin-top: 0;">Hi <strong>${name}</strong>,</p>
         <p>Welcome to <strong>KeyTrust Pay</strong>! Your profile has been successfully verified and your digital account is active.</p>
         ${accountNumber ? `
         <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(56, 189, 248, 0.3); border-radius: 12px; padding: 20px; margin: 20px 0;">
            <p style="color: #94a3b8; font-size: 11px; text-transform: uppercase; letter-spacing: 0.15em; margin: 0 0 4px 0;">Your Account Number</p>
            <p style="color: #38bdf8; font-size: 24px; font-weight: 700; font-family: monospace; margin: 0;">${accountNumber}</p>
         </div>` : ''}
         <p>You can now manage multi-currency balances, send and receive funds domestically or across borders via SWIFT/IBAN, and track your transactions with 256-bit encryption.</p>
         <div style="margin-top: 24px; padding: 18px; border-radius: 10px; background: rgba(56, 189, 248, 0.08); border: 1px solid rgba(56, 189, 248, 0.2);">
            <p style="margin: 0; font-size: 13px; color: #38bdf8;"><strong>Account Status: Active & Protected</strong><br>Your profile is fully verified and ready for instant transfers.</p>
         </div>
         <p style="margin-top: 24px;">Thank you for choosing KeyTrust Pay.</p>`,
        'Welcome'
    );

    const text = `Welcome to KeyTrust Pay, ${name}!\n\nYour account has been successfully verified and is active.\nAccount Number: ${accountNumber || 'Active'}\n\nThank you for choosing KeyTrust Pay.`;

    await sendEmail({
        to: email,
        subject: 'Welcome to KeyTrust Pay - Your Account is Ready',
        html,
        text,
    });
};

/**
 * 4. Transaction Notification Email (Debit to sender or Credit to receiver)
 */
export const sendTransactionNotification = async (
    email: string,
    amount: number,
    type: 'debit' | 'credit',
    referenceId: string,
    status: string = 'pending',
    protocol: string = 'Domestic',
    details: {
        receiverName?: string;
        receiverAccount?: string;
        balance?: number;
        currency?: string;
    } = {}
) => {
    const isDebit = type === 'debit';
    const currency = details.currency || 'USD';
    const subject = isDebit
        ? `Transfer Initiated: ${currency} ${amount.toLocaleString()}`
        : `Funds Credited: ${currency} ${amount.toLocaleString()}`;

    const description = isDebit
        ? `Your transfer of <strong>${currency} ${amount.toLocaleString()}</strong> has been submitted via ${protocol} network.`
        : `Your account has been credited with an incoming transfer of <strong>${currency} ${amount.toLocaleString()}</strong> via ${protocol} network.`;

    const statusUpper = status.toUpperCase();
    const statusColor = statusUpper === 'SETTLED' || statusUpper === 'SUCCESS' ? '#34d399' : '#fbbf24';

    const html = getBaseTemplate(
        isDebit ? 'Transfer Initiated' : 'Funds Received',
        `<p style="margin-top: 0;">${description}</p>
         <div style="margin: 24px 0; border-radius: 12px; background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255, 255, 255, 0.08); padding: 22px;">
            <table style="width: 100%; font-size: 14px; color: #cbd5e1; border-collapse: collapse;">
                <tr>
                    <td style="color: #64748b; padding: 7px 0;">Amount</td>
                    <td style="text-align: right; font-weight: 700; color: ${isDebit ? '#f87171' : '#34d399'}; font-size: 16px;">
                        ${isDebit ? '-' : '+'}${currency} ${amount.toLocaleString()}
                    </td>
                </tr>
                <tr>
                    <td style="color: #64748b; padding: 7px 0;">Reference ID</td>
                    <td style="text-align: right; font-family: monospace; color: #38bdf8;">${referenceId}</td>
                </tr>
                ${details.receiverName ? `
                <tr>
                    <td style="color: #64748b; padding: 7px 0;">${isDebit ? 'Recipient' : 'Sender'}</td>
                    <td style="text-align: right; color: #ffffff;">${details.receiverName} ${details.receiverAccount ? `(${details.receiverAccount})` : ''}</td>
                </tr>` : ''}
                <tr>
                    <td style="color: #64748b; padding: 7px 0;">Network Protocol</td>
                    <td style="text-align: right;">${protocol}</td>
                </tr>
                <tr>
                    <td style="color: #64748b; padding: 7px 0;">Status</td>
                    <td style="color: ${statusColor}; text-align: right; font-weight: 600; text-transform: uppercase;">${statusUpper}</td>
                </tr>
                ${details.balance !== undefined ? `
                <tr style="border-top: 1px solid rgba(255,255,255,0.06);">
                    <td style="color: #64748b; padding-top: 12px;">Available Balance</td>
                    <td style="text-align: right; padding-top: 12px; font-weight: 600; color: #ffffff;">${currency} ${details.balance.toLocaleString()}</td>
                </tr>` : ''}
            </table>
         </div>
         <p style="font-size: 13px; color: #94a3b8;">
            You can view your detailed receipt and full transaction history directly on your <a href="${ENV.FRONTEND_URL || 'https://www.keytrustpay.org'}/dashboard" style="color: #38bdf8; text-decoration: none;">KeyTrust Pay Dashboard</a>.
         </p>`,
        'Transaction Alert'
    );

    const text = `KeyTrust Pay Alert: ${isDebit ? 'Outbound' : 'Inbound'} transfer of ${currency} ${amount.toLocaleString()} (${protocol}). Status: ${statusUpper}. Reference: ${referenceId}`;

    await sendEmail({
        to: email,
        subject,
        html,
        text,
    });
};

/**
 * 5. Transfer Status Update Email (When admin approves, settles, or rejects a transfer)
 */
export const sendTransferStatusUpdate = async (
    email: string,
    amount: number,
    status: string,
    referenceId: string,
    reason?: string,
    currency: string = 'USD'
) => {
    const isFailed = status.toLowerCase() === 'failed' || status.toLowerCase() === 'revoked' || status.toLowerCase() === 'cancelled';
    const isSuccess = status.toLowerCase() === 'success' || status.toLowerCase() === 'settled';
    const title = isSuccess ? 'Transfer Settled & Completed' : isFailed ? 'Transfer Update: Review Notice' : 'Transfer Status Updated';
    const statusColor = isSuccess ? '#34d399' : isFailed ? '#f87171' : '#fbbf24';

    const html = getBaseTemplate(
        title,
        `<p style="margin-top: 0;">Your transfer of <strong>${currency} ${amount.toLocaleString()}</strong> has been updated.</p>
         <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 22px; margin: 24px 0;">
            <p style="margin: 0 0 6px 0; font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: 0.1em;">Status</p>
            <p style="margin: 0; font-size: 22px; color: ${statusColor}; font-weight: 700;">${status.toUpperCase()}</p>
            ${reason ? `<p style="margin: 14px 0 0 0; font-size: 13px; color: #cbd5e1;"><strong>Note:</strong> ${reason}</p>` : ''}
            <div style="margin-top: 16px; pt-3; border-top: 1px solid rgba(255,255,255,0.06); font-size: 12px; color: #64748b;">
                Reference: <span style="font-family: monospace; color: #38bdf8;">${referenceId}</span>
            </div>
         </div>
         <p style="font-size: 13px; color: #94a3b8;">Log in to your KeyTrust Pay account to review updated balances and records.</p>`,
        'Account Activity'
    );

    const text = `KeyTrust Pay: The transfer of ${currency} ${amount.toLocaleString()} is now ${status.toUpperCase()}. Reference: ${referenceId}`;

    await sendEmail({
        to: email,
        subject: `Transfer Update: ${status.toUpperCase()} - KeyTrust Pay`,
        html,
        text,
    });
};

/**
 * 6. Account Balance Adjustment Notification (Deposits, Credits, or Administrative Adjustments)
 */
export const sendBalanceAdjustmentNotification = async (
    email: string,
    name: string,
    previousBalance: number,
    newBalance: number,
    currency: string = 'USD'
) => {
    const diff = newBalance - previousBalance;
    const isCredit = diff >= 0;
    const title = isCredit ? 'Account Credited' : 'Account Balance Updated';

    const html = getBaseTemplate(
        title,
        `<p style="margin-top: 0;">Hello <strong>${name}</strong>,</p>
         <p>An adjustment has been processed on your KeyTrust Pay account.</p>
         <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 20px; margin: 24px 0;">
            <table style="width: 100%; font-size: 13px; color: #cbd5e1; border-collapse: collapse;">
                <tr>
                    <td style="color: #64748b; padding: 6px 0;">Adjustment</td>
                    <td style="text-align: right; font-weight: 700; color: ${isCredit ? '#34d399' : '#f87171'};">
                        ${isCredit ? '+' : ''}${currency} ${diff.toLocaleString()}
                    </td>
                </tr>
                <tr>
                    <td style="color: #64748b; padding: 6px 0;">Previous Balance</td>
                    <td style="text-align: right; color: #94a3b8;">${currency} ${previousBalance.toLocaleString()}</td>
                </tr>
                <tr style="border-top: 1px solid rgba(255,255,255,0.06);">
                    <td style="color: #ffffff; font-weight: 600; padding-top: 10px;">New Balance</td>
                    <td style="text-align: right; font-weight: 700; color: #38bdf8; font-size: 16px; padding-top: 10px;">
                        ${currency} ${newBalance.toLocaleString()}
                    </td>
                </tr>
            </table>
         </div>
         <p style="font-size: 13px; color: #94a3b8;">If you have any questions regarding this adjustment, please contact support.</p>`,
        'Balance Update'
    );

    const text = `KeyTrust Pay: Your account balance was updated. New balance: ${currency} ${newBalance.toLocaleString()}`;

    await sendEmail({
        to: email,
        subject: `KeyTrust Pay: ${title} - ${currency} ${newBalance.toLocaleString()}`,
        html,
        text,
    });
};

/**
 * 7. Password Reset Email
 */
export const sendPasswordResetEmail = async (email: string, token: string) => {
    const resetURL = `${ENV.FRONTEND_URL || 'https://www.keytrustpay.org'}/reset-password/${token}`;
    const html = getBaseTemplate(
        'Reset Your Password',
        `<p style="margin-top: 0;">We received a request to reset the password for your KeyTrust Pay account.</p>
         <p>Click the secure button below to choose a new password:</p>
         <div style="text-align: center; margin: 32px 0;">
            <a href="${resetURL}" style="background: linear-gradient(135deg, #2563eb, #38bdf8); color: #ffffff; padding: 14px 34px; text-decoration: none; font-weight: 700; font-size: 14px; border-radius: 10px; display: inline-block; letter-spacing: 0.02em;">Choose New Password</a>
         </div>
         <p style="font-size: 12px; color: #94a3b8; line-height: 1.5;">
            Or copy and paste this link in your browser:<br>
            <span style="font-family: monospace; color: #38bdf8; word-break: break-all;">${resetURL}</span>
         </p>
         <p style="font-size: 13px; color: #64748b; margin-top: 24px;">This link expires in 15 minutes. If you did not make this request, you can safely ignore this email.</p>`,
        'Account Recovery'
    );

    const text = `Reset your KeyTrust Pay password here: ${resetURL}\n\nThis link expires in 15 minutes.`;

    await sendEmail({
        to: email,
        subject: 'Reset your KeyTrust Pay password',
        html,
        text,
        fromName: 'KeyTrust Pay Security',
    });
};

/**
 * 8. Security Alert Notification
 */
export const sendSecurityAlert = async (email: string, action: string, details?: string) => {
    const html = getBaseTemplate(
        'Security Notification',
        `<p style="margin-top: 0;">A security-sensitive change was made to your KeyTrust Pay account.</p>
         <div style="background: rgba(239, 68, 68, 0.08); border-left: 4px solid #ef4444; padding: 18px; border-radius: 8px; margin: 24px 0;">
            <p style="margin: 0; color: #f87171; font-weight: 700; font-size: 14px;">Activity Summary</p>
            <p style="margin: 8px 0 0 0; font-size: 13px; color: #e2e8f0;">${action}</p>
            ${details ? `<p style="margin: 8px 0 0 0; font-size: 12px; color: #94a3b8;">${details}</p>` : ''}
         </div>
         <p style="font-size: 13px; color: #94a3b8;">
            If you did not authorize this change, please immediately freeze your account or contact our operations desk at <a href="mailto:${ENV.ADMIN_EMAIL}" style="color: #38bdf8;">${ENV.ADMIN_EMAIL}</a>.
         </p>`,
        'Security Alert'
    );

    const text = `KeyTrust Pay Security Alert: ${action}. If this was not authorized by you, contact support immediately.`;

    await sendEmail({
        to: email,
        subject: 'Security Alert: Account Activity - KeyTrust Pay',
        html,
        text,
        fromName: 'KeyTrust Pay Security',
    });
};

/**
 * 9. Administrative Alert Notification
 */
export const sendAdminAlert = async (subject: string, content: string) => {
    const html = getBaseTemplate(
        'Operations Alert',
        content,
        'KeyTrust Admin Alert'
    );

    const text = `KeyTrust Pay Admin Alert: ${subject}\n\n${content.replace(/<[^>]+>/g, '')}`;

    await sendEmail({
        to: ENV.ADMIN_EMAIL,
        subject: `[KeyTrust Admin] ${subject}`,
        html,
        text,
        fromName: 'KeyTrust Alerts',
    });
};
