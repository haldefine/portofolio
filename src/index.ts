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


    // const paymentObject = {
    //     user: '665a4b3ed06658e6b7c4acd4',
    //     amount: -1000,
    //     operationAmount: -1000,
    //     currency: 'USD',
    //     account: 'req.body.data.account',
    //     timestamp: Date.now(),
    //     description: 'data.description',
    //     rawData: 'JSON.stringify(data)',
    //     category: 'Uncategorized'
    // }
    // const payment = await Payment.create(paymentObject);
    // if (!payment) throw new Error('No payment found.');
    // await TelegramService.handleNewPayment(payment);
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
