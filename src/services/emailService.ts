import nodemailer from 'nodemailer';
import { ENV } from '../config/env';

// Create a transporter using SMTP settings
const transporter = nodemailer.createTransport({
    host: ENV.SMTP_HOST,
    port: ENV.SMTP_PORT, // 465 for SSL, 587 for TLS
    secure: ENV.SMTP_PORT === 465, // true for 465, false for other ports
    auth: {
        user: ENV.SMTP_USER,
        pass: ENV.SMTP_PASS,
    },
    tls: {
        rejectUnauthorized: false
    }
});

const getBaseTemplate = (title: string, content: string, category: string = "KeyTrust Pay Notification") => `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f19; color: #e2e8f0; padding: 40px 20px;">
        <div style="max-width: 580px; margin: 0 auto; background-color: #111827; border: 1px solid rgba(59, 130, 246, 0.2); border-radius: 16px; overflow: hidden; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
            <!-- Header -->
            <div style="padding: 28px 36px; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); border-bottom: 1px solid rgba(59, 130, 246, 0.2);">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                    <p style="color: #38bdf8; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; font-weight: 700; margin: 0 0 8px 0;">${category}</p>
                </div>
                <h1 style="font-size: 22px; font-weight: 600; margin: 0; color: #ffffff; letter-spacing: -0.02em;">${title}</h1>
            </div>
            
            <!-- Content -->
            <div style="padding: 36px; text-align: left; line-height: 1.6; color: #cbd5e1; font-size: 15px;">
                ${content}
            </div>
            
            <!-- Footer -->
            <div style="padding: 24px 36px; border-top: 1px solid #1f2937; background-color: #0d1322; text-align: center;">
                <p style="color: #64748b; font-size: 12px; margin: 0; line-height: 1.5;">
                    This is an automated message from KeyTrust Pay.<br>
                    Need help? Contact our support team at <a href="mailto:${ENV.ADMIN_EMAIL}" style="color: #38bdf8; text-decoration: none;">${ENV.ADMIN_EMAIL}</a><br>
                    &copy; 2026 KeyTrust Pay Inc. All rights reserved.
                </p>
            </div>
        </div>
    </div>
`;

export const sendWelcomeEmail = async (email: string, name: string) => {
    try {
        const title = 'Welcome to KeyTrust Pay';
        const html = getBaseTemplate(
            title,
            `<p style="margin-top: 0;">Hi <strong>${name}</strong>,</p>
             <p>Welcome to <strong>KeyTrust Pay</strong>! Your account has been successfully created and verified.</p>
             <p>You can now send and receive money internationally, manage multi-currency accounts, and monitor your transactions in real time with bank-grade security.</p>
             <div style="margin-top: 24px; padding: 18px; border-radius: 10px; background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.2);">
                <p style="margin: 0; font-size: 14px; color: #38bdf8;"><strong>Account Status: Active & Protected</strong><br>Your profile is fully verified and ready for transfers.</p>
             </div>
             <p style="margin-top: 24px;">Thank you for choosing KeyTrust Pay.</p>`,
            'Welcome'
        );

        const text = `Welcome to KeyTrust Pay, ${name}!\n\nYour account has been successfully verified and is now active.\nYou can now send and receive money securely.\n\nAccount Status: Active & Ready.`;

        const info = await transporter.sendMail({
            from: `"KeyTrust Pay" <${ENV.SMTP_USER}>`,
            to: email,
            subject: 'Welcome to KeyTrust Pay - Your Account is Ready',
            html,
            text,
        });
        console.log(`✅ Welcome email sent to ${email}. MessageID: ${info.messageId}`);
    } catch (error) {
        console.error(`❌ Error sending welcome email to ${email}:`, error);
    }
};

export const sendVerificationEmail = async (email: string, name: string, code: string) => {
    try {
        const title = 'Verify Your Email Address';
        const html = getBaseTemplate(
            title,
            `<p style="margin-top: 0;">Hi ${name},</p>
             <p>To finish setting up your KeyTrust Pay account and verify your identity, please enter the following verification code:</p>
             <div style="background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(59, 130, 246, 0.3); padding: 24px; text-align: center; margin: 28px 0; border-radius: 12px;">
                <p style="color: #94a3b8; font-size: 11px; letter-spacing: 0.2em; text-transform: uppercase; margin: 0 0 10px 0;">One-Time Verification Code</p>
                <p style="color: #38bdf8; font-size: 36px; font-weight: 700; letter-spacing: 0.25em; margin: 0; font-family: monospace;">${code}</p>
                <p style="color: #64748b; font-size: 12px; margin: 10px 0 0 0;">This code expires in 15 minutes</p>
             </div>
             <p style="font-size: 13px; color: #94a3b8;">If you did not request this verification code, please ignore this email or contact support immediately.</p>`,
            'Security'
        );

        const text = `Hello ${name},\n\nYour KeyTrust Pay verification code is: ${code}\n\nThis code expires in 15 minutes.`;

        const info = await transporter.sendMail({
            from: `"KeyTrust Pay Security" <${ENV.SMTP_USER}>`,
            to: email,
            subject: `${code} is your KeyTrust Pay verification code`,
            html,
            text,
        });
        console.log(`✅ Verification email sent to ${email}. MessageID: ${info.messageId}`);
    } catch (error) {
        console.error(`❌ Error sending verification email to ${email}:`, error);
    }
};

export const sendTransactionNotification = async (
    email: string,
    amount: number,
    type: 'debit' | 'credit',
    referenceId: string,
    status: string = 'SETTLED',
    protocol: string = 'Domestic'
) => {
    try {
        const subject = type === 'debit' ? `Transfer Initiated: $${amount.toLocaleString()}` : `Money Received: $${amount.toLocaleString()}`;
        const description = type === 'debit'
            ? `Your transfer of <strong>$${amount.toLocaleString()}</strong> has been initiated via ${protocol} network.`
            : `You have received an incoming transfer of <strong>$${amount.toLocaleString()}</strong> via ${protocol} network.`;

        const html = getBaseTemplate(
            'Transfer Update',
            `<p style="margin-top: 0;">${description}</p>
             <div style="margin: 24px 0; border-radius: 12px; background: rgba(15, 23, 42, 0.6); border: 1px solid rgba(255, 255, 255, 0.08); padding: 20px;">
                <table style="width: 100%; font-size: 14px; color: #cbd5e1;">
                    <tr>
                        <td style="color: #64748b; padding-bottom: 10px;">Reference ID</td>
                        <td style="text-align: right; padding-bottom: 10px; font-family: monospace; color: #38bdf8;">${referenceId}</td>
                    </tr>
                    <tr>
                        <td style="color: #64748b; padding-bottom: 10px;">Transfer Type</td>
                        <td style="text-align: right; padding-bottom: 10px;">${protocol}</td>
                    </tr>
                    <tr>
                        <td style="color: #64748b;">Status</td>
                        <td style="color: ${status.toLowerCase() === 'pending' ? '#fbbf24' : '#34d399'}; text-align: right; font-weight: 600; text-transform: uppercase;">${status}</td>
                    </tr>
                </table>
             </div>
             <p style="font-size: 13px; color: #94a3b8;">Log in to your KeyTrust Pay dashboard to download your receipt or view transfer details.</p>`,
            'Transactions'
        );

        const text = `KeyTrust Pay Alert: ${type === 'debit' ? 'Outbound' : 'Inbound'} transfer of $${amount.toLocaleString()} (${protocol}). Status: ${status}. Reference: ${referenceId}`;

        const info = await transporter.sendMail({
            from: `"KeyTrust Pay" <${ENV.SMTP_USER}>`,
            to: email,
            subject,
            html,
            text,
        });
        console.log(`✅ Transaction notification sent to ${email}. MessageID: ${info.messageId}`);
    } catch (error) {
        console.error(`❌ Error sending transaction notification to ${email}:`, error);
    }
};

export const sendTransferStatusUpdate = async (email: string, amount: number, status: string, referenceId: string, reason?: string) => {
    try {
        const isFailed = status === 'failed' || status === 'revoked';
        const title = isFailed ? 'Transfer Update: Review Required' : 'Transfer Approved & Settled';
        const statusColor = isFailed ? '#f87171' : '#34d399';

        const content = `
            <p style="margin-top: 0;">Your transfer of <strong>$${amount.toLocaleString()}</strong> has been updated.</p>
            <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255,255,255,0.08); border-radius: 12px; padding: 24px; margin: 24px 0;">
                <p style="margin: 0 0 6px 0; font-size: 11px; text-transform: uppercase; color: #64748b; letter-spacing: 0.1em;">Status</p>
                <p style="margin: 0; font-size: 22px; color: ${statusColor}; font-weight: 700;">${status.toUpperCase()}</p>
                ${reason ? `<p style="margin: 16px 0 0 0; font-size: 13px; color: #94a3b8;"><strong>Note:</strong> ${reason}</p>` : ''}
            </div>
            <p style="font-size: 12px; color: #64748b;">Reference ID: <span style="font-family: monospace; color: #e2e8f0;">${referenceId}</span></p>
        `;

        const html = getBaseTemplate(title, content, 'Account Activity');

        const text = `KeyTrust Pay: The transfer of $${amount.toLocaleString()} is now ${status.toUpperCase()}. Reference: ${referenceId}`;

        const info = await transporter.sendMail({
            from: `"KeyTrust Pay" <${ENV.SMTP_USER}>`,
            to: email,
            subject: `Transfer Update: ${status.toUpperCase()} - KeyTrust Pay`,
            html,
            text,
        });
        console.log(`✅ Status update email sent to ${email}. MessageID: ${info.messageId}`);
    } catch (error) {
        console.error(`❌ Error sending transfer status update to ${email}:`, error);
    }
};

export const sendPasswordResetEmail = async (email: string, token: string) => {
    try {
        const resetURL = `${ENV.FRONTEND_URL || 'http://localhost:3000'}/reset-password/${token}`;
        const title = 'Reset Your Password';
        const html = getBaseTemplate(
            title,
            `<p style="margin-top: 0;">We received a request to reset the password for your KeyTrust Pay account.</p>
             <p>Click the secure button below to choose a new password:</p>
             <div style="text-align: center; margin: 32px 0;">
                <a href="${resetURL}" style="background: linear-gradient(135deg, #2563eb, #38bdf8); color: #ffffff; padding: 14px 32px; text-decoration: none; font-weight: 600; font-size: 15px; border-radius: 8px; display: inline-block;">Reset Password</a>
             </div>
             <p style="font-size: 13px; color: #94a3b8;">This link will expire in 15 minutes. If you did not make this request, you can safely ignore this email.</p>`,
            'Account Security'
        );

        const text = `Hello,\n\nWe received a request to reset your KeyTrust Pay password. Click here to reset: ${resetURL}\n\nThis link expires in 15 minutes.`;

        const info = await transporter.sendMail({
            from: `"KeyTrust Pay Security" <${ENV.SMTP_USER}>`,
            to: email,
            subject: 'Reset your KeyTrust Pay password',
            html,
            text,
        });
        console.log(`✅ Password reset email sent to ${email}. MessageID: ${info.messageId}`);
    } catch (error) {
        console.error(`❌ Error sending reset password email to ${email}:`, error);
    }
};

export const sendAdminAlert = async (subject: string, content: string) => {
    try {
        const html = getBaseTemplate(
            'Operations Alert',
            content,
            'KeyTrust Admin Alert'
        );

        const text = `KeyTrust Pay Admin Alert: ${subject}\n\n${content}`;

        const info = await transporter.sendMail({
            from: `"KeyTrust Alerts" <${ENV.SMTP_USER}>`,
            to: ENV.ADMIN_EMAIL,
            subject: `[KeyTrust Admin] ${subject}`,
            html,
            text,
        });
        console.log(`✅ Admin alert sent to ${ENV.ADMIN_EMAIL}. MessageID: ${info.messageId}`);
    } catch (error) {
        console.error(`❌ Error sending admin alert to ${ENV.ADMIN_EMAIL}:`, error);
    }
};

export const sendSecurityAlert = async (email: string, action: string) => {
    try {
        const html = getBaseTemplate(
            'Security Notification',
            `<p style="margin-top: 0;">A change was recently made to your KeyTrust Pay account security settings.</p>
             <div style="background: rgba(239, 68, 68, 0.1); border-left: 4px solid #ef4444; padding: 20px; border-radius: 8px; margin: 24px 0;">
                <p style="margin: 0; color: #f87171; font-weight: 600; font-size: 14px;">Activity Detail</p>
                <p style="margin: 8px 0 0 0; font-size: 13px; color: #cbd5e1;">${action}</p>
             </div>
             <p style="font-size: 13px; color: #94a3b8;">If you did not authorize this change, please contact our support team immediately.</p>`,
            'Security Alert'
        );

        const text = `KeyTrust Pay Security Alert: A change was made to your account (${action}). If this wasn't you, please contact support.`;

        await transporter.sendMail({
            from: `"KeyTrust Pay Security" <${ENV.SMTP_USER}>`,
            to: email,
            subject: 'Security Alert: Account Activity - KeyTrust Pay',
            html,
            text,
        });
    } catch (error) {
        console.error('Error sending security alert email:', error);
    }
};
