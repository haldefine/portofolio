import Payment, {IPayment} from "./models/Payment";
import User, {IUser} from "./models/User";
import {Api, Bot, Context, InlineKeyboard, Keyboard, NextFunction, session} from "grammy";
import {Menu} from "@grammyjs/menu";
import {
    Conversation,
    ConversationFlavor,
    conversations,
    createConversation
} from "@grammyjs/conversations";
import MonobankClient from "./monobank-client";
import mongoose, {Document} from "mongoose";
import {nanoid} from "nanoid";
import BinanceProcessor from "./binance/binance-processor";

type MyContext = Context & ConversationFlavor & {user: IUser};
type MyConversation = Conversation<MyContext>;

class TelegramService {
    private bot: Bot<MyContext, Api>;
    private startMenu: Menu<MyContext>;

    constructor() {
        this.bot = new Bot(process.env.BOT_TOKEN as string);
        this.bot.use(this.dbMiddleware)
        this.bot.use(session({ initial: () => ({}) }));
        this.bot.use(conversations());


        this.bot.use(createConversation(this.proceedTransaction.bind(this), 'proceedTransaction'))
        this.bot.callbackQuery('proceed_transaction', async (ctx) => {
            await ctx.deleteMessage();
            await ctx.conversation.enter('proceedTransaction')
        })


        this.bot.use(createConversation(this.removeCategory))
        this.bot.use(createConversation(this.addCategory))
        this.bot.use(createConversation(this.editCategory))
        this.bot.use(createConversation(this.addTransaction.bind(this), 'addTransaction'))
        this.bot.use(createConversation(this.setBalance.bind(this), 'setBalance'))
        this.startMenu = new Menu<MyContext>("start-menu")
            .text("Add category", (ctx) => ctx.conversation.enter('addCategory')).row()
            .text("Remove category", (ctx) => ctx.conversation.enter('removeCategory')).row()
            .text("Edit category", (ctx) => ctx.conversation.enter('editCategory')).row()
            .text('Statistic', this.sendStatistic).row()
            .text('Binance positions', this.getBinance).row()
            .text('Unknown transactions', (ctx) => ctx.conversation.enter('proceedTransaction')).row()
            .text('Add transaction', (ctx) => ctx.conversation.enter('addTransaction')).row()
            .text('Set balance', (ctx) => ctx.conversation.enter('setBalance')).row()
        this.bot.use(this.startMenu);
        const start = (ctx: MyContext) => ctx.reply('Hi', {reply_markup: this.startMenu});
        this.bot.command('start', start);
        this.bot.command('menu', start)


        this.bot.catch(console.log);
        this.bot.start();
    }

    async getBinance(ctx: MyContext){
        const binance = new BinanceProcessor();
        const trades = await binance.getTrades(await binance.getAllAssets(), await binance.getAsset('USDT'), binance.time);
        const positions = await binance.formatPositions(binance.formatTrades(trades));

        let msg: string = '';

        positions.forEach((position, index) => {
            msg += `${index + 1}. Position ${position.pair} : invested ${position.total}$, profit ${position.profit}$\n`;
        });

        await ctx.reply(msg);
    }

    async setBalance(conversation: MyConversation, ctx: MyContext) {
        await ctx.reply('Write new balance');
        ctx = await conversation.wait();
        const balance = ctx.msg?.text;
        if (!balance) return;
        await User.updateOne({id: ctx.user.id}, {$set: {balance: Number(balance)*100}})
        await ctx.reply(`Balance set to ${balance}`)
    }

    async handleNewPayment(payment: IPayment&{id?: string}) {
        const user = await User.findById(payment.user);
        if (!user) throw new Error("User does not exist");
        const keyboard = new InlineKeyboard().text('Шо там?', 'proceed_transaction')
        await this.bot.api.sendMessage(user.t_id, 'Новая транза', {reply_markup: keyboard})
    }

    async proceedTransaction(conversation: MyConversation, ctx: MyContext) {
        if (ctx.user.categories.length === 0) {
            return ctx.reply('You must create categories first');
        }
        const payments = await conversation.external(async () => {
            const payments = await Payment.find({
                user: ctx.user.id, $or: [
                    {category: 'Uncategorized'},
                    {category: {$exists: false}},
                ]
            });
            return payments.map(p => {
                return p.toJSON();
            })
            // return JSON.parse(JSON.stringify(payments)) as typeof payments;
        })
        if (!payments.length) {
            await ctx.reply('No new payments');
            return;
        }
        for (const payment of payments) {
            ctx = await this.askCategory(conversation, ctx, payment)
        }
        await ctx.reply('Done')
    }

    async askCategory(conversation: MyConversation, ctx: MyContext, payment: IPayment) {
        const keyboard = InlineKeyboard.from(ctx.user.categories.map((c) => [InlineKeyboard.text(c, c)]))
        await ctx.reply(`Ану шо это?!\n${(-payment.amount/100).toFixed(2)} ${payment.currency} ${payment.description}`, {reply_markup: keyboard})
        ctx = await conversation.waitForCallbackQuery(new RegExp(ctx.user.categories.join('|')));
        const res = await Payment.updateOne({id: payment.id}, {$set: {category: ctx.callbackQuery?.data}});
        await ctx.deleteMessage();
        return ctx;
    }

    async addTransaction(conversation: MyConversation, ctx: MyContext) {
        await ctx.reply('Write amount (-100 for expense, 100 for income)');
        const amount = Number((await conversation.wait()).message?.text) * 100;
        await ctx.reply('Write currency');
        const currency = (await conversation.wait()).message?.text?.toUpperCase() as string;
        await ctx.reply('Write description');
        const description = (await conversation.wait()).message?.text as string;
        const paymentObject: IPayment = {
            id: nanoid(),
            user: ctx.user.id,
            amount: amount,
            dollarsAmount: await MonobankClient.getInDollars(amount, currency),
            currency: currency,
            timestamp: Math.round(Date.now() / 1000),
            description: description,
            category: 'Uncategorized'
        }
        const payment = await MonobankClient.createPayment(paymentObject, ctx.user.id)
        ctx = await this.askCategory(conversation, ctx, payment)
    }

    async dbMiddleware(ctx: MyContext, next: NextFunction) {
        if (!ctx.from || !ctx.from.id) throw new Error('from is undefined')
        let user = await User.findOne({t_id: ctx.from.id});
        if (!user) {
            const userObject: IUser = {
                id: nanoid(),
                t_id: ctx.from.id,
                categories: [],
                balance: 0
            }
            user = await User.create(userObject)
        }
        ctx.user = user.toJSON();
        // ctx.user = JSON.parse(JSON.stringify(user));
        // ctx.user = user;
        await next();
    }


    async removeCategory(conversation: MyConversation, ctx: MyContext) {
        const keyboard = await conversation.external(() =>
            Keyboard.from(ctx.user.categories.length ? ctx.user.categories.map((c) => [c]) : [["Nothing"]]).resized()
        )
        await ctx.reply('Choose category to delete', {reply_markup: keyboard})
        ctx = await conversation.wait();
        const category = ctx.msg?.text;
        if (!category) return;
        await conversation.external(async () =>
            await User.updateOne({id: ctx.user.id}, {$pull: {categories: category}})
        )
        await ctx.reply(`${category} removed`, {reply_markup: {remove_keyboard: true}});
    }

    async editCategory(conversation: MyConversation, ctx: MyContext) {
        const keyboard = await conversation.external(() =>
            Keyboard.from(ctx.user.categories.length ? ctx.user.categories.map((c) => [c]) : [["Nothing"]]).resized()
        )
        await ctx.reply('Choose category to edit', {reply_markup: keyboard})
        ctx = await conversation.wait();
        const oldCategory = ctx.msg?.text;
        if (!oldCategory) return;
        await ctx.reply('Write name for new category', {reply_markup: {remove_keyboard: true}})
        ctx = await conversation.wait();
        const newCategory = ctx.msg?.text;
        if (!newCategory) return;
        const oldExists = ctx.user.categories.includes(oldCategory);
        const newExists = ctx.user.categories.includes(newCategory);
        const newExistsInPayments = await Payment.exists({user: ctx.user.id, category: newCategory});
        if (!oldExists) return await ctx.reply(`${oldCategory} not exists`);
        if (newExists) return await ctx.reply(`${newCategory} already exists`);
        if (newExistsInPayments) return await ctx.reply(`${newExistsInPayments} already exists in your history`);
        await conversation.external(async () => {
            await Payment.updateMany({user: ctx.user.id, category: oldCategory}, {$set: {category: newCategory}});
            await User.updateOne({id: ctx.user.id}, {
                $pull: {categories: oldCategory},
            })
            await User.updateOne({id: ctx.user.id}, {
                $addToSet: {categories: newCategory}
            })
        })
        await ctx.reply(`Renamed ${oldCategory} => ${newCategory}`);
    }

    async addCategory(conversation: MyConversation, ctx: MyContext) {
        await ctx.reply('Write name for new category')
        ctx = await conversation.wait();
        const category = ctx.msg?.text;
        if (!category) return;
        await User.updateOne({id: ctx.user.id}, {$addToSet: {categories: category}});
        await ctx.reply(`${category} added`, {reply_markup: {remove_keyboard: true}})
    }

    async sendStatistic(ctx: MyContext) {
        await ctx.reply(`Current balance: ${(ctx.user.balance/100).toFixed(2)}`)

        const exchangeRates = await MonobankClient.getCurrencyRate();
        const now = Date.now();
        const month = (shift: number) => new Date(new Date().getFullYear(), new Date().getMonth() + shift + 1, 1);
        const timeframes = [
            {$gte: now - 365 * 24 * 60 * 60 * 1000, $lte: now, name: '365 days'},
            {$gte: now - 90 * 24 * 60 * 60 * 1000, $lte: now, name: '90 days'},
            {$gte: now - 30 * 24 * 60 * 60 * 1000, $lte: now, name: '30 days'},
            {$gte: now - 7 * 24 * 60 * 60 * 1000, $lte: now, name: '7 days'},
            {$gte: month(-1).getTime(), $lte: month(0).getTime(), name: month(-1).toLocaleString('default', { month: 'long' })},
            {$gte: month(-2).getTime(), $lte: month(-1).getTime(), name: month(-2).toLocaleString('default', { month: 'long' })},
            {$gte: month(-3).getTime(), $lte: month(-2).getTime(), name: month(-3).toLocaleString('default', { month: 'long' })},
        ];
        for (const timeframe of timeframes) {
            const payments = await Payment.find({user: ctx.user.id, timestamp: {$gte: timeframe.$gte / 1000, $lte: timeframe.$lte / 1000}});
            const summary: {[key in string]: number} = {};
            let expenses = 0, income = 0;
            payments.forEach(p => {
                if (!summary[p.category]) summary[p.category] = 0;
                summary[p.category] += p.dollarsAmount;

                if (p.dollarsAmount >  0) {
                    income += p.dollarsAmount;
                } else {
                    expenses += p.dollarsAmount;
                }
            })

            let msg = `${timeframe.name}:\n\n` +
                Object.entries(summary).sort((a, b) => a[1] - b[1])
                    .reduce((prev, curr) => prev + `${curr[0]}: ${curr[1] > 0 ? '+' : ''}${(curr[1]/100).toFixed(2)}\n`, '') + '\n' +
                `Expenses: ${(expenses/100).toFixed(2)}\n` +
                `Income: ${(income/100).toFixed(2)}\n` +
                `Total: ${(expenses/100 + income/100).toFixed(2)}\n` +
                `Transactions: ${payments.length}`;
            await ctx.reply(msg);
        }
    }
}

export default new TelegramService();