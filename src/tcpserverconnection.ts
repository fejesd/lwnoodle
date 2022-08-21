import { Socket, Server } from 'net';
import { EventEmitter } from 'node:events';
import Debug from 'debug';
const debug = Debug('TcpServerConnection');

interface ServerSocket {
  socket: Socket;
  drained: boolean;
  inputbuffer: string;
  outputbuffer: string[];
}

export class TcpServerConnection extends EventEmitter {
  server: Server;
  sockets: { [id: number]: ServerSocket };
  socketcount: number;
  frameLimiter: string;

  constructor(port: number) {
    super();
    this.server = new Server();
    this.server.on('error', this.serverError.bind(this));
    this.server.on('connection', this.serverConnection.bind(this));
    this.server.listen({ port, host: 'localhost', exclusive: true });
    this.sockets = {};
    this.socketcount = 0;
    this.frameLimiter = '\n';
  }

  private serverError(e: Error) {
    debug('Server error: ' + e.toString());
  }

  private serverConnection(s: Socket) {
    this.socketcount++;
    const socketId = this.socketcount;
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
      this.emit('close', socketId);
    });
    s.on('error', (e: Error) => {
      debug(`Socket ${socketId} has reported an error: ` + e.toString());
      this.emit('error', socketId, e);
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
        this.emit('frame', socketId, messages[i]);
      }
      this.sockets[socketId].inputbuffer = messages[messages.length - 1];
      if (this.sockets[socketId].inputbuffer.length > 1e6) {
        this.sockets[socketId].inputbuffer = '';
        this.emit(
          'error',
          new Error(
            `Socket {$socketId} incoming buffer is full, no delimiter was received since 1MB of data. Data is dropped.`,
          ),
        );
      }
    });
    this.emit('connect', socketId);
  }

  /**
   * Write a string to the socket. Please don't write small chunks, as Naggle algorithm is disabled. Write at least full lines / messages instead of charachters!
   * @param socketId  The socket ID
   * @param msg
   * @returns
   */
  write(socketId: number, msg: string): void {
    if (!(socketId in this.sockets)) {
      debug(`Error during write, unknown socketId: ${socketId}`);
      return; // fire an exception?
    }
    if (this.sockets[socketId].drained) {
      if (!this.sockets[socketId].socket.write(msg)) this.sockets[socketId].drained = false;
      debug(`#${socketId}> ${msg}`);
      if (!this.sockets[socketId].drained) debug(`Socket ${socketId} output buffer full`);
    } else {
      if (this.sockets[socketId].outputbuffer.length < 1024)
        this.sockets[socketId].outputbuffer.push(msg); // message delayed
      else this.emit('error', socketId, new Error('Outgoing buffer is stalled, message has been dropped'));
    }
  }

  close() {
    this.server.close();
  }

  getConnectionCount() {
    return Object.keys(this.sockets).length;
  }
}
