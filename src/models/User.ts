import mongoose from 'mongoose';

export interface IUser  {
    t_id: string,
    apiKey: string,
}

export const UserSchema = new mongoose.Schema<IUser>({
    t_id: {type: String, unique: true, index: true},
    apiKey: {type: String, unique: true, sparse: true},
});

export default mongoose.model<IUser>('User', UserSchema);

