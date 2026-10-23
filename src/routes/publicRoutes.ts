import express from 'express';
import { getSystemSettings } from '../controllers/adminController';
import { submitContactForm } from '../controllers/contactController';

const router = express.Router();

router.post('/contact', submitContactForm);

// Publicly accessible settings (Logo, Company Name, etc.)
router.get('/settings', async (req, res) => {
    try {
        const settings = await require('../models/SystemSettings').default.findOne({});
        if (!settings) return res.json({
            companyName: 'KeyTrust Pay',
            logoText: 'KeyTrust',
            logoAccent: 'Pay',
            logoUrl: '/logo.png',
            isRegistrationEnabled: true
        });

        // Only return non-sensitive fields
        res.json({
            companyName: settings.companyName,
            logoText: settings.logoText,
            logoAccent: settings.logoAccent,
            logoUrl: settings.logoUrl,
            socialLinks: settings.socialLinks,
            supportEmail: settings.supportEmail,
            isRegistrationEnabled: settings.isRegistrationEnabled
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
});

// Diagnostic: Check email service configuration status
router.get('/email-status', async (req, res) => {
    try {
        const { checkEmailStatus } = await import('../services/emailService');
        const status = await checkEmailStatus();
        res.json(status);
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Diagnostic: Trigger a test email dispatch
router.post('/test-email', async (req, res) => {
    try {
        const { to } = req.body;
        if (!to || typeof to !== 'string' || !to.includes('@')) {
            return res.status(400).json({
                error: 'A valid destination email address ("to") is required in the JSON body.',
            });
        }
        const { sendTestEmail } = await import('../services/emailService');
        const result = await sendTestEmail(to.trim());
        if (result.success) {
            return res.json({
                success: true,
                message: `Test email successfully dispatched to ${to}`,
                result,
            });
        } else {
            return res.status(502).json({
                success: false,
                message: 'Email dispatch failed. Review the error details below.',
                result,
            });
        }
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
