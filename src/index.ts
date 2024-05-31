import 'dotenv/config'
import Mongodb from "./mongodb";
import User from "./models/User";
import MonobankClient from "./monobank-client";

(async () => {
    await Mongodb.start()

    const users = await User.find({apiKey: {$exists: true}});
    await Promise.all(users.map(async user =>
        MonobankClient.setupWebhook(user.apiKey, user.id)
    ))
})()
