import { BotConfig, HoldingEntry, HistoryEntry } from "./utils/types";

export class Bot {
  public isRunning = false;
  public holdings: HoldingEntry[] = [];

  constructor(private config: BotConfig) {}

  public async start() {
    this.isRunning = true;
    this.startBuyLoop();
    this.startSellLoop();
  }

  private async startBuyLoop() {
    while (this.isRunning) {
      try {
      } catch (err) {
        console.error("Error in buy loop: ", err);
      }
    }
  }

  private async startSellLoop() {
    while (this.isRunning) {
      try {
        await Promise.all(this.holdings.map(async (holding) => {}))
      } catch (err) {
        console.error("Error in sell loop: ", err);
      }
    }
  }
}
