import mongoose from 'mongoose';

export interface ITemplate {
    paymentDescription: string,
    paymentCategory: string,
}

export interface IUser {
    id: string
    t_id: number,
    apiKey?: string,
    categories: string[],
    balance: number,
    templates: ITemplate[],
}

const TemplateSchema = new mongoose.Schema<ITemplate>({
    paymentDescription: {type: String, required: true, unique: true},
    paymentCategory: {type: String, required: true},
})

export const UserSchema = new mongoose.Schema<IUser>({
    id: {type: String, unique: true, index: true},
    t_id: {type: Number, unique: true, index: true},
    apiKey: {type: String, unique: true, sparse: true},
    categories: {type: [String], required: true},
    balance: {type: Number, required: true},
    templates: {type: [TemplateSchema], required: true},
});

export default mongoose.model<IUser>('User', UserSchema);