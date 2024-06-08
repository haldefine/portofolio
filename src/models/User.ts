import mongoose from 'mongoose';
import {nanoid} from "nanoid";

export interface IUser  {
    id: string
    t_id: number,
    apiKey?: string,
    categories: string[],
    balance: number,
}

export const UserSchema = new mongoose.Schema<IUser>({
    id: {type: String, unique: true, index: true},
    t_id: {type: Number, unique: true, index: true},
    apiKey: {type: String, unique: true, sparse: true},
    categories: {type: [String], required: true},
    balance: {type: Number, required: true}
});

export default mongoose.model<IUser>('User', UserSchema);

