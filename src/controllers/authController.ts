import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import User from '../models/User';
import { ENV } from '../config/env';
import { generateAccountNumber } from '../utils/generateAccountNumber';
import {
    sendVerificationEmail,
    sendWelcomeEmail,
    sendAdminAlert,
    sendPasswordResetEmail,
    sendLoginAlertEmail,
    sendSecurityAlert,
} from '../services/emailService';
import SystemSettings from '../models/SystemSettings';

const generateTokens = (id: string) => {
    const accessToken = jwt.sign({ id }, ENV.JWT_SECRET as string, { expiresIn: ENV.JWT_EXPIRES_IN as any });
    const refreshToken = jwt.sign({ id }, ENV.REFRESH_TOKEN_SECRET as string, { expiresIn: ENV.REFRESH_TOKEN_EXPIRES_IN as any });
    return { accessToken, refreshToken };
};

export const register = async (req: Request, res: Response) => {
    const { name, email, password, phoneNumber, dateOfBirth, address, gender, occupation } = req.body;

    try {
        const settings = await SystemSettings.findOne({});
        if (settings && !settings.isRegistrationEnabled) {
            return res.status(403).json({ message: 'Institutional recruitment is currently suspended.' });
        }

        const userExists = await User.findOne({ email });
        if (userExists) return res.status(400).json({ message: 'User already exists' });

        const hashedPassword = await bcrypt.hash(password, 10);

        // Ensure unique account number
        let accountNumber = '';
        let isUnique = false;
        let attempts = 0;

        while (!isUnique && attempts < 5) {
            accountNumber = generateAccountNumber();
            const existingAccount = await User.findOne({ accountNumber });
            if (!existingAccount) {
                isUnique = true;
            }
            attempts++;
        }

        if (!isUnique) {
            throw new Error('Failed to generate a unique account number. Please try again.');
        }

        // Generate a 6-digit verification code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const verificationCodeExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

        const user = await User.create({
            name,
            email,
            password: hashedPassword,
            phoneNumber,
            dateOfBirth,
            address,
            gender,
            occupation,
            accountNumber,
            isEmailVerified: false,
            verificationCode,
            verificationCodeExpires,
        });

        // Send the verification code email (registration mode)
        await sendVerificationEmail(user.email, user.name, verificationCode, 'registration');
        await sendAdminAlert(
            'New Account Registered',
            `<p style="margin-top: 0;">A new user account has been registered and is awaiting verification.</p>
             <div style="margin: 20px 0; padding: 20px; border: 1px solid rgba(255,255,255,0.08); background: #161e2e; border-radius: 8px;">
                <p style="margin: 0; font-size: 13px;"><strong>Identity:</strong> ${user.name}</p>
                <p style="margin: 5px 0 0 0; font-size: 13px;"><strong>Email:</strong> ${user.email}</p>
                <p style="margin: 5px 0 0 0; font-size: 13px;"><strong>Account:</strong> ${user.accountNumber}</p>
                <p style="margin: 5px 0 0 0; font-size: 13px;"><strong>Status:</strong> Awaiting Verification</p>
             </div>`
        );

        // Return userId only — tokens are issued after email verification
        res.status(201).json({
            userId: (user._id as any).toString(),
            message: 'Registration successful. Please check your email for the verification code.',
        });
    } catch (error: any) {
        res.status(500).json({ message: 'Server error: ' + error.message });
    }
};

export const verifyEmail = async (req: Request, res: Response) => {
    const { userId, code } = req.body;
    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        if (!user.verificationCode || !user.verificationCodeExpires) {
            return res.status(400).json({ message: 'No verification code found. Please sign in or request a new code.' });
        }
        if (new Date() > user.verificationCodeExpires) {
            return res.status(400).json({ message: 'Verification code has expired. Please request a new code.' });
        }
        if (user.verificationCode !== code.trim()) {
            return res.status(400).json({ message: 'Invalid verification code. Please check and try again.' });
        }

        const wasUnverified = !user.isEmailVerified;

        // Mark as verified, clear verification code, and stamp lastLoginAt
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                $set: { isEmailVerified: true, lastLoginAt: new Date() },
                $unset: { verificationCode: 1, verificationCodeExpires: 1 }
            },
            { new: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ message: 'User record lost during verification.' });
        }

        // Now issue the full auth tokens
        const { accessToken, refreshToken } = generateTokens((updatedUser._id as any).toString());

        // Save refresh token to DB (hashed)
        const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
        await User.findByIdAndUpdate(updatedUser._id, { refreshToken: hashedRefreshToken });

        res.json({
            _id: updatedUser._id,
            name: updatedUser.name,
            email: updatedUser.email,
            accountNumber: updatedUser.accountNumber,
            role: updatedUser.role,
            accessToken,
            refreshToken,
        });

        // If this was initial registration verification, send Welcome email
        if (wasUnverified) {
            await sendWelcomeEmail(updatedUser.email, updatedUser.name, updatedUser.accountNumber);
        } else {
            // Otherwise it was a 6-hour login security verification; dispatch login alert email
            await sendLoginAlertEmail(updatedUser.email, updatedUser.name, {
                ip: req.ip || (req.headers['x-forwarded-for'] as string),
                userAgent: req.headers['user-agent'],
                time: new Date(),
            });
        }

        await sendAdminAlert(
            'Account Session Authorized',
            `<p>User <strong>${updatedUser.name}</strong> (${updatedUser.email}) successfully authorized their session via 2FA PIN.</p>
             <p><strong>Account:</strong> ${updatedUser.accountNumber}</p>
             <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>`
        );
    } catch (error: any) {
        res.status(500).json({ message: 'Server error: ' + error.message });
    }
};

export const login = async (req: Request, res: Response) => {
    const { email, password } = req.body;

    try {
        const user = await User.findOne({ email });
        const settings = await SystemSettings.findOne({});

        if (user && (await bcrypt.compare(password, user.password))) {
            if (!user.isEmailVerified) {
                return res.status(403).json({
                    message: 'Verification pending. Please verify your email to access your institutional portfolio.',
                    userId: user._id,
                    isUnverified: true
                });
            }

            if (settings?.isMaintenanceMode && user.role !== 'admin') {
                return res.status(503).json({
                    message: settings.maintenanceMessage || 'System upgrade in progress. Sovereign services will resume shortly.'
                });
            }

            // 6-HOUR LOGIN SECURITY CHECK
            // If user has never logged in before, or if it has been >= 6 hours since their last login,
            // require email verification code before issuing session tokens.
            const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
            const lastLoginTime = user.lastLoginAt ? new Date(user.lastLoginAt).getTime() : 0;
            const timeSinceLastLogin = Date.now() - lastLoginTime;
            const requiresLoginVerification = !user.lastLoginAt || timeSinceLastLogin >= SIX_HOURS_MS;

            if (requiresLoginVerification) {
                // Generate a fresh 6-digit PIN
                const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
                const verificationCodeExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

                await User.findByIdAndUpdate(user._id, {
                    verificationCode,
                    verificationCodeExpires,
                });

                // Dispatch login 2FA verification email
                await sendVerificationEmail(user.email, user.name, verificationCode, 'login');
                await sendAdminAlert(
                    'Login 2FA Verification Initiated',
                    `<p>User <strong>${user.name}</strong> (${user.email}) initiated login after 6+ hours since previous session.</p>
                     <p>A one-time verification code has been dispatched to their email.</p>`
                );

                return res.status(200).json({
                    requiresVerification: true,
                    isLoginVerification: true,
                    userId: user._id,
                    message: 'Security Verification: A 6-digit authorization code has been dispatched to your email address.',
                });
            }

            // Standard direct login for sessions within 6 hours
            const { accessToken, refreshToken } = generateTokens((user._id as any).toString());

            // Save refresh token to DB (hashed) & update lastLoginAt
            const hashedRefreshToken = await bcrypt.hash(refreshToken, 10);
            await User.findByIdAndUpdate(user._id, {
                refreshToken: hashedRefreshToken,
                lastLoginAt: new Date(),
            });

            res.json({
                _id: user._id,
                name: user.name,
                email: user.email,
                accountNumber: user.accountNumber,
                role: user.role,
                accessToken,
                refreshToken,
            });

            // Dispatch login alert notification to user
            await sendLoginAlertEmail(user.email, user.name, {
                ip: req.ip || (req.headers['x-forwarded-for'] as string),
                userAgent: req.headers['user-agent'],
                time: new Date(),
            });

            // Notify admin of successful login
            await sendAdminAlert(
                'Account Login',
                `<p style="margin-top: 0;">A verified user has logged in to KeyTrust Pay.</p>
                 <div style="margin: 20px 0; padding: 20px; border: 1px solid rgba(255,255,255,0.08); background: #161e2e; border-radius: 8px;">
                    <p style="margin: 0; font-size: 13px;"><strong>Identity:</strong> ${user.name}</p>
                    <p style="margin: 5px 0 0 0; font-size: 13px;"><strong>Email:</strong> ${user.email}</p>
                    <p style="margin: 5px 0 0 0; font-size: 13px;"><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
                 </div>`
            );
        } else {
            res.status(401).json({ message: 'Invalid email or password' });
        }
    } catch (error: any) {
        res.status(500).json({ message: 'Server error: ' + error.message });
    }
};

export const refreshToken = async (req: Request, res: Response) => {
    const { refreshToken } = req.body;

    if (!refreshToken) {
        return res.status(401).json({ message: 'Refresh token required' });
    }

    try {
        const decoded: any = jwt.verify(refreshToken, ENV.REFRESH_TOKEN_SECRET as string);
        const user = await User.findById(decoded.id);

        if (!user || !user.refreshToken) {
            return res.status(401).json({ message: 'Invalid session' });
        }

        const isMatch = await bcrypt.compare(refreshToken, user.refreshToken);
        if (!isMatch) {
            return res.status(401).json({ message: 'Session mismatch' });
        }

        const tokens = generateTokens(user._id.toString());

        // Hash and update the new refresh token in DB
        const hashedRefreshToken = await bcrypt.hash(tokens.refreshToken, 10);
        await User.findByIdAndUpdate(user._id, { refreshToken: hashedRefreshToken });

        res.json(tokens);
    } catch (error: any) {
        res.status(401).json({ message: 'Session expired' });
    }
};

export const logout = async (req: Request, res: Response) => {
    const { userId } = req.body;
    try {
        await User.findByIdAndUpdate(userId, { $unset: { refreshToken: 1 } });
        res.json({ message: 'Logged out successfully' });
    } catch (error: any) {
        res.status(500).json({ message: 'Logout failed' });
    }
};

export const forgotPassword = async (req: Request, res: Response) => {
    const { email } = req.body;
    try {
        const user = await User.findOne({ email });
        if (!user) {
            // Return success even if user not found for security (mitigate email enumeration)
            return res.json({ message: 'If an account exists, a reset link has been sent.' });
        }

        const resetToken = crypto.randomBytes(32).toString('hex');
        user.resetPasswordToken = crypto.createHash('sha256').update(resetToken).digest('hex');
        user.resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

        await user.save();

        // Pass the raw token to the email service
        await sendPasswordResetEmail(user.email, resetToken);

        res.json({ message: 'If an account exists, a reset link has been sent.' });
    } catch (error: any) {
        res.status(500).json({ message: 'Server error' });
    }
};

export const resetPassword = async (req: Request, res: Response) => {
    const { token } = req.params;
    const { password } = req.body;

    try {
        const tokenString = Array.isArray(token) ? token[0] : token;
        const hashedToken = crypto.createHash('sha256').update(tokenString).digest('hex');
        const user = await User.findOne({
            resetPasswordToken: hashedToken,
            resetPasswordExpires: { $gt: Date.now() },
        });

        if (!user) {
            return res.status(400).json({ message: 'Invalid or expired recovery token.' });
        }

        user.password = await bcrypt.hash(password, 10);
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;

        await user.save();

        await sendSecurityAlert(user.email, 'Your KeyTrust Pay password was successfully updated.');

        res.json({ message: 'Success! Your institutional credentials have been updated.' });
    } catch (error: any) {
        res.status(500).json({ message: 'Server error' });
    }
};

export const resendVerificationCode = async (req: Request, res: Response) => {
    const { userId } = req.body;
    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Generate a new 6-digit verification code
        const verificationCode = Math.floor(100000 + Math.random() * 900000).toString();
        const verificationCodeExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

        // Update user with new code using an atomic update
        await User.findByIdAndUpdate(userId, {
            $set: {
                verificationCode: verificationCode,
                verificationCodeExpires: verificationCodeExpires
            }
        });

        // Send the new verification code email
        await sendVerificationEmail(
            user.email,
            user.name,
            verificationCode,
            user.isEmailVerified ? 'login' : 'registration'
        );

        res.json({ message: 'A new verification code has been dispatched to your email.' });
    } catch (error: any) {
        res.status(500).json({ message: 'Server error: ' + error.message });
    }
};
