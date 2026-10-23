import mongoose from 'mongoose';
import User from '../models/User';
import Transaction from '../models/Transaction';
import { generateTransactionRef } from '../utils/generateTransactionRef';
import { sendTransactionNotification, sendAdminAlert } from './emailService';

export const transferFunds = async (
    senderId: string,
    receiverAccountNumber: string,
    receiverName: string,
    amount: number,
    description: string,
    metadata: {
        currency?: string;
        routingProtocol?: 'Domestic' | 'International' | 'Offshore';
        swiftCode?: string;
        iban?: string;
        jurisdiction?: string;
    } = {}
) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
        const sender = await User.findById(senderId).session(session);
        if (!sender) throw new Error('Account not found.');
        if (sender.isFrozen) {
            const reason = sender.freezeReason ? `: ${sender.freezeReason}` : '';
            throw new Error(`Your account has been temporarily put on hold${reason}. Transfers are paused during this review. Please reach out to customer support.`);
        }
        if (sender.accountBalance < amount) throw new Error('Insufficient funds to complete this transfer.');

        const protocol = metadata.routingProtocol || 'Domestic';
        let receiver = null;

        // Validating Account number format (numeric up to 10 digits)
        if (!/^\d{1,10}$/.test(receiverAccountNumber)) {
            throw new Error('Please enter a valid numeric account number (up to 10 digits).');
        }

        if (protocol === 'Domestic') {
            receiver = await User.findOne({ accountNumber: receiverAccountNumber }).session(session);
            if (receiverAccountNumber === sender.accountNumber) {
                throw new Error('Transfers to your own account number are not permitted.');
            }
        }

        // Limit Enforcement
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const dailyTransactions = await Transaction.find({
            sender: sender._id,
            type: 'debit',
            status: 'success',
            createdAt: { $gte: startOfDay }
        }).session(session);

        const dailyTotal = dailyTransactions.reduce((acc, tx) => acc + tx.amount, 0);

        if (dailyTotal + amount > sender.limits.dailyTransfer) {
            throw new Error(`You have reached your daily transfer limit of $${sender.limits.dailyTransfer.toLocaleString()}. Current daily sent: $${dailyTotal.toLocaleString()}.`);
        }

        const referenceId = generateTransactionRef();

        // Deduct from sender balance immediately
        sender.accountBalance -= amount;
        await sender.save({ session });

        const status = 'pending';
        const currency = metadata.currency || 'USD';
        const displayJurisdiction = metadata.jurisdiction;

        const commonData = {
            amount,
            currency,
            routingProtocol: protocol,
            swiftCode: metadata.swiftCode,
            iban: metadata.iban,
            jurisdiction: displayJurisdiction,
            status,
            referenceId,
            receiverAccountNumber,
            receiverName,
            valueLabel: `${currency} // PENDING`
        };

        // Create debit transaction record
        const debitTransaction = await Transaction.create([{
            ...commonData,
            sender: sender._id,
            receiver: receiver?._id,
            type: 'debit',
            description: description || (protocol === 'Domestic'
                ? `Transfer to ${receiverName}`
                : `${protocol} Transfer to ${receiverName}`),
            detailLabel: `${protocol} // OUTBOUND`
        }], { session });

        // Alert administrators for review
        sendAdminAlert(
            `[KeyTrust Transfer] ${sender.name} sent ${commonData.currency} ${amount.toLocaleString()}`,
            `<p style="margin-top: 0;">A new transfer has been submitted and is awaiting standard verification.</p>
             <div style="margin: 20px 0; padding: 20px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1); background: #161e2e;">
                <p style="margin: 0; font-size: 14px;"><strong>Amount:</strong> ${commonData.currency} ${amount.toLocaleString()}</p>
                <p style="margin: 6px 0 0 0; font-size: 13px;"><strong>Sender:</strong> ${sender.name}</p>
                <p style="margin: 6px 0 0 0; font-size: 13px;"><strong>Recipient:</strong> ${receiverName} (${receiverAccountNumber})</p>
                <p style="margin: 6px 0 0 0; font-size: 13px;"><strong>Network:</strong> ${protocol}</p>
                <p style="margin: 6px 0 0 0; font-size: 13px;"><strong>Status:</strong> ${status}</p>
                <p style="margin: 6px 0 0 0; font-size: 13px; font-family: monospace;"><strong>Ref:</strong> ${referenceId}</p>
             </div>`
        );

        await session.commitTransaction();
        session.endSession();

        // Send transaction notification to sender
        sendTransactionNotification(sender.email, amount, 'debit', referenceId, status, protocol);

        return debitTransaction[0];
    } catch (error) {
        await session.abortTransaction();
        session.endSession();
        throw error;
    }
};
