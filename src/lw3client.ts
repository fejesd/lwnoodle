import { ClientConnection } from './clientconnection';
import Debug from 'debug';
const debug = Debug('Lw3Client');

interface WaitListItem {
  signature: string;
  callback: (() => {}) | undefined;
  callbackInfo: any;
}

export class Lw3Client {
  connection: ClientConnection;
  waitresponses: boolean;
  subscribers: string[];
  signatureCounter: number;
  waitlist: WaitListItem[];

  constructor(connection: ClientConnection, waitresponses: boolean) {
    this.connection = connection;
    this.waitresponses = waitresponses;
    this.subscribers = [];
    this.waitlist = [];
    this.signatureCounter = 0;
    connection.on('error', this.socketError.bind(this));
    connection.on('close', this.socketClosed.bind(this));
    connection.on('connect', this.socketConnected.bind(this));
  }

  socketError(e: Error) {
    debug('Connection error:' + e.toString());
  }

  private socketClosed() {
    debug('Connection was closed');
  }

  private socketConnected() {
    debug('Connection established succesfully');
    this.signatureCounter = 0;
    this.waitlist = [];
    const subscribed: string[] = [];
    this.subscribers.forEach((i: any) => {
      if (subscribed.indexOf(i.path) === -1) {
        this.cmdSend('OPEN ' + i.path);
        subscribed.push(i.path);
      }
    });
  }

  private cmdSend(cmd: string, callback?: () => {}, callbackInfo?: any): void {
    if (!this.connection.isConnected()) return;
    const signature = (this.signatureCounter + 0x10000).toString(16).substr(-4).toUpperCase();
    const data = signature + '#' + cmd + '\n';
    this.connection.write(data);
    callbackInfo = callbackInfo || undefined;
    this.waitlist.push({ signature, callback, callbackInfo });
    this.signatureCounter = (this.signatureCounter + 1) % 0x10000;
  }
}
