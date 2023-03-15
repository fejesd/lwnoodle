import { WebSocket } from 'ws';
import { ClientConnection } from './clientconnection';
import Debug from 'debug';
const debug = Debug('WsClientConnection');

export class WsClientConnection extends ClientConnection {
  private ws: WebSocket | null = null;
  host: string;
  port: number;
  connected: boolean; /* is connected? */
  connecting: boolean; /* connection in progress */
  private shutdown: boolean; /* shutdown in progress */
  private connectionRetryTimeout: number;
  private inputbuffer: string;
  private frameLimiter: string;

  constructor(host: string = 'localhost', port: number = 80) {
    super();
    this.host = host;
    this.port = port;
    this.connected = false;
    this.connecting = false;
    this.connectionRetryTimeout = 1000; // retry after 1 secs
    this.frameLimiter = '\n';
    this.shutdown = false;
    this.inputbuffer = '';
    this.startConnect(); // start connection
    debug('WSClientConnection created');
  }

  startConnect() {
    this.ws = new WebSocket(`ws://${this.host}:${this.port}`);
    this.ws.on('open', () => this.onOpen());
    this.ws.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => this.onMessage(data, isBinary));
    this.ws.on('close', () => this.onClose());
    this.connecting = true;
    debug('WSClientConnection connect..');
  }

  onOpen() {
    this.connected = true;
    this.connecting = false;
    this.inputbuffer = '';
    this.emit('connect');
    debug('WS connection established');
  }

  onMessage(data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) {
    if (isBinary) {
      debug('Binary data received, discarding');
      return;
    }
    this.inputbuffer += data.toString();
    let pos = this.inputbuffer.indexOf(this.frameLimiter);
    while (pos >= 0) {
      const msg = this.inputbuffer.substring(0, pos);
      this.inputbuffer = this.inputbuffer.substring(pos + this.frameLimiter.length);
      this.emit('frame', msg);
      pos = this.inputbuffer.indexOf(this.frameLimiter);
    }
  }

  onClose() {
    this.connected = false;
    this.connecting = false;
    this.ws = null;
    this.emit('close');
    if (!this.shutdown) setTimeout(this.startConnect.bind(this), this.connectionRetryTimeout);
  }

  send(data: any) {
    if (this.connected) this.ws?.send(data);
    else debug('not connected, discarding message');
  }

  close() {
    this.shutdown = true;
    if (this.connected) this.ws?.close();
    else debug('not connected, discarding message');
  }

  write(msg: string) {
    if (this.connected) {
      this.ws?.send(msg);
    } else {
      debug(': not connected, discarding message');
    }
  }

  setRetryTimeout(timeout: number) {
    this.connectionRetryTimeout = timeout;
  }

  setFrameDelimiter(delimiter: string) {
    this.frameLimiter = delimiter;
  }

  isConnected(): boolean {
    return this.connected;
  }

  reopen() {
    if (this.shutdown) {
      this.shutdown = false;
      this.startConnect();
    } else {
      debug('reopen: not shutdown, discarding message');
    }
  }
}
