import { Request, Response } from 'express';
import User from '../models/User';
import Transaction from '../models/Transaction';
import SystemSettings from '../models/SystemSettings';
import {
    sendAdminAlert,
    sendTransferStatusUpdate,
    sendTransactionNotification,
    sendBalanceAdjustmentNotification,
    sendSecurityAlert,
} from '../services/emailService';

export const getAllUsers = async (req: Request, res: Response) => {
    try {
        const users = await User.find({}).select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

export const getAllTransactions = async (req: Request, res: Response) => {
    try {
        const transactions = await Transaction.find({}).populate('sender receiver', 'name email accountNumber').sort({ createdAt: -1 });
        res.json(transactions);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

export const updateAccountStatus = async (req: Request, res: Response) => {
    const { userId, isFrozen, reason } = req.body;
    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        user.isFrozen = isFrozen;
        if (isFrozen) {
            user.freezeReason = reason || 'Institutional compliance review';
        } else {
            user.freezeReason = '';
        }
        await user.save();

        // Notify user via security alert
        if (isFrozen) {
            await sendSecurityAlert(
                user.email,
                'Account Temporarily Restricted',
                `Your account has been placed on administrative hold. Reason: ${user.freezeReason}. Outbound transfers are paused. Please reach out to customer support.`
            );
        } else {
            await sendSecurityAlert(
                user.email,
                'Account Restrictions Lifted',
                'Your KeyTrust Pay account has been restored. All transactional privileges are now active.'
            );
        }

        // Notify admin
        await sendAdminAlert(
            `Account Status Changed: ${user.name} (${isFrozen ? 'Frozen' : 'Active'})`,
            `<p>User <strong>${user.name}</strong> (${user.email}) status has been updated to <strong>${isFrozen ? 'FROZEN' : 'ACTIVE'}</strong>.</p>
             ${isFrozen ? `<p><strong>Reason:</strong> ${user.freezeReason}</p>` : ''}
             <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>`
        );

        res.json({ message: `User account ${isFrozen ? 'frozen' : 'unfrozen'} successfully` });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

export const updateUserLimits = async (req: Request, res: Response) => {
    const { userId, dailyTransfer, monthlyTransfer } = req.body;
    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (dailyTransfer !== undefined) user.limits.dailyTransfer = dailyTransfer;
        if (monthlyTransfer !== undefined) user.limits.monthlyTransfer = monthlyTransfer;

        await user.save();

        await sendSecurityAlert(
            user.email,
            'Transfer Limits Updated',
            `Your daily transfer limit is now $${user.limits.dailyTransfer.toLocaleString()} and monthly limit is $${user.limits.monthlyTransfer.toLocaleString()}.`
        );

        res.json({ message: 'User limits updated successfully', limits: user.limits });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

export const updateUserBalance = async (req: Request, res: Response) => {
    const { userId, accountBalance } = req.body;
    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        const oldBalance = user.accountBalance;
        user.accountBalance = accountBalance;
        await user.save();

        // Notify user about balance adjustment
        await sendBalanceAdjustmentNotification(
            user.email,
            user.name,
            oldBalance,
            user.accountBalance,
            user.currency || 'USD'
        );

        // Notify admin
        await sendAdminAlert(
            'Balance Adjustment Processed',
            `<p>An account balance has been manually adjusted for user <strong>${user.name}</strong> (${user.email}).</p>
             <p><strong>Previous Balance:</strong> $${oldBalance.toLocaleString()}</p>
             <p><strong>New Balance:</strong> $${user.accountBalance.toLocaleString()}</p>
             <p><strong>Action By:</strong> Administrator</p>
             <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>`
        );

        res.json({
            message: 'Institutional liquidity adjusted successfully',
            accountBalance: user.accountBalance
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error during liquidity adjustment' });
    }
};

export const getAdminMetrics = async (req: Request, res: Response) => {
    try {
        const totalUsers = await User.countDocuments({ role: 'user' });
        const totalTransactions = await Transaction.countDocuments({});
        const users = await User.find({ role: 'user' });
        const totalBankBalance = users.reduce((acc, user) => acc + user.accountBalance, 0);

        res.json({
            totalUsers,
            totalTransactions,
            totalBankBalance,
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

export const getSystemSettings = async (req: Request, res: Response) => {
    try {
        let settings = await SystemSettings.findOne({});
        if (!settings) {
            settings = await SystemSettings.create({});
        }
        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

export const updateSystemSettings = async (req: Request, res: Response) => {
    try {
        let settings = await SystemSettings.findOne({});
        if (!settings) {
            settings = await SystemSettings.create(req.body);
        } else {
            Object.assign(settings, req.body);
            settings.updatedAt = new Date();
            await settings.save();
        }

        await sendAdminAlert(
            'Global Settings Updated',
            `<p>The system settings have been updated.</p>
             <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>`
        );

        res.json(settings);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

export const updateTransaction = async (req: Request, res: Response) => {
    const { id } = req.params;
    try {
        const transaction = await Transaction.findById(id).populate('sender');
        if (!transaction) return res.status(404).json({ message: 'Transaction not found' });

        const oldStatus = transaction.status;
        const newStatus = req.body.status;

        // Settlement Logic: When status moves from pending -> success
        if (newStatus === 'success' && oldStatus === 'pending') {
            const sender = await User.findById(transaction.sender);

            // Handle internal (Domestic) settlement
            if (transaction.routingProtocol === 'Domestic') {
                const receiver = await User.findOne({ accountNumber: transaction.receiverAccountNumber });

                if (receiver) {
                    receiver.accountBalance += transaction.amount;
                    await receiver.save();

                    // Create the credit record for receiver's ledger
                    await Transaction.create({
                        amount: transaction.amount,
                        currency: transaction.currency,
                        routingProtocol: transaction.routingProtocol,
                        status: 'success',
                        referenceId: transaction.referenceId + '-C',
                        receiverAccountNumber: transaction.receiverAccountNumber,
                        receiverName: transaction.receiverName,
                        sender: transaction.sender,
                        receiver: receiver._id,
                        type: 'credit',
                        description: `Transfer from ${sender?.name || 'Authorized Entity'}`,
                        detailLabel: `Domestic // INBOUND`,
                        valueLabel: `${transaction.currency} // SETTLED`
                    });

                    // Notify receiver of incoming credited funds
                    await sendTransactionNotification(
                        receiver.email,
                        transaction.amount,
                        'credit',
                        transaction.referenceId,
                        'success',
                        transaction.routingProtocol,
                        {
                            receiverName: sender?.name || 'Authorized Entity',
                            balance: receiver.accountBalance,
                            currency: transaction.currency,
                        }
                    );
                }
            }

            transaction.valueLabel = `${transaction.currency} // SETTLED`;
        }

        // Refund Logic: If status moves from pending -> failed, restore funds to sender
        if (newStatus === 'failed' && oldStatus === 'pending') {
            const sender = await User.findById(transaction.sender);
            if (sender) {
                sender.accountBalance += transaction.amount;
                await sender.save();
            }
            transaction.valueLabel = `${transaction.currency} // CANCELLED`;
        }

        Object.assign(transaction, req.body);
        const updatedTransaction = await transaction.save();

        // Notify sender if status changed
        if (newStatus && newStatus !== oldStatus) {
            const sender = transaction.sender as any;
            if (sender && sender.email) {
                await sendTransferStatusUpdate(
                    sender.email,
                    transaction.amount,
                    transaction.status,
                    transaction.referenceId,
                    req.body.description || transaction.description,
                    transaction.currency
                );
            }
        }

        res.json(updatedTransaction);
    } catch (error: any) {
        res.status(500).json({
            message: 'Server error during transaction update'
        });
    }
};

export const getLiquidityStats = async (req: Request, res: Response) => {
    try {
        const users = await User.find({ role: 'user' });
        const totalLiquidity = users.reduce((acc, user) => acc + user.accountBalance, 0);

        const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const recentTransactions = await Transaction.find({ createdAt: { $gte: last24h } });
        const volume24h = recentTransactions.reduce((acc, tx) => acc + tx.amount, 0);

        const distribution = [
            { label: 'Institutional Reserves', value: totalLiquidity * 0.4 },
            { label: 'Active Float', value: totalLiquidity * 0.35 },
            { label: 'Settlement Vaults', value: totalLiquidity * 0.25 },
        ];

        const hourlyFlow = Array.from({ length: 12 }, (_, i) => ({
            hour: `${12 - i}h ago`,
            inflow: Math.floor(Math.random() * 50000),
            outflow: Math.floor(Math.random() * 45000),
        })).reverse();

        const reserveRatio = Math.min(35, Math.max(18, 22.4 + (totalLiquidity / 5000000)));

        res.json({
            totalLiquidity,
            volume24h,
            reserveRatio: parseFloat(reserveRatio.toFixed(1)),
            distribution,
            hourlyFlow,
            entityCount: users.length
        });
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

export const uploadLogo = async (req: Request, res: Response): Promise<any> => {
    try {
        if (!req.file) {
            return res.status(400).json({ message: 'No file uploaded' });
        }

        const logoUrl = `${req.protocol}://${req.get('host')}/uploads/${req.file.filename}`;

        let settings = await SystemSettings.findOne({});
        if (!settings) {
            settings = await SystemSettings.create({ logoUrl });
        } else {
            settings.logoUrl = logoUrl;
            settings.updatedAt = new Date();
            await settings.save();
        }

        await sendAdminAlert(
            'Brand Asset Update',
            `<p>A new brand logo has been uploaded to the platform settings.</p>
             <p><strong>Logo URL:</strong> ${settings.logoUrl}</p>`
        );

        res.json({
            message: 'Institutional logo uploaded successfully',
            logoUrl: settings.logoUrl
        });
    } catch (error) {
        res.status(500).json({ message: 'Failed to persist institutional asset' });
    }
};

export const getClosureRequests = async (req: Request, res: Response) => {
    try {
        const users = await User.find({ isClosureRequested: true }).select('-password');
        res.json(users);
    } catch (error) {
        res.status(500).json({ message: 'Server error' });
    }
};

export const approveAccountClosure = async (req: Request, res: Response) => {
    const { userId } = req.body;
    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });

        if (!user.isClosureRequested) {
            return res.status(400).json({ message: 'No closure request for this user' });
        }

        const userEmail = user.email;
        const userName = user.name;

        await User.findByIdAndDelete(userId);

        await sendAdminAlert(
            'Account Closure Finalized',
            `<p>The account for <strong>${userName}</strong> (${userEmail}) has been formally closed and purged from the active ledger.</p>
             <p><strong>Approved by:</strong> Administrator</p>
             <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>`
        );

        res.json({ message: 'Account closed and data purged successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Server error during account closure' });
    }
};
