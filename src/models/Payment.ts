import mongoose, {Document, Schema} from 'mongoose';
import {UserSchema} from "./User";

export interface IPayment {
    user: Schema.Types.ObjectId | string,
    amount: number,
    operationAmount: number,
    currency: string,
    account: string,
    timestamp: number,
    description: string,
    rawData: string,
}

export const PaymentSchema = new mongoose.Schema<IPayment>({
    user: {type: Schema.Types.ObjectId, ref: "User", required: true},
    amount: {type: Number, required: true},
    operationAmount: {type: Number, required: true},
    currency: {type: String, required: true},
    account: {type: String, required: true},
    timestamp: {type: Number, required: true},
    description: {type: String, required: true},
    rawData: {type: String, required: true},
});

export default mongoose.model<IPayment>('Payment', PaymentSchema);

