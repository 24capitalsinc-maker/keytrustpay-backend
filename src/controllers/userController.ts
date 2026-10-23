import { Request, Response } from 'express';
import User from '../models/User';
import { sendSecurityAlert } from '../services/emailService';

export const getUserProfile = async (req: any, res: Response) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

export const updateProfile = async (req: any, res: Response) => {
    const {
        name, phoneNumber, address, occupation,
        twoFactorEnabled, notifications, preferences, limits,
        profileImage
    } = req.body;

    try {
        const updatedUser = await User.findByIdAndUpdate(
            req.user._id,
            {
                $set: {
                    name,
                    phoneNumber,
                    address,
                    occupation,
                    twoFactorEnabled,
                    notifications,
                    preferences,
                    limits,
                    profileImage
                }
            },
            { new: true, runValidators: true }
        ).select('-password');

        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Send security alert for sensitive changes
        if (twoFactorEnabled !== undefined || notifications || limits) {
            await sendSecurityAlert(updatedUser.email, 'Security preferences or limits updated');
        }

        res.json(updatedUser);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

export const requestAccountClosure = async (req: any, res: Response) => {
    try {
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (user.isClosureRequested) {
            return res.status(400).json({ message: 'Account closure request already pending' });
        }

        user.isClosureRequested = true;
        user.closureReason = req.body.reason || 'User initiated closure';
        await user.save();

        // Notify user via security alert
        await sendSecurityAlert(user.email, 'Account Closure Requested. Your request is currently under administrative review.');

        res.json({ message: 'Account closure request submitted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Failed to submit closure request' });
    }
};
