import mongoose, {Document, Schema} from 'mongoose';
import {UserSchema} from "./User";

export interface IPayment {
    user: Schema.Types.ObjectId | string,
    amount: number,
    currency: string,
    account?: string,
    timestamp: number,
    description: string,
    rawData?: string,
    category: string,
}

export const PaymentSchema = new mongoose.Schema<IPayment>({
    user: {type: Schema.Types.ObjectId, ref: "User", required: true},
    amount: {type: Number, required: true},
    currency: {type: String, required: true},
    account: {type: String},
    timestamp: {type: Number, required: true},
    description: {type: String, required: true},
    rawData: {type: String},
    category: {type: String, required: true}
});

export default mongoose.model<IPayment>('Payment', PaymentSchema);

