import Payment, {IPayment} from "./models/Payment";
import User, {ITemplate, IUser} from "./models/User";
import {Api, Bot, Context, InlineKeyboard, Keyboard, NextFunction, session} from "grammy";
import {Menu} from "@grammyjs/menu";
import {Conversation, ConversationFlavor, conversations, createConversation} from "@grammyjs/conversations";
import MonobankClient from "./monobank-client";
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
        this.bot.use(createConversation(this.sendStatistic.bind(this), 'sendStatistic'))
        this.bot.use(createConversation(this.addTransaction.bind(this), 'addTransaction'))
        this.bot.use(createConversation(this.setBalance.bind(this), 'setBalance'))
        this.bot.use(createConversation(this.deleteTransactions.bind(this), 'deleteTransactions'))
        this.bot.use(createConversation(this.saveTemplate.bind(this), 'saveTemplate'))
        this.bot.use(createConversation(this.removeTemplate.bind(this), 'removeTemplate'))
        this.startMenu = new Menu<MyContext>("start-menu")
            .text("Add category", (ctx) => ctx.conversation.enter('addCategory')).row()
            .text("Remove category", (ctx) => ctx.conversation.enter('removeCategory')).row()
            .text("Edit category", (ctx) => ctx.conversation.enter('editCategory')).row()
            .text('Statistic', (ctx) => ctx.conversation.enter('sendStatistic')).row()
            .text('Binance positions', this.getBinance).row()
            .text('Unknown transactions', (ctx) => ctx.conversation.enter('proceedTransaction')).row()
            .text('Add transaction', (ctx) => ctx.conversation.enter('addTransaction')).row()
            .text('Set balance', (ctx) => ctx.conversation.enter('setBalance')).row()
            .text('Delete transactions', (ctx) => ctx.conversation.enter('deleteTransactions')).row()
            .text('Save as template', (ctx) => ctx.conversation.enter('saveTemplate')).row()
            .text('Remove template', (ctx) => ctx.conversation.enter('removeTemplate')).row()
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
        await conversation.external(() =>
            User.updateOne({id: ctx.user.id}, {$set: {balance: Number(balance)*100}})
        )
        await ctx.reply(`Balance set to ${balance}`)
    }

    async handleNewPayment(payment: IPayment) {
        const user = await User.findOne({id: payment.user});
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
        const keyboard = InlineKeyboard.from(ctx.user.categories.sort().map((c) => [InlineKeyboard.text(c, c)]))
        await ctx.reply(`Ану шо это?!\n${(payment.amount/100).toFixed(2)} ${payment.currency} ${payment.description}`, {reply_markup: keyboard})
        ctx = await conversation.waitForCallbackQuery(new RegExp(ctx.user.categories.join('|')));
        const res = await conversation.external(() =>
            Payment.updateOne({id: payment.id}, {$set: {category: ctx.callbackQuery?.data}})
        )
        await ctx.deleteMessage();
        return ctx;
    }

    async addTransaction(conversation: MyConversation, ctx: MyContext) {
        const typeKeyboard = new InlineKeyboard().text('Income').text('Expense')
        await ctx.reply('Type?', {reply_markup: typeKeyboard});
        const type = (await conversation.waitForCallbackQuery(new RegExp('Income|Expense'))).callbackQuery?.data;
        await ctx.reply('Write amount');
        let amount = Number((await conversation.wait()).message?.text) * 100;
        if (type === 'Expense') {
            amount = -amount;
        }
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
        const payment = await conversation.external(() =>
            MonobankClient.createPayment(paymentObject, ctx.user.id)
        )
        const isRecognized = await conversation.external(async () =>
            await this.checkTemplates(payment)
        )
        if (!isRecognized) ctx = await this.askCategory(conversation, ctx, payment)
    }

    async dbMiddleware(ctx: MyContext, next: NextFunction) {
        if (!ctx.from || !ctx.from.id) throw new Error('from is undefined')
        let user = await User.findOne({t_id: ctx.from.id});
        if (!user) {
            const userObject: IUser = {
                id: nanoid(),
                t_id: ctx.from.id,
                categories: [],
                balance: 0,
                templates: [],
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
        await conversation.external(() =>
            User.updateOne({id: ctx.user.id}, {$addToSet: {categories: category}})
        )
        await ctx.reply(`${category} added`, {reply_markup: {remove_keyboard: true}})
    }

    async sendStatistic(conversation: MyConversation, ctx: MyContext) {
        const timeframes = await conversation.external(() => {
            const now = Date.now();
            const month = (shift: number) => new Date(new Date().getFullYear(), new Date().getMonth() + shift + 1, 1);
            return [
                {$gte: now - 365 * 24 * 60 * 60 * 1000, $lte: now, name: '365 days'},
                {$gte: now - 90 * 24 * 60 * 60 * 1000, $lte: now, name: '90 days'},
                {$gte: now - 30 * 24 * 60 * 60 * 1000, $lte: now, name: '30 days'},
                {$gte: now - 7 * 24 * 60 * 60 * 1000, $lte: now, name: '7 days'},
                {$gte: now - 1 * 24 * 60 * 60 * 1000, $lte: now, name: '1 day'},
                {$gte: month(-1).getTime(), $lte: month(0).getTime(), name: month(-1).toLocaleString('default', { month: 'long' })},
                {$gte: month(-2).getTime(), $lte: month(-1).getTime(), name: month(-2).toLocaleString('default', { month: 'long' })},
                {$gte: month(-3).getTime(), $lte: month(-2).getTime(), name: month(-3).toLocaleString('default', { month: 'long' })},
            ];
        })

        const keyboard = InlineKeyboard.from(timeframes.map(t => [InlineKeyboard.text(t.name, t.name)]));
        await ctx.reply(`Current balance: ${(ctx.user.balance/100).toFixed(2)}\nWhat statistic do you want?`, {reply_markup: keyboard});

        ctx = await conversation.waitForCallbackQuery(new RegExp(timeframes.map(t => t.name).join('|')));
        if (!ctx) return;

        const timeframe = timeframes.find(t => t.name === ctx.callbackQuery?.data);
        if (!timeframe) return;

        const payments = await conversation.external(async () =>
            await Payment.find({user: ctx.user.id, timestamp: {$gte: timeframe.$gte / 1000, $lte: timeframe.$lte / 1000}})
        )
        const summary: {[key in string]: number} = {};
        let expenses = 0, income = 0;
        payments.forEach(p => {
            if (!summary[p.category]) summary[p.category] = 0;
            summary[p.category] += p.dollarsAmount;
        })
        Object.values(summary).forEach(s => {
            if (s > 0) {
                income += s;
            } else {
                expenses += s;
            }
        })

        let msg = `${timeframe.name}:\n\n` +
            Object.entries(summary).sort((a, b) => a[1] - b[1])
                .reduce((prev, curr) => prev + `${curr[0]}: ${curr[1] > 0 ? '+' : ''}${(curr[1]/100).toFixed(2)}\n`, '') + '\n' +
            `Expenses: ${(expenses/100).toFixed(2)}\n` +
            `Income: ${(income/100).toFixed(2)}\n` +
            `Total: ${(expenses/100 + income/100).toFixed(2)}\n` +
            `Transactions: ${payments.length}`;
        await ctx.deleteMessage();
        await ctx.reply(msg);
    }

    async deleteTransactions(conversation: MyConversation, ctx: MyContext) {
        const paymentToDelete = await this.choosePayment(conversation, ctx);
        if (!paymentToDelete) return ctx.reply('Error: cannot find payment');

        await conversation.external(() =>
            Payment.deleteOne({user: ctx.user.id, id: paymentToDelete.id})
        )
        await ctx.reply(`Deleted:\n${paymentToDelete.amount/100} ${paymentToDelete.currency} ${paymentToDelete.description}`);
        return ctx;
    }

    async saveTemplate(conversation: MyConversation, ctx: MyContext) {
        const payment = await this.choosePayment(conversation, ctx);
        if (!payment) return ctx.reply('Error: cannot find payment');
        await conversation.external(async () => {
            const template: ITemplate = {
                paymentCategory: payment.category,
                paymentDescription: payment.description,
            }
            await User.updateOne({id: ctx.user.id}, {$push: {templates: template}})
        })
        await ctx.reply('Template saved');
    }

    async removeTemplate(conversation: MyConversation, ctx: MyContext) {
        const keyboard = InlineKeyboard.from(ctx.user.templates.map(t => [InlineKeyboard.text(`${t.paymentDescription} - ${t.paymentCategory}`, t.paymentDescription)]));
        await ctx.reply('Choose template to remove', {reply_markup: keyboard});
        ctx = await conversation.waitForCallbackQuery(new RegExp(ctx.user.templates.map(p => p.paymentDescription).join('|')));
        await ctx.deleteMessage();
        if (!ctx) return;
        await User.updateOne({id: ctx.user.id}, {$pull: {template: {paymentDescription: ctx.callbackQuery?.data}}});
        await ctx.reply('Template removed');
    }

    private async choosePayment(conversation: MyConversation, ctx: MyContext) {
        const lastPayments = await conversation.external(async () => {
            const payments = await Payment.find({user: ctx.user.id}).sort({timestamp: -1}).limit(10);
            return payments.map(p => p.toJSON());
        })
        const keyboard = InlineKeyboard.from(lastPayments.map(p => [InlineKeyboard.text(`${p.amount/100} ${p.currency} ${p.description}`, p.id)]));
        await ctx.reply('Choose transaction', {reply_markup: keyboard});
        ctx = await conversation.waitForCallbackQuery(new RegExp(lastPayments.map(p => p.id).join('|')));
        await ctx.deleteMessage();
        if (!ctx) return;
        return lastPayments.find(p => p.id === ctx.callbackQuery?.data);
    }

    async checkTemplates(payment: IPayment) {
        const user = await User.findOne({id: payment.user});
        if (!user) throw new Error("User does not exist");
        const template = user.templates.find(t => t.paymentDescription === payment.description);
        if (!template) return false;
        await Payment.updateOne({id: payment.id}, {$set: {category: template.paymentCategory}});
        await this.bot.api.sendMessage(user.t_id, `Transaction category marked automatically:\n${payment.amount/100} ${payment.currency} ${payment.description} - ${template.paymentCategory}`);
        return true;
    }
}

export default new TelegramService()