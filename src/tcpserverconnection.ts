import { Socket, Server } from 'net';
import { EventEmitter } from 'node:events';
import Debug from 'debug';
import { ServerConnection } from './serverconnection';
const debug = Debug('TcpServerConnection');

interface ServerSocket {
  socket: Socket;
  drained: boolean;
  inputbuffer: string;
  outputbuffer: string[];
}

export class TcpServerConnection extends EventEmitter implements ServerConnection {
  server: Server;
  sockets: { [id: string]: ServerSocket };
  frameLimiter: string;
  host: string;
  port: number;

  constructor(port: number, host = 'localhost') {
    super();
    this.host = host;
    this.port = port;
    this.server = new Server();
    this.server.on('error', this.serverError.bind(this));
    this.server.on('connection', this.serverConnection.bind(this));
    this.server.on('close', this.serverClose.bind(this));
    this.server.on('listening', this.serverListen.bind(this));
    this.server.listen({ port, host, exclusive: true });
    this.sockets = {};
    this.frameLimiter = '\n';
  }

  public name(): string {
    return 'Tcp ' + this.host + ':' + this.port;
  }

  public type(): string {
    return 'tcp';
  }

  private serverClose() {
    debug('Server closed');
    this.emit('serverclose', this);
  }

  private serverListen() {
    debug('Server is listening');
    this.emit('listening', this);
  }

  private serverError(e: Error) {
    debug('Server error: ' + e.toString());
    this.emit('error', this, e);
  }

  private serverConnection(s: Socket) {
    const socketId = Math.random().toString(36).substr(2, 5);
    debug(`New socket was received, id: ${socketId}`);
    this.sockets[socketId] = {
      socket: s,
      drained: true,
      inputbuffer: '',
      outputbuffer: [],
    };
    s.on('close', () => {
      debug(`Socket ${socketId} has been closed`);
      delete this.sockets[socketId];
      this.emit('close', this, socketId);
    });
    s.on('error', (e: Error) => {
      debug(`Socket ${socketId} has reported an error: ` + e.toString());
      this.emit('socketerror', this, socketId, e);
    });
    s.on('drain', () => {
      this.sockets[socketId].drained = true;
      debug(`Socket ${socketId} output buffer empty`);
      while (this.sockets[socketId].outputbuffer.length) {
        const msg: string = this.sockets[socketId].outputbuffer.shift() as string;
        debug(`#{$socketId}> ${msg}`);
        if (!this.sockets[socketId].socket.write(msg)) {
          this.sockets[socketId].drained = false;
          debug(`Socket ${socketId} output buffer full`);
          return;
        }
      }
    });
    s.on('data', (data: string) => {
      this.sockets[socketId].inputbuffer += data.toString();
      const messages = this.sockets[socketId].inputbuffer.split(this.frameLimiter);
      for (let i = 0; i < messages.length - 1; i++) {
        debug(`< ${messages[i]}`);
        this.emit('frame', this, socketId, messages[i].replace('\r', ''));
      }
      this.sockets[socketId].inputbuffer = messages[messages.length - 1];
      if (this.sockets[socketId].inputbuffer.length > 1e6) {
        this.sockets[socketId].inputbuffer = '';
        this.emit('socketerror', this, socketId, new Error(`Socket incoming buffer is full, no delimiter was received since 1MB of data. Data is dropped.`));
      }
    });
    this.emit('connect', this, socketId);
  }

  /**
   * Write a string to the socket. Please don't write small chunks, as Naggle algorithm is disabled. Write at least full lines / messages instead of charachters!
   * @param socketId  The socket ID
   * @param msg
   * @returns
   */
  write(socketId: string, msg: string): void {
    if (socketId === '') {
      Object.keys(this.sockets).forEach((key) => this.write(key, msg));
      return;
    }
    if (!(socketId in this.sockets)) {
      debug(`Error during write, unknown socketId: ${socketId}`);
      return; // fire an exception?
    }
    if (this.sockets[socketId].drained) {
      if (!this.sockets[socketId].socket.write(msg)) this.sockets[socketId].drained = false;
      debug(`#${socketId}> ${msg}`);
      if (!this.sockets[socketId].drained) debug(`Socket ${socketId} output buffer full`);
    } else {
      if (this.sockets[socketId].outputbuffer.length < 1024) this.sockets[socketId].outputbuffer.push(msg); // message delayed
      else this.emit('socketerror', this, socketId, new Error('Outgoing buffer is stalled, message has been dropped'));
    }
  }

  close() {
    debug('Closing server...');
    this.server.close();
  }

  getConnectionCount() {
    return Object.keys(this.sockets).length;
  }
}
