import Debug from 'debug';
import { ClientConnection } from './clientconnection';
import type { LoopbackServerConnection } from './loopbackserverconnection';
import { microtask } from './common';
const debug = Debug('LoopbackClientConnection');
const defer = microtask;

/**
 * Client side of the in-memory transport. Create it with LoopbackServerConnection.connect(), or pass the
 * server to noodleClient({ type: 'loopback', server }).
 *
 * If the server is not listening, it will retry the connection periodically (like TcpClientConnection).
 */
export class LoopbackClientConnection extends ClientConnection {
  private server: LoopbackServerConnection;
  private socketId: string | undefined;
  private shutdown: boolean;
  private connectionRetryTimeout: number;
  private inputbuffer: string;
  private frameLimiter: string;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(server: LoopbackServerConnection) {
    super();
    this.server = server;
    this.socketId = undefined;
    this.shutdown = false;
    this.connectionRetryTimeout = 1000;
    this.inputbuffer = '';
    this.frameLimiter = '\n';
    this.retryTimer = undefined;
    this.on('error', () => {
      /* empty */
    }); // prevent throwing "unhandled error event"
    defer(() => this.startConnect());
  }

  private startConnect() {
    this.retryTimer = undefined;
    if (this.shutdown || this.socketId !== undefined) return;
    const socketId = this.server.attach(this);
    if (socketId === undefined) {
      debug('Server is not listening, retry later');
      this.retryTimer = setTimeout(() => this.startConnect(), this.connectionRetryTimeout);
      return;
    }
    this.socketId = socketId;
    this.inputbuffer = '';
    debug(`Loopback connection ${socketId} established`);
    this.emit('connect');
  }

  /** @internal called by the server when data arrives */
  deliver(data: string) {
    if (this.socketId === undefined) return;
    this.inputbuffer += data;
    const messages = this.inputbuffer.split(this.frameLimiter);
    this.inputbuffer = messages.pop() as string;
    for (const message of messages) {
      debug(`< ${message}`);
      this.emit('frame', message.replace('\r', ''));
    }
  }

  /** @internal called by the server when it is closed */
  drop() {
    if (this.socketId === undefined) return;
    this.socketId = undefined;
    this.inputbuffer = '';
    debug('Connection dropped by the server');
    defer(() => this.emit('close'));
    if (!this.shutdown) this.retryTimer = setTimeout(() => this.startConnect(), this.connectionRetryTimeout);
  }

  write(msg: string): void {
    const socketId = this.socketId;
    if (socketId === undefined) return;
    debug(`> ${msg}`);
    defer(() => this.server.receive(socketId, msg));
  }

  setRetryTimeout(timeout: number) {
    this.connectionRetryTimeout = timeout;
  }

  setFrameDelimiter(delimiter: string) {
    this.frameLimiter = delimiter;
  }

  isConnected(): boolean {
    return this.socketId !== undefined;
  }

  close() {
    this.shutdown = true;
    if (this.retryTimer !== undefined) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
    const socketId = this.socketId;
    if (socketId === undefined) return;
    debug('Closing connection...');
    this.socketId = undefined;
    this.inputbuffer = '';
    this.server.detach(socketId);
    defer(() => this.emit('close'));
  }

  reopen() {
    if (this.shutdown) {
      this.shutdown = false;
      defer(() => this.startConnect());
    }
  }
}
