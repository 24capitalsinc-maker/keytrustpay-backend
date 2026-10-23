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

export default router;
