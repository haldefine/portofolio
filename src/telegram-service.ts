import {IPayment} from "./models/Payment";
import User from "./models/User";
import {Api, Bot, Context} from "grammy";

class TelegramService {
    private bot: Bot<Context, Api>;
    constructor() {
        this.bot = new Bot(process.env.BOT_TOKEN as string);
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
}

export default new TelegramService();