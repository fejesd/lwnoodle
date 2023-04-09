import { WebSocket } from 'ws';
import { ClientConnection } from './clientconnection';
import Debug from 'debug';
const debug = Debug('WsClientConnection');

export interface WsClientConnectionOptions {
  host?: string;
  port?: number;
  secure?: boolean;
  connectionRetryTimeout?: number;
  rejectUnauthorized?: boolean;
  username?: string;
  password?: string;
}

export class WsClientConnection extends ClientConnection {
  private ws: WebSocket | null = null;
  host: string;
  port: number;
  username?: string;
  password?: string;
  connected: boolean; /* is connected? */
  connecting: boolean; /* connection in progress */
  private shutdown: boolean; /* shutdown in progress */
  private connectionRetryTimeout: number;
  private inputbuffer: string;
  private frameLimiter: string;
  secure: boolean;
  rejectUnauthorized: boolean;

  constructor(p1: string | WsClientConnectionOptions, p2?: number) {
    super();
    if (typeof p1 === 'string') {
      // string
      this.host = p1;
      this.port = p2 || 6107;
      this.secure = false;
      this.connectionRetryTimeout = 1000;
      this.rejectUnauthorized = false;
    } else {
      // WsClientConnectionOptions
      this.host = p1.host || 'localhost';
      this.port = p1.port || 6107;
      this.secure = p1.secure || false;
      this.rejectUnauthorized = p1.rejectUnauthorized || false;
      this.connectionRetryTimeout = p1.connectionRetryTimeout || 1000;
      this.username = p1.username;
      this.password = p1.password;
    }
    this.connected = false;
    this.connecting = false;
    this.frameLimiter = '\n';
    this.shutdown = false;
    this.inputbuffer = '';
    this.startConnect(); // start connection
    if (this.secure) debug('Secure WSClientConnection created');
    else debug('WSClientConnection created');
  }

  startConnect() {
    if (this.shutdown) return;
    const wsoptions: any = { rejectUnauthorized: this.rejectUnauthorized };
    if (this.username) {
      const auth = 'Basic ' + Buffer.from(this.username + ':' + this.password).toString('base64');
      wsoptions['headers'] = { Authorization: auth };
    }
    this.ws = new WebSocket(this.secure ? `wss://${this.host}:${this.port}` : `ws://${this.host}:${this.port}`, wsoptions);
    this.ws.on('open', () => this.onOpen());
    this.ws.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => this.onMessage(data, isBinary));
    this.ws.on('close', () => this.onClose());
    this.ws.on('error', (e) => {
      this.emit('error', e);
      debug('Error on socket: ' + e.message);
    });
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
