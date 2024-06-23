import mongoose from 'mongoose';
import {nanoid} from "nanoid";

export interface IPayment {
    id: string,
    user: string,
    amount: number,
    dollarsAmount: number,
    currency: string,
    account?: string,
    timestamp: number,
    description: string,
    rawData?: string,
    category: string,
}

export const PaymentSchema = new mongoose.Schema<IPayment>({
    id: {type: String, required: true, unique: true, index: true, default: nanoid},
    user: {type: String, required: true},
    amount: {type: Number, required: true},
    dollarsAmount: {type: Number, required: true},
    currency: {type: String, required: true},
    account: {type: String},
    timestamp: {type: Number, required: true},
    description: {type: String, required: true},
    rawData: {type: String},
    category: {type: String, required: true}
});

export default mongoose.model<IPayment>('Payment', PaymentSchema);