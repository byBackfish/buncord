import { BunClient, BunListener } from "@client";
import { ClientEvents } from "discord.js";
import { sync } from "glob";

export class ListenerHandler {
  constructor(private client: BunClient) {
    this.loadListeners();
  }

  public async loadListeners() {
    sync(`${this.client.options.listeners.listenerDirPath}**/*.ts`).forEach(
      async (file) => {
        let required = await require(file);
        const listener = new required.default();
        listener.client = this.client;

        this.client.on(listener.event, listener.execute.bind(listener));
      }
    );
  }
}
