import { Connection } from "@solana/web3.js";

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export function waitForKeypress(): Promise<void> {
  return new Promise((resolve) => {
    process.stdin.setRawMode?.(true);
    process.stdin.resume();
    process.stdin.once("data", () => {
      process.stdin.setRawMode?.(false);
      process.stdin.pause();
      resolve();
    });
  });
}

export async function checkTxSuccess(
  connection: Connection,
  signature: string,
  maxRetries: number = 10,
  delayMs: number = 3000
): Promise<boolean> {
  try {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const parsedTx = await connection.getParsedTransaction(signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (parsedTx && parsedTx.meta && parsedTx.meta.err === null) {
        return true; // Transaction succeeded
      }

      if (parsedTx && parsedTx.meta && parsedTx.meta.err !== null) {
        return false; // Error occurred
      }

      await sleep(delayMs);
    }

    // Couldn't find transaction
    return false;
  } catch (err) {
    console.log(`[ERROR] Failed to check transaction: ${signature}`);
    return false;
  }
}
