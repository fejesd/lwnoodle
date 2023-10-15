import { WebSocket, WebSocketServer } from 'ws';
import { EventEmitter } from 'node:events';
import Debug from 'debug';
import { ServerConnection } from './serverconnection';
import { Server as HttpsServer, createServer } from 'https';
import { Duplex } from 'node:stream';
import { IncomingMessage } from 'node:http';

const debug = Debug('WsServerConnection');

export interface WsServerOptions {
  host: string;
  port?: number;
  secure?: boolean;
  key?: string | Buffer;
  cert?: string | Buffer;
  auth?: (username: string, password: string) => boolean;
}

interface ServerWsSocket {
  socket: WebSocket;
  inputbuffer: string;
}

export class WsServerConnection extends EventEmitter implements ServerConnection {
  host: string;
  port: number;
  server: WebSocketServer;
  sockets: { [id: string]: ServerWsSocket };
  socketcount: number;
  secure: boolean;
  key: string | undefined;
  cert: string | undefined;
  httpsserver: HttpsServer | undefined;
  auth: ((username: string, password: string) => boolean) | undefined;

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
      this.auth = p1.auth;
    } else {
      // number, string
      this.port = p1 || 6107;
      this.host = p2 || 'localhost';
      this.secure = false;
      this.auth = undefined;
    }
    this.sockets = {};
    this.socketcount = 0;
    if (!this.secure) {
      this.server = new WebSocketServer({ port: this.port, host: this.host });
      debug('Unsecure wsServerConnection created on port ' + this.port);
      this.server.on('listening', () => this.onListening());
    } else {
      this.httpsserver = createServer({ key: this.key, cert: this.cert });
      // this.httpsserver.on('listening', () => this.onListening());
      this.server = new WebSocketServer({ noServer: true });
      this.httpsserver.listen(this.port, this.host);
      this.httpsserver.on('upgrade', (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        // check if loginCredentials has keys
        if (this.auth !== undefined) {
          const header = req.headers.authorization || ''; // get the auth header
          const token = header.split(/\s+/).pop() || ''; // and the encoded auth token
          const auth = Buffer.from(token, 'base64').toString(); // convert from base64
          const parts = auth.split(/:/); // split on colon
          const username = parts.shift(); // username is first
          const password = parts.join(':'); // everything else is the password
          if (username === undefined || password === undefined) {
            socket.write('HTTP/1.1 401 Unauthorized\r');
            socket.destroy();
            return;
          } else if (!this.auth(username, password)) {
            socket.write('HTTP/1.1 401 Unauthorized\r');
            socket.destroy();
            return;
          }
        }
        this.server.handleUpgrade(req, socket, head, (ws) => {
          this.server.emit('connection', this, ws);
        });
      });
      debug('Secure wsServerConnection created on port ' + this.port);
      setTimeout(this.onListening.bind(this), 100);
    }
    this.server.on('connection', (ws: WebSocket) => this.onConnection(ws));
    this.server.on('error', (e) => this.onError(e));
    this.server.on('close', () => this.onClose());
  }

  public name() {
    return 'ws ' + this.host + ':' + this.port;
  }

  public type() {
    return this.secure?'wss':'ws';
  }

  onConnection(ws: WebSocket) {    
    const socketId = Math.random().toString(36).substr(2, 5);
    debug('onConnection socket #' + socketId + ' connected');
    this.sockets[socketId] = { socket: ws, inputbuffer: '' };
    this.emit('connect', this, socketId);
    ws.on('message', (data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) => this.onMessage(socketId, data, isBinary));
    ws.on('error', (e) => {
      debug('Error on socket #' + socketId + ': ' + e.message);
    });
    ws.on('close', () => {
      debug('Close on socket #' + socketId);
      delete this.sockets[socketId];
      this.emit('close', this, socketId);
    });
  }

  onError(e: Error) {
    debug('Error: ' + e.message);
    this.emit('error', this, e.message);
  }

  onListening() {
    debug('listening');
    this.emit('listening', this);
  }

  onClose() {
    debug('close server');
    this.emit('serverclose', this);
  }

  onMessage(socketId: string, data: Buffer | ArrayBuffer | Buffer[], isBinary: boolean) {
    debug('onMessage socket #' + socketId + ' received data');
    if (this.sockets[socketId]) {
      if (isBinary) {
        debug('onMessage error: binary data not supported');
      } else {
        const msg = data.toString();
        this.sockets[socketId].inputbuffer += msg;
        const frames = this.sockets[socketId].inputbuffer.split('\n');
        this.sockets[socketId].inputbuffer = frames.pop() || '';        
        frames.forEach((frame) => {
          debug('onMessage socket #' + socketId + ' received frame: ' + frame);
          this.emit('frame', this, socketId, frame)
        });
      }
    } else {
      debug('onMessage error: socket not found');
    }
  }

  /**
   * Write a message to a socket
   */
  write(socketId: string, msg: string): void {
    if (socketId === '') {
      // broadcast
      Object.keys(this.sockets).forEach((id) => {
        this.sockets[id].socket.send(msg);
      });
      return;
    }
    if (this.sockets[socketId]) {
      this.sockets[socketId].socket.send(msg);
    } else {
      debug('write error: socket not found');
    }
  }

  close(): void {
    debug('Closing server..');
    this.server.close();
    this.httpsserver?.close();
  }

  getConnectionCount(): number {
    return Object.keys(this.sockets).length;
  }
}
