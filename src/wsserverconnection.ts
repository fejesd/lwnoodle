import { WebSocket, WebSocketServer } from 'ws';
import { EventEmitter } from 'node:events';
import Debug from 'debug';
import { ServerConnection } from './serverconnection';
import { Server as HttpsServer, createServer } from 'https';

const debug = Debug('WsServerConnection');

export interface WsServerOptions {
  host: string;
  port?: number;
  secure?: boolean;
  key?: string | Buffer;
  cert?: string | Buffer;
}

interface ServerWsSocket {
  socket: WebSocket;
  inputbuffer: string;
}

export class WsServerConnection extends EventEmitter implements ServerConnection {
  host: string;
  port: number;
  server: WebSocketServer;
  sockets: { [id: number]: ServerWsSocket };
  socketcount: number;
  secure: boolean;
  key: string | undefined;
  cert: string | undefined;
  httpsserver: HttpsServer | undefined;

  /**
   * Creates a new WsServerConnection.
   * @param port The port to listen on.
   * @param host The host to listen on.
   * @param secure If true, use TLS.
   * @param key The private key to use for TLS.
   * @param cert The certificate to use for TLS.
   */
  constructor(p1: WsServerOptions | number, p2?: string) {
    super();
    if (typeof p1 === 'object') {
      // WsServerOptions
      this.port = p1.port || 6107;
      this.host = p1.host || 'localhost';
      this.secure = p1.secure || false;
      this.key = p1.key?.toString();
      this.cert = p1.cert?.toString();
    } else {
      // number, string
      this.port = p1 || 6107;
      this.host = p2 || 'localhost';
      this.secure = false;
    }
    this.sockets = {};
    this.socketcount = 0;
    if (!this.secure) {
      this.server = new WebSocketServer({ port: this.port, host: this.host });
      debug('Unsecure wsServerConnection created on port ' + this.port);
      this.server.on('listening', () => this.onListening());
    } else {
      this.httpsserver = createServer({ key: this.key, cert: this.cert });
      this.httpsserver.on('listening', () => this.onListening());
      this.server = new WebSocketServer({ server: this.httpsserver });
      this.httpsserver.listen(this.port, this.host);
      debug('Secure wsServerConnection created on port ' + this.port);
      setTimeout(this.onListening.bind(this), 100);
    }
    this.server.on('connection', (ws: WebSocket) => this.onConnection(ws));
    this.server.on('error', (e) => this.onError(e));
    this.server.on('close', () => this.onClose());
  }

  onConnection(ws: WebSocket) {
    debug('onConnection');
    const socketId = ++this.socketcount;
    this.sockets[socketId] = { socket: ws, inputbuffer: '' };
    this.emit('connect', socketId);
    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => this.onMessage(socketId, data, isBinary));
    ws.on('error', (e) => {
      debug('Error on socket #' + socketId + ': ' + e.message);
    });
    ws.on('close', () => {
      debug('Close on socket #' + socketId);
      delete this.sockets[socketId];
      this.emit('close', socketId);
    });
  }

  onError(e: Error) {
    debug('Error: ' + e.message);
    this.emit('error', e.message);
  }

  onListening() {
    debug('listening');
    this.emit('listening');
  }

  onClose() {
    debug('close server');
    this.emit('serverclose');
  }

  onMessage(socketId: number, data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) {
    debug('onMessage');
    if (this.sockets[socketId]) {
      if (isBinary) {
        debug('onMessage error: binary data not supported');
      } else {
        const msg = data.toString();
        this.sockets[socketId].inputbuffer += msg;
        const frames = this.sockets[socketId].inputbuffer.split('\n');
        this.sockets[socketId].inputbuffer = frames.pop() || '';
        frames.forEach((frame) => this.emit('frame', socketId, frame));
      }
    } else {
      debug('onMessage error: socket not found');
    }
  }

  /**
   * Write a message to a socket
   */
  write(socketId: number, msg: string): void {
    if (this.sockets[socketId]) {
      this.sockets[socketId].socket.send(msg);
    } else {
      debug('write error: socket not found');
    }
  }

  close(): void {
    this.server.close();
    this.httpsserver?.close();
  }

  getConnectionCount(): number {
    return Object.keys(this.sockets).length;
  }
}
