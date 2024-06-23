import 'dotenv/config'
import Mongodb from "./mongodb";
import User from "./models/User";
import MonobankClient from "./monobank-client";

(async () => {
    await Mongodb.start()
    const users = await User.find({apiKey: {$exists: true}});
    await Promise.all(users.map(async user =>
        user.apiKey && MonobankClient.setupWebhook(user.apiKey, user.id)
    ))
})()


const shutdown = async (reason: unknown, code: number) => {
    console.log(reason)
    process.exit(code);
}

process.on('message', (msg) => {if (msg === 'shutdown') shutdown('message', 0)});
process.on('SIGINT', (reason) => shutdown(reason, 0));
process.on('SIGTERM', (reason) => shutdown(reason, 0));
process.on('SIGQUIT', (reason) => shutdown(reason, 0));
process.on('uncaughtException', console.log);
process.on('unhandledRejection', console.log);
