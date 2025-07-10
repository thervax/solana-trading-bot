import {
  BlockhashWithExpiryBlockHeight,
  Connection,
  TransactionExpiredBlockheightExceededError,
  VersionedTransactionResponse,
} from "@solana/web3.js";
import { sleep } from "./utils";

type TransactionSenderAndConfirmationWaiterArgs = {
  connection: Connection;
  serializedTransaction: Buffer;
  blockhashWithExpiryBlockHeight: BlockhashWithExpiryBlockHeight;
};

const SEND_OPTIONS = {
  skipPreflight: true,
};

export async function transactionSenderAndConfirmationWaiter({
  connection,
  serializedTransaction,
  blockhashWithExpiryBlockHeight,
}: TransactionSenderAndConfirmationWaiterArgs): Promise<string | null> {
  try {
    const txid = await connection.sendRawTransaction(serializedTransaction, SEND_OPTIONS);

    const controller = new AbortController();
    const abortSignal = controller.signal;

    const abortableResender = async () => {
      while (true) {
        await sleep(2000);
        if (abortSignal.aborted) return;
        try {
          await connection.sendRawTransaction(serializedTransaction, SEND_OPTIONS);
        } catch (e) {
          console.warn(`Failed to resend transaction: ${e}`);
        }
      }
    };

    try {
      abortableResender();
      const lastValidBlockHeight = blockhashWithExpiryBlockHeight.lastValidBlockHeight;

      await Promise.race([
        connection.confirmTransaction(
          {
            ...blockhashWithExpiryBlockHeight,
            lastValidBlockHeight,
            signature: txid,
            abortSignal,
          },
          "confirmed"
        ),
        new Promise(async (resolve) => {
          // in case ws socket died
          while (!abortSignal.aborted) {
            await sleep(2000);
            const tx = await connection.getSignatureStatus(txid, {
              searchTransactionHistory: false,
            });
            if (tx?.value?.confirmationStatus === "confirmed") {
              resolve(tx);
            }
          }
        }),
      ]);
    } catch (e) {
      if (e instanceof TransactionExpiredBlockheightExceededError) {
        // we consume this error and getTransaction would return null
        console.error(`Transaction expired blockheight exceeded: ${e}`);
        return null;
      } else {
        throw e;
      }
    } finally {
      controller.abort();
    }

    return txid;
  } catch (e) {
    console.error(`Transactions sender failed: ${e}`);
    return null;
  }
}
