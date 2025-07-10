import { createJupiterApiClient, QuoteResponse, SwapResponse } from "@jup-ag/api";
import { Connection, Keypair, VersionedTransaction, clusterApiUrl } from "@solana/web3.js";
import { transactionSenderAndConfirmationWaiter } from "./sender";
import { checkTxSuccess, waitForKeypress } from "./utils";
import dotenv from "dotenv";
import bs58 from "bs58";
import { HistoryEntry, HoldingEntry, Token } from "./types";

dotenv.config();

const solMint = "So11111111111111111111111111111111111111112";

const jupiterApi = createJupiterApiClient();

async function getQuote(inputToken: string, outputToken: string, amount: number, slippage: number) {
  try {
    const quote = await jupiterApi.quoteGet({
      inputMint: inputToken,
      outputMint: outputToken,
      amount: amount,
      slippageBps: slippage * 100,
    });
    return quote;
  } catch (err) {
    console.log(err);
    return null;
  }
}

async function getSwapResponse(quote: QuoteResponse, wallet: Keypair) {
  try {
    const swapResult = jupiterApi.swapPost({
      swapRequest: {
        quoteResponse: quote,
        userPublicKey: wallet.publicKey.toString(),
        prioritizationFeeLamports: { priorityLevelWithMaxLamports: { maxLamports: 10000, priorityLevel: "veryHigh" } },
      },
    });
    return swapResult;
  } catch (err) {
    return null;
  }
}

export async function sendAndConfirmTransaction(
  quote: QuoteResponse,
  swapResponse: SwapResponse,
  wallet: Keypair,
  connection: Connection
) {
  const txBuffer = Buffer.from(swapResponse.swapTransaction, "base64");
  const tx = VersionedTransaction.deserialize(txBuffer);
  tx.sign([wallet]);

  const { value: simulatedTransactionResponse } = await connection.simulateTransaction(tx, {
    replaceRecentBlockhash: true,
    commitment: "processed",
  });
  const { err, logs } = simulatedTransactionResponse;
  if (err) {
    console.log(
      `[ERROR] Simulation failed for swap from ${quote.inputMint} to ${quote.outputMint}: ${logs?.toString()} `
    );
    return null;
  }

  const serializedTx = Buffer.from(tx.serialize());
  const blockhash = tx.message.recentBlockhash;

  const signature = await transactionSenderAndConfirmationWaiter({
    connection,
    serializedTransaction: serializedTx,
    blockhashWithExpiryBlockHeight: { blockhash, lastValidBlockHeight: swapResponse.lastValidBlockHeight },
  });

  if (!signature) {
    return null;
  }

  const success = await checkTxSuccess(connection, signature);
  if (!success) {
    console.log(`[ERROR] Swap transaction from ${quote.inputMint} to ${quote.outputMint} had error: ${signature}`);
    return null;
  }

  return signature;
}

async function getActualAmount(connection: Connection, signature: string, tokenAddress: string, walletAddress: string) {
  try {
    const tx = await connection.getParsedTransaction(signature, {
      maxSupportedTransactionVersion: 0,
    });
    const preBalances = tx?.meta?.preTokenBalances || [];
    const postBalances = tx?.meta?.postTokenBalances || [];

    if (tokenAddress === "So11111111111111111111111111111111111111112") {
      const preBalance = tx?.meta?.preBalances?.[0] || 0; // Pre-transaction SOL balance
      const postBalance = tx?.meta?.postBalances?.[0] || 0; // Post-transaction SOL balance

      const changeInBalance = postBalance - preBalance;
      return changeInBalance / 10 ** 9;
    }

    let preAmount = 0;
    for (let i = 0; i < preBalances.length; i++) {
      const preBalance = preBalances[i];
      if (preBalance.mint === tokenAddress && preBalance.owner === walletAddress) {
        preAmount = preBalance.uiTokenAmount.uiAmount || 0;
        break;
      }
    }

    let postAmount = 0;
    for (let i = 0; i < postBalances.length; i++) {
      const postBalance = postBalances[i];
      if (postBalance.mint === tokenAddress && postBalance.owner === walletAddress) {
        postAmount = postBalance.uiTokenAmount.uiAmount || 0;
        break;
      }
    }

    return postAmount - preAmount;
  } catch (error) {
    console.error("[ERROR] Failed to get buy amount: ", error);
    return 0;
  }
}

export async function buyToken(
  tokenData: Token,
  buyAmount: number,
  slippage: number = 1,
  connection: Connection,
  wallet: Keypair
): Promise<HoldingEntry | null> {
  try {
    const quote = await getQuote(solMint, tokenData.address, buyAmount * 10 ** 9, slippage);
    if (!quote) {
      console.log(`[ERROR] Failed to get buy quote for ${tokenData.name} (${tokenData.address})`);
      return null;
    }
    const amount = Number(quote.outAmount) / 10 ** tokenData.decimals;

    const swapResponse = await getSwapResponse(quote, wallet);
    if (!swapResponse) {
      console.log(`[ERROR] Failed to get buy swap response for ${tokenData.name} (${tokenData.address})`);
      return null;
    }

    const signature = await sendAndConfirmTransaction(quote, swapResponse, wallet, connection);
    if (!signature) {
      console.log(`[ERROR] Buy transaction was not successful for ${amount} ${tokenData.name}`);
      return null;
    }

    console.log(`[BUY] Buy transaction was successful for ${tokenData.name} (${tokenData.address}): ${signature}`);

    const actualAmount = await getActualAmount(connection, signature, tokenData.address, wallet.publicKey.toString());

    console.log(`[BUY] Bought ${actualAmount} [#${amount}] ${tokenData.name} for ${buyAmount} SOL: ${signature}`);
    return {
      address: tokenData.address,
      name: tokenData.name,
      symbol: tokenData.symbol,
      currentPrice: tokenData.price,
      buyPrice: tokenData.price,
      amount: actualAmount,
      buySolAmount: buyAmount,
      buyTime: new Date().getTime(),
      gain: 0,
      decimals: tokenData.decimals,
      processing: false,
    };
  } catch (err) {
    console.log(`[ERROR] Failed to buy token ${tokenData.name} (${tokenData.address}): ${err}`);
    return null;
  }
}

export async function sellToken(
  holding: HoldingEntry,
  slippage: number = 1,
  connection: Connection,
  wallet: Keypair
): Promise<HistoryEntry | null> {
  try {
    const roundedAmount = Math.floor(holding.amount * 10 ** holding.decimals);
    const quote = await getQuote(holding.address, solMint, roundedAmount, slippage);
    if (!quote) {
      console.log(`[ERROR] Failed to get sell quote for ${holding.name} (${holding.address})`);
      return null;
    }
    const outAmount = Number(quote.outAmount) / 10 ** 9;

    const swapResponse = await getSwapResponse(quote, wallet);
    if (!swapResponse) {
      console.log(`[ERROR] Failed to get sell swap response for ${holding.name} (${holding.address})`);
      return null;
    }

    const signature = await sendAndConfirmTransaction(quote, swapResponse, wallet, connection);
    if (!signature) {
      console.log(`[ERROR] Sell transaction was not successful for ${holding.amount} ${holding.name}`);
      return null;
    }

    console.log(`[SELL] Sell transaction was successful for ${holding.name} (${holding.address}): ${signature}`);

    const actualAmount = await getActualAmount(connection, signature, solMint, wallet.publicKey.toString());

    console.log(`[SELL] Sold ${holding.amount} ${holding.name} for ${actualAmount} [#${outAmount}] SOL: ${signature}`);
    return {
      address: holding.address,
      name: holding.name,
      buyPrice: holding.buyPrice,
      buySolAmount: holding.buySolAmount,
      buyTime: holding.buyTime,
      amount: holding.amount,
      sellPrice: holding.currentPrice,
      sellSolAmount: actualAmount,
      sellTime: new Date().getTime(),
      gain: holding.gain,
      decimals: holding.decimals,
    };
  } catch (err) {
    console.log(`[ERROR] Failed to sell token ${holding.name} (${holding.address}): ${err}`);
    return null;
  }
}
