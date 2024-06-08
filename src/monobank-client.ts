import express, {Request, Response} from 'express'
import axios from "axios";
import Payment, {IPayment} from "./models/Payment";
import TelegramService from "./telegram-service";
import User from "./models/User";
import {nanoid} from "nanoid";
const Currencies = require('../currencies.json')

class MonobankClient {
    private readonly baseUrl = 'https://api.monobank.ua'
    private cachedRates: {currencyA: string, currencyB: string, rateSell: number, rateBuy: number, rateCross: number}[] = [];

    constructor() {
        const app = express()
        app.use(express.json())

        app.get('/', (req: Request, res: Response) => {
            res.status(200).json({})
        })

        app.post('/:userId', async (req: Request, res: Response) => {
            try {
                const userId = req.params.userId;
                const data = req.body.data.statementItem;
                const currency = Currencies.find((c:any) => c.number === data.currencyCode.toString())
                const paymentObject: IPayment = {
                    id: nanoid(),
                    user: userId,
                    amount: data.operationAmount,
                    dollarsAmount: await this.getInDollars(data.operationAmount, currency.code),
                    currency: currency.code,
                    account: req.body.data.account,
                    timestamp: data.time,
                    description: data.description,
                    rawData: JSON.stringify(data),
                    category: 'Uncategorized'
                }
                const payment = await this.createPayment(paymentObject, userId);
                await TelegramService.handleNewPayment(payment);
            } catch (e) {
                console.log(e);
            }
            res.status(200).json({})
        })

        app.listen(8080);
    }

    async createPayment(paymentObject: IPayment, userId: string) {
        const payment = await Payment.create(paymentObject);
        if (!payment) throw new Error('No payment found.');

        await User.updateOne({id: userId}, {$inc: {balance: payment.dollarsAmount}});

        return payment;
    }

    async setupWebhook(apiKey: string, userId: string) {
        const res = await axios.post(`${this.baseUrl}/personal/webhook`, {
            "webHookUrl": `http://3.73.48.67:8080/${userId}`
        }, {headers: {'X-Token': apiKey}});
        return res.data;
    }

    async getClientInfo(apiKey: string) {
        const res = await axios.get(`${this.baseUrl}/personal/client-info`, {headers: {'X-Token': apiKey}});
        return res.data;
    }

    async getStatement(apiKey: string, account: string, from: number, to: number) {
        const res = await axios.get(`${this.baseUrl}/personal/statement/${account}/${from}/${to}`, {headers: {'X-Token': apiKey}});
        return res.data;
    }

    async getCurrencyRate() {
        try {
            const res = await axios.get(`${this.baseUrl}/bank/currency`)
            res.data.forEach((r: any) => {
                r.currencyA = Currencies.find((c:any) => c.number === r.currencyCodeA.toString())?.code
                r.currencyB = Currencies.find((c:any) => c.number === r.currencyCodeB.toString())?.code
            })
            this.cachedRates = res.data
        } catch (e) {
            console.log(e)
        }
        for (const r of [...this.cachedRates]) {
            this.cachedRates.push({
                currencyA: r.currencyB,
                currencyB: r.currencyA,
                rateBuy: 1 / r.rateBuy,
                rateCross: 1 / r.rateCross,
                rateSell: 1 / r.rateSell,
            })
        }
        return this.cachedRates;
    }

    async getInDollars(amount: number, currency: string) {
        if (currency !== 'USD') {
            const exchangeRates = await this.getCurrencyRate();
            const rate = exchangeRates.find(r => r.currencyA === 'USD' && r.currencyB === currency)
            if (!rate) throw new Error('no exchange rate');
            return amount / (rate?.rateCross || rate?.rateBuy);
        } else {
            return amount;
        }
    }
}

export default new MonobankClient();