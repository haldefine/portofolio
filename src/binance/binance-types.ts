export interface TradingData {
    dateUTC: string;
    pair: string;
    type: string;
    orderAmount: number;
    avgTradingPrice: number;
    filled: number;
    total: number;
}

export interface IAsset {
    asset: string,
    free: string,
    locked: string,
    freeze: string,
    withdrawing: string,
    ipoable: string,
    btcValuation: string

}

export interface ITrade {
    symbol: string,
    id: number,
    orderId: number,
    orderListId: number,
    price: string,
    qty: string,
    quoteQty: string,
    commission: string,
    commissionAsset: string,
    time: number,
    isBuyer: boolean,
    isMaker: boolean,
    isBestMatch: boolean
}

export interface PositionData {
    pair: string,
    orderAmount: number,
    avgTradingPrice: number,
    total: number,
    profit: number
}