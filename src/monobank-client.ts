import express, {Request, Response} from 'express'
import axios from "axios";
import Payment, {IPayment} from "./models/Payment";
import TelegramService from "./telegram-service";
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
                // {
                //   type: 'StatementItem',
                //   data: {
                //     account: 'DUjRqxywosYm5ad_wFr0jg',
                //     statementItem: {
                //       id: 'n0P9jWnyWi-jzvAwoA',
                //       time: 1717174454,
                //       description: 'Інтернет-банк PUMBOnline',
                //       mcc: 4829,
                //       originalMcc: 4829,
                //       amount: 1000,
                //       operationAmount: 1000,
                //       currencyCode: 980,
                //       commissionRate: 0,
                //       cashbackAmount: 0,
                //       balance: 313656,
                //       hold: true
                //     }
                //   }
                // }

                // {
                //   type: 'StatementItem',
                //   data: {
                //     account: 'DUjRqxywosYm5ad_wFr0jg',
                //     statementItem: {
                //       id: 'hysfg3TAgKxx-CVLSg',
                //       time: 1717174249,
                //       description: 'Даниил',
                //       mcc: 4829,
                //       originalMcc: 4829,
                //       amount: -1000,
                //       operationAmount: -1000,
                //       currencyCode: 980,
                //       commissionRate: 0,
                //       cashbackAmount: 0,
                //       balance: 312656,
                //       hold: true,
                //       receiptId: '1HX0-1A46-106T-H8TA'
                //     }
                //   }
                // }
                const userId = req.params.userId;
                const data = req.body.data.statementItem;
                const currency = Currencies.find((c:any) => c.number === data.currencyCode.toString())
                const paymentObject: IPayment = {
                    user: userId,
                    amount: data.operationAmount,
                    currency: currency.code,
                    account: req.body.data.account,
                    timestamp: data.time,
                    description: data.description,
                    rawData: JSON.stringify(data),
                    category: 'Uncategorized'
                }
                const payment = await Payment.create(paymentObject);
                if (!payment) throw new Error('No payment found.');
                await TelegramService.handleNewPayment(payment);
            } catch (e) {
                console.log(e);
            }
            res.status(200).json({})
        })

        app.listen(8080);
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
        return this.cachedRates;
    }
}

export default new MonobankClient();