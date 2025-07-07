import dotenv from "dotenv";
import { Connection } from "@solana/web3.js";

dotenv.config();

const connection = new Connection(process.env.RPC_ENDPOINT!, {
  wsEndpoint: process.env.RPC_WS_ENDPOINT,
  commitment: "confirmed",
});

async function main() {
  console.log("🤖 Trading bot starting...");

  let isRunning = true;

  
}

main();
