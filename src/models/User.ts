import mongoose from 'mongoose';

export interface IUser  {
    t_id: number,
    apiKey?: string,
    categories: string[],
    balance: number,
}

export const UserSchema = new mongoose.Schema<IUser>({
    t_id: {type: Number, unique: true, index: true},
    apiKey: {type: String, unique: true, sparse: true},
    categories: {type: [String], required: true},
    balance: {type: Number, required: true}
});

export default mongoose.model<IUser>('User', UserSchema);

