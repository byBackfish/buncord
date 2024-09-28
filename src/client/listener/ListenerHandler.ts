import { BunClient, BunListener } from "@client";
import { ClientEvents } from "discord.js";
import { sync } from "glob";
import { resolve } from "path";

export class ListenerHandler {
  constructor(private client: BunClient) {
    this.loadListeners();
  }

  public async loadListeners() {
    const path = resolve(this.client.options.listeners.listenerDirPath);
    sync(`${path}/*.ts`).forEach(
      async (file) => {
        const filePath = resolve(file);
        let required = await require(filePath);
        const listener = new required.default();
        listener.client = this.client;

        this.client.on(listener.event, listener.execute.bind(listener));
      }
    );
  }
}
