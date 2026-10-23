import mongoose, { Schema, Document } from 'mongoose';

export interface IUser extends Document {
    name: string;
    email: string;
    password: string;
    phoneNumber: string;
    dateOfBirth: string;
    address: string;
    gender: string;
    occupation: string;
    accountNumber: string;
    accountBalance: number;
    accountType: string;
    currency: string;
    role: 'user' | 'admin';
    isFrozen: boolean;
    twoFactorEnabled: boolean;
    isEmailVerified: boolean;
    verificationCode?: string;
    verificationCodeExpires?: Date;
    notifications: {
        email: boolean;
        sms: boolean;
        push: boolean;
    };
    preferences: {
        language: string;
        timezone: string;
        defaultCurrency: string;
    };
    limits: {
        dailyTransfer: number;
        monthlyTransfer: number;
    };
    resetPasswordToken?: string;
    resetPasswordExpires?: Date;
    refreshToken?: string;
    freezeReason?: string;
    profileImage?: string;
    isClosureRequested: boolean;
    closureReason: string;
    lastLoginAt?: Date;
    createdAt: Date;
}

const UserSchema: Schema = new Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    phoneNumber: { type: String, default: '' },
    dateOfBirth: { type: String, default: '' },
    address: { type: String, default: '' },
    gender: { type: String, default: '' },
    occupation: { type: String, default: '' },
    accountNumber: { type: String, required: true, unique: true },
    accountBalance: { type: Number, default: 0 },
    accountType: { type: String, default: 'Savings' },
    currency: { type: String, default: 'USD' },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    isFrozen: { type: Boolean, default: false },
    twoFactorEnabled: { type: Boolean, default: false },
    isEmailVerified: { type: Boolean, default: false },
    verificationCode: { type: String },
    verificationCodeExpires: { type: Date },
    notifications: {
        email: { type: Boolean, default: true },
        sms: { type: Boolean, default: false },
        push: { type: Boolean, default: true },
    },
    preferences: {
        language: { type: String, default: 'English' },
        timezone: { type: String, default: 'UTC' },
        defaultCurrency: { type: String, default: 'USD' },
    },
    limits: {
        dailyTransfer: { type: Number, default: 50000 },
        monthlyTransfer: { type: Number, default: 500000 },
    },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
    refreshToken: { type: String },
    freezeReason: { type: String, default: '' },
    profileImage: { type: String, default: '' },
    isClosureRequested: { type: Boolean, default: false },
    closureReason: { type: String, default: '' },
    lastLoginAt: { type: Date },
    createdAt: { type: Date, default: Date.now },
});

if (mongoose.models.User) {
    delete mongoose.models.User;
}
export default mongoose.model<IUser>('User', UserSchema);
