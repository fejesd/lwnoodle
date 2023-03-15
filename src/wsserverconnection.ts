import { WebSocket, WebSocketServer } from 'ws';
import { EventEmitter } from 'node:events';
import Debug from 'debug';
import { TcpServerConnection } from './tcpserverconnection';
import { ServerConnection } from './serverconnection';
const debug = Debug('WsServerConnection');

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

  constructor(port: number, host: string = 'localhost') {
    super();
    this.port = port;
    this.host = host;
    this.server = new WebSocketServer({ port: this.port, host: this.host });
    this.server.on('connection', (ws: WebSocket) => this.onConnection(ws));
    this.server.on('error', (e) => this.onError(e));
    this.server.on('listening', () => this.onListening());
    this.server.on('close', () => this.onClose());
    this.sockets = {};
    this.socketcount = 0;
    debug('WsServerConnection created');
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

  write(socketId: number, msg: string): void {
    if (this.sockets[socketId]) {
      this.sockets[socketId].socket.send(msg);
    } else {
      debug('write error: socket not found');
    }
  }

  close(): void {
    this.server.close();
  }

  getConnectionCount(): number {
    return Object.keys(this.sockets).length;
  }
}
