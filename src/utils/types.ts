import { Connection, Keypair } from "@solana/web3.js";

export interface BotConfig {
  connection: Connection;
  wallet: Keypair;
  buyAmount: number;
  fetchIntervalMs: number;
  sellIntervalMs: number;
  buyFilters: {
    buyOnlyOnce: boolean;
    onlyGoingUp: boolean; // Token price must only be going up (historically)
    useBlacklist: boolean; // Blacklist token names/symbols that have rugged before
    mustBeATH: boolean; // Token must be at all time high
    minMarketCap: number;
    minLiquidity: number;
    minVolume: number;
    minAge: number; // Token min age in ms
    maxAge: number; // Token max age in ms
    minBuys: number; // Minimum number of buy transactions
    allPositive: boolean; // All timeframes must be positive
    chechMintable: boolean;
    checkFreezable: boolean;
    checkBurned: boolean;
    slippage: number;
  };
  sellFilters: {
    gain: number;
    loss: number;
    sellTime: number; // Sell time in ms
    slippage: number;
  };
}

export interface Token {
  address: string;
  pairAddress: string;
  name: string;
  symbol: string;
  decimals: number;
  liquidity: number;
  marketCap: number;
  price: number;
  ageMs: number;
  buys: number;
}

export interface HoldingEntry {
  address: string;
  name: string;
  symbol: string;
  currentPrice: number;
  buyPrice: number;
  amount: number;
  buySolAmount: number;
  buyTime: number;
  gain: number;
  decimals: number;
  processing: boolean;
}

export interface HistoryEntry {
  address: string;
  name: string;
  buyPrice: number;
  buySolAmount: number;
  amount: number;
  buyTime: number;
  sellPrice: number;
  sellSolAmount: number;
  sellTime: number;
  gain: number;
  decimals: number;
}
