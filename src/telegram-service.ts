import {IPayment} from "./models/Payment";
import User, {IUser} from "./models/User";
import {Api, Bot, Context, Keyboard, NextFunction, session} from "grammy";
import {Menu} from "@grammyjs/menu";
import {Conversation, ConversationFlavor, conversations} from "@grammyjs/conversations";

type MyContext = Context & ConversationFlavor & {user: IUser};
type MyConversation = Conversation<MyContext>;

class TelegramService {
    private bot: Bot<MyContext, Api>;
    private startMenu: Menu;

    constructor() {
        this.bot = new Bot(process.env.BOT_TOKEN as string);
        this.bot.use(async (ctx: MyContext, next: NextFunction) => {
            if (!ctx.from || !ctx.from.id) throw new Error('from is undefined')
            let user = await User.findOne({t_id: ctx.from.id});
            if (!user) {
                const userObject: IUser = {
                    t_id: ctx.from.id,
                    categories: [],
                }
                user = await User.create(userObject)
            }
            ctx.user = user;
            next();
        })
        this.bot.use(session());
        this.bot.use(conversations());

        this.startMenu = new Menu("start-menu")
            .text("Add category", (ctx) => ctx.reply("You pressed A!"))
            .text("Remove category", async (ctx) => {
                const user = await User.findOne({t_id: ctx.from.id})
                if (!user) throw new Error("User not found");
                const keyboard = Keyboard.from(user.categories.length ? user.categories.map((c) => [c]) : [["Nothing"]]).resized()
                await ctx.reply('Choose category to delete', {reply_markup: keyboard})
            })
            .text("Edit category", (ctx) => ctx.reply("You pressed B!")).row()
            .text('Statistic', (ctx) => ctx.reply("Statistic")).row()
        this.bot.use(this.startMenu);

        this.bot.command('start', this.startCommand.bind(this));
        this.bot.start();
    }

    async handleNewPayment(payment: IPayment) {
        const user = await User.findById(payment.user);
        if (!user) throw new Error("User does not exist");
        if (payment.amount <= 0) {
            await this.bot.api.sendMessage(user.t_id, `Еее ты шо охуел деньги тратить\nПотрачено: ${-payment.amount}${payment.currency} на ${payment.description}`)
        } else {
            await this.bot.api.sendMessage(user.t_id, `Опппааа краасавчиик, денюжка пришла\nПришло: ${payment.amount}${payment.currency} от ${payment.description}`)
        }
    }

    private async startCommand(ctx: MyContext) {
        await ctx.reply('Hi', {reply_markup: this.startMenu})
    }
}

export default new TelegramService();