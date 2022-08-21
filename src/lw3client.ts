import { Socket } from 'net';
import Debug from 'debug';
const debug = Debug('Lw3Client');

interface WaitListItem {}

export class Lw3Client {
  host: string;
  port: number;
  waitresponses: boolean;
  connected: boolean; /* is connected? */
  connecting: boolean; /* connection in progress */
  shutdown: boolean; /* shutdown in progress */
  inputbuffer: string;
  socket: Socket;
  subscribers: Array<string>;
  signature_counter: number;

  static CONNECTION_RETRY_TIMEOUT = 1000;

  constructor(host: string, port: number, waitresponses: boolean) {
    this.host = host;
    this.port = port;
    this.waitresponses = waitresponses;
    this.connected = false;
    this.connecting = false;
    this.shutdown = false;
    this.inputbuffer = '';
    this.socket = new Socket();
    this.socket.on('error', this.socketError);
    this.socket.on('connect', this.socketConnected);
    this.socket.on('close', this.socketClosed);
    this.socket.setEncoding('utf8');
    this.subscribers = [];
    this.signature_counter = 0;
  }

  socketError(e: Error) {
    if (this.connecting) debug('LW3 connection error:' + e.toString());
  }

  private socketClosed() {
    debug('LW3 connection was closed');
    this.connected = false;
    setTimeout(this.startConnect, Lw3Client.CONNECTION_RETRY_TIMEOUT);
  }

  private socketConnected() {
    console.log('LW3 connection established succesfully');
    this.connecting = false;
    this.connected = true;
    this.signature_counter = 0;
    var subscribed: Array<string> = [];
    var ctx = this;
    this.subscribers.forEach((i: any) => {
      if (subscribed.indexOf(i.path) == -1) this.cmdSend('OPEN ' + i.path);
      subscribed.push(i.path);
    });
  }

  private startConnect(): void {
    if (this.connected) return;
    if (!this.shutdown) {
      this.connecting = true;
      this.socket.connect(this.port, this.host);
    }
  }

  private cmdSend(cmd: string, callback?: () => {}, callback_info?: any): void {
    if (!this.connected) return;
    var signature = (this.signature_counter + 0x10000).toString(16).substr(-4).toUpperCase();
    var data = signature + '#' + cmd + '\n';
    this.socket.write(data);
    callback_info = callback_info || undefined;
    //this.waitlist.push({'sign': signature, 'callb': callback, 'info':callback_info});
    this.signature_counter = (this.signature_counter + 1) % 0x10000;
  }
}
