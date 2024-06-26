import * as mongoose from "mongoose";

export default {
    async start() {
        await mongoose.connect(`${process.env.MONGO_URL}/${process.env.DB_NAME}?retryWrites=true&w=majority`)
        console.log(`${process.env.DB_NAME} db connected`);
    }
}