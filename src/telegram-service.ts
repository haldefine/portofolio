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
import {StatelessQuestion} from '@grammyjs/stateless-question';
import MonobankClient from "./monobank-client";

type MyContext = Context & ConversationFlavor & {user: IUser&{_id: string}};
type MyConversation = Conversation<MyContext>;

class TelegramService {
    private bot: Bot<MyContext, Api>;
    private startMenu: Menu<MyContext>;

    constructor() {
        this.bot = new Bot(process.env.BOT_TOKEN as string);
        this.bot.use(this.dbMiddleware)
        this.bot.use(session({ initial: () => ({}) }));
        this.bot.use(conversations());


        this.bot.use(createConversation(this.removeCategory))
        this.bot.use(createConversation(this.addCategory))
        this.bot.use(createConversation(this.editCategory))
        this.startMenu = new Menu<MyContext>("start-menu")
            .text("Add category", (ctx) => ctx.conversation.enter('addCategory')).row()
            .text("Remove category", (ctx) => ctx.conversation.enter('removeCategory')).row()
            .text("Edit category", (ctx) => ctx.conversation.enter('editCategory')).row()
            .text('Statistic', this.sendStatistic).row()
            .text('Unknown transactions', (ctx) => ctx.conversation.enter('proceed_transaction')).row()
        this.bot.use(this.startMenu);
        const start = (ctx: MyContext) => ctx.reply('Hi', {reply_markup: this.startMenu});
        this.bot.command('start', start);
        this.bot.command('menu', start)


        this.bot.use(createConversation(this.proceedTransaction.bind(this), 'proceedTransaction'))
        this.bot.callbackQuery('proceed_transaction', async (ctx) => {
            await ctx.deleteMessage();
            await ctx.conversation.enter('proceedTransaction')
        })

        this.bot.start();
    }

    async handleNewPayment(payment: IPayment&{id?: string}) {
        const user = await User.findById(payment.user);
        if (!user) throw new Error("User does not exist");
        const keyboard = new InlineKeyboard().text('Шо там?', 'proceed_transaction')
        await this.bot.api.sendMessage(user.t_id, 'Новая транза', {reply_markup: keyboard})
    }

    async proceedTransaction(conversation: MyConversation, ctx: MyContext) {
        const payments = await conversation.external(
            async () => JSON.parse(JSON.stringify(await Payment.find({user: ctx.user._id, $or: [
                    { category: 'Uncategorized' },
                    { category: { $exists: false } },
                ]})))
        )
        if (!payments.length) {
            await ctx.reply('No new payments');
            return;
        }
        for (const payment of payments) {
            const keyboard = InlineKeyboard.from([ctx.user.categories.map((c) => InlineKeyboard.text(c, c))])
            if (payment.amount <= 0) {
                await ctx.reply(`Куда потратил?!\n${(-payment.amount/100).toFixed(2)}${payment.currency} ${payment.description}`, {reply_markup: keyboard})
            } else {
                await ctx.reply(`Деньги пришли\n${(payment.amount/100).toFixed(2)}${payment.currency} ${payment.description}`, {reply_markup: keyboard})
            }
            ctx = await conversation.wait();
            await Payment.updateOne({_id: payment._id}, {$set: {category: ctx.callbackQuery?.data}});
            await ctx.deleteMessage();
        }
        await ctx.reply('Done')
    }

    async dbMiddleware(ctx: MyContext, next: NextFunction) {
        if (!ctx.from || !ctx.from.id) throw new Error('from is undefined')
        let user = await User.findOne({t_id: ctx.from.id});
        if (!user) {
            const userObject: IUser = {
                t_id: ctx.from.id,
                categories: [],
            }
            user = await User.create(userObject)
        }
        ctx.user = JSON.parse(JSON.stringify(user));
        // ctx.user = user;
        next();
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
            await User.updateOne({_id: ctx.user._id}, {$pull: {categories: category}})
        )
        await ctx.reply(`${category} removed`, {reply_markup: {remove_keyboard: true}});
    }

    async editCategory(conversation: MyConversation, ctx: MyContext) {
        console.log(ctx.user)
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
        const newExistsInPayments = await Payment.exists({user: ctx.user._id, category: newCategory});
        if (!oldExists) return await ctx.reply(`${oldCategory} not exists`);
        if (newExists) return await ctx.reply(`${newCategory} already exists`);
        if (newExistsInPayments) return await ctx.reply(`${newExistsInPayments} already exists in your history`);
        await conversation.external(async () => {
            await Payment.updateMany({user: ctx.user._id, category: oldCategory}, {$set: {category: newCategory}});
            await User.updateOne({_id: ctx.user._id}, {
                $pull: {categories: oldCategory},
            })
            await User.updateOne({_id: ctx.user._id}, {
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
        await User.updateOne({_id: ctx.user._id}, {$addToSet: {categories: category}});
        await ctx.reply(`${category} added`, {reply_markup: {remove_keyboard: true}})
    }

    async sendStatistic(ctx: MyContext) {
        const exchangeRates = await MonobankClient.getCurrencyRate();
        const monthAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
        const payments = await Payment.find({timestamp: {$gte: monthAgo}});
        const summary: {[key in string]: number} = {};
        payments.forEach(p => {
            let amount;
            if (p.currency !== 'USD') {
                const rate = exchangeRates.find(r => r.currencyA === 'USD' && r.currencyB === p.currency)
                if (!rate) throw new Error('no exchange rate')
                amount = p.amount / (rate?.rateCross || rate?.rateBuy);
            } else {
                amount = p.amount;
            }
            if (amount < 0) {
                if (!summary[p.category]) summary[p.category] = 0;
                summary[p.category] += -amount;
            } else {
                if (!summary['income']) summary['income'] = 0;
                summary['income'] += amount;
            }
        })

        let msg = Object.entries(summary).reduce((prev, curr) => prev + `${curr[0]}: ${(curr[1]/100).toFixed(2)}\n`, '')
        await ctx.reply(msg);
    }
}

export default new TelegramService();