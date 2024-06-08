// @ts-ignore
import {Spot} from '@binance/connector';
import {IAsset, ITrade, PositionData, TradingData,} from './binance-types';

class BinanceProcessor {

    private readonly client: Spot;
    readonly time: number;
    constructor() {
        this.client = new Spot('1lEU4VctSHd9lNfwKEuPhtsJZRHgGuZokhjaNIb4NO7omL8QrXtoH8MJGJu82ZaG', 'o82L7zP8M0pBNzCFl3Ei0K4DLgnr69JMJUA3ebEaSSS2nwjR7YcxJy4bMeKxYo1W');
        this.time = new Date('2024-03-11T00:00:00Z').getTime();
    }

// Create an array of trading data objects
// const trades: TradingData[] = [
//     { dateUTC: "2024-05-28 17:53:12", pair: "ENAUSDT", type: "BUY", orderAmount: 22.22, avgTradingPrice: 0.9, filled: 22.22, total: 19.998 },
//     { dateUTC: "2024-05-28 17:52:48", pair: "ATOMUSDT", type: "BUY", orderAmount: 2.29, avgTradingPrice: 8.721, filled: 2.29, total: 19.97109 },
//     { dateUTC: "2024-05-28 17:52:35", pair: "ETHFIUSDT", type: "BUY", orderAmount: 4.2, avgTradingPrice: 4.738, filled: 4.2, total: 19.8996 },
//     { dateUTC: "2024-05-28 17:47:41", pair: "NOTUSDT", type: "BUY", orderAmount: 1083, avgTradingPrice: 0.009226, filled: 1083, total: 9.991758 },
//     { dateUTC: "2024-05-22 17:20:05", pair: "SOLUSDT", type: "BUY", orderAmount: 0.55, avgTradingPrice: 181.5, filled: 0.55, total: 99.825 },
//     { dateUTC: "2024-05-22 17:18:06", pair: "BTCUSDT", type: "BUY", orderAmount: 0.00213, avgTradingPrice: 70402.61, filled: 0.00213, total: 149.9575593 },
//     { dateUTC: "2024-05-10 14:37:16", pair: "ARBUSDT", type: "BUY", orderAmount: 19.6, avgTradingPrice: 1.0174, filled: 19.6, total: 19.94104 },
//     { dateUTC: "2024-05-10 14:37:01", pair: "ARBUSDT", type: "BUY", orderAmount: 49, avgTradingPrice: 1.0185, filled: 49, total: 49.9065 },
//     { dateUTC: "2024-04-14 09:04:52", pair: "ARBUSDT", type: "BUY", orderAmount: 26.7, avgTradingPrice: 1.1213, filled: 26.7, total: 29.93871 },
//     { dateUTC: "2024-04-14 09:05:01", pair: "OPUSDT", type: "BUY", orderAmount: 13.3, avgTradingPrice: 2.255, filled: 13.3, total: 29.9915 },
//     { dateUTC: "2024-04-13 21:24:00", pair: "ETHUSDT", type: "BUY", orderAmount: 0.1039, avgTradingPrice: 2885.86, filled: 0.1039, total: 299.840854 },
//     { dateUTC: "2024-04-13 21:23:46", pair: "BTCUSDT", type: "BUY", orderAmount: 0.00484, avgTradingPrice: 61856.01, filled: 0.00484, total: 299.3830884 },
//     { dateUTC: "2024-04-12 20:22:08", pair: "BLURUSDT", type: "BUY", orderAmount: 181.2, avgTradingPrice: 0.41382887, filled: 181.2, total: 74.98579 }
// ];

    async getPrice(symbol: string): Promise<number> {
        const res = await this.client.avgPrice(symbol);
        return parseFloat(res.data.price);
    }


    async getAllAssets(): Promise<IAsset[]> {
        const response = await this.client.userAsset();
        return response.data;
    }

    async getAsset(assetName: string): Promise<IAsset> {
        const response = await this.client.userAsset();
        return response.data.filter((asset: IAsset) => asset.asset === assetName)[0];
    }


    async getTrades(assets: IAsset[], baseAsset: IAsset, fromTime?: number): Promise<ITrade[]> {
        let trades: ITrade[] = [];
        assets = assets.filter(asset => (asset.asset !== baseAsset.asset));
        for (const asset of assets) {
            const response = await this.client.myTrades(asset.asset + baseAsset.asset);
            response.data.forEach((trade: ITrade) => {
                if (trade.time >= (fromTime || 0)){
                    trades.push(trade);
                }
            });
        }
        return trades;
    }

    formatTrades(trades: ITrade[]): TradingData[] {
        return trades.map((trade: ITrade) => {
            return {
                dateUTC: this.formatDate(new Date(trade.time)),
                pair: trade.symbol,
                type: trade.isBuyer ? 'BUY' : 'SELL',
                orderAmount: parseFloat(trade.qty),
                avgTradingPrice: parseFloat(trade.price),
                filled: parseFloat(trade.qty),
                total: trade.isBuyer ? parseFloat(trade.quoteQty) : -parseFloat(trade.quoteQty)
            };
        });
    }

    async formatPositions(trades: TradingData[]): Promise<PositionData[]> {
        const aggregation: { [key: string]: { orderAmount: number, totalValue: number, totalInvested: number } } = {};

        trades.forEach(trade => {
            if (!aggregation[trade.pair]) {
                aggregation[trade.pair] = {orderAmount: 0, totalValue: 0, totalInvested: 0};
            }
            aggregation[trade.pair].orderAmount += trade.orderAmount;
            aggregation[trade.pair].totalValue += trade.orderAmount * trade.avgTradingPrice;
            aggregation[trade.pair].totalInvested += trade.total;
        });

        return await Promise.all(Object.keys(aggregation).map(async pair => {
            const avgPrice = aggregation[pair].totalValue / aggregation[pair].orderAmount;
            const price = await this.getPrice(pair);
            return {
                pair,
                orderAmount: aggregation[pair].orderAmount,
                avgTradingPrice: avgPrice,
                total: aggregation[pair].totalInvested,
                profit: aggregation[pair].orderAmount * price - aggregation[pair].orderAmount * avgPrice,
            };
        }));
    }

    formatDate(date: Date): string {
        return date.toISOString().slice(0,19).replace('T', ' ');
    }



/*    const positions = await formatPositions(formatTrades(trades2));
    console.log(positions);*/

    // const trades = await getTrades(await getAllAssets(), await getAsset('USDT'), time);
    // console.log(formatPositions(formatTrades(trades)));




    // const res = await this.client.myTrades('ETHUSDT');
    // const trades = res.data;
    // console.log(trades.filter((trade: any) =>  (trade.time >= time)));




    // trades.forEach(async (trade) => {
    //     try {
    //         const price = await getPrice(trade.pair);
    //         console.log(`Price for ${trade.pair}: ${price}`);
    //         await sleep(1000);
    //     } catch (e) {
    //         throw new Error('Something went wrong');
    //     }
    // });
}

export default BinanceProcessor;