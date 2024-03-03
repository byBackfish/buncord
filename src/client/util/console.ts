import { Timestamp } from "@skyra/timestamp";
import * as Logger from "node-color-log";

export class BunConsole {
  logger: typeof Logger;
  template: Timestamp;

  constructor() {
    this.logger = Logger;
    this.logger.setLevel(
      process.env.NODE_ENV === "production" ? "info" : "debug"
    );
    this.template = new Timestamp("DD/MM/YYYY @ HH:mm:ss");
  }

  get timestamp() {
    return this.template.display(new Date());
  }

  debug(...args: any[]) {
    if (this.logger.level != "debug") return;
    this.logger
      .bgColor("magenta")
      .bold()
      .log(`[${this.timestamp}]`)
      .joint()
      .log(" ")
      .joint()
      .log(...args);
  }

  log(...args: any[]) {
    this.logger
      .bgColor("green")
      .color("black")
      .bold()
      .log(`[${this.timestamp}]`)
      .joint()
      .log(" ")
      .joint()
      .log(...args);
  }

  warn(...args: any[]) {
    this.logger
      .bgColor("yellow")
      .color("black")
      .log(`[${this.timestamp}]`)
      .joint()
      .log(" ")
      .joint()
      .log(...args);
  }

  error(...args: any[]) {
    this.logger
      .bgColor("red")
      .bold()
      .log(`[${this.timestamp}]`)
      .joint()
      .log(" ")
      .joint()
      .log(...args);
  }
}
