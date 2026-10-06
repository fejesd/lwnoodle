import { EventEmitter } from 'events';
import Debug from 'debug';
import { ServerConnection } from './serverconnection';
import { LoopbackClientConnection } from './loopbackclientconnection';
import { microtask } from './common';
const debug = Debug('LoopbackServerConnection');
const defer = microtask;

/**
 * In-memory server transport. It does not open any socket, clients connect to it by calling connect().
 * Useful for running a server and a client in the same process (eg. in a browser, or in tests).
 *
 * The data path behaves like a socket: writes are delivered asynchronously, in order, and split into frames
 * by the frame delimiter ('\n').
 *
 * @event   listening
 * @event   serverclose
 * @event   connect     (server, socketId)
 * @event   close       (server, socketId)
 * @event   frame       (server, socketId, msg)
 */
export class LoopbackServerConnection extends EventEmitter implements ServerConnection {
  private serverName: string;
  private listening: boolean;
  private sockets: { [id: string]: { client: LoopbackClientConnection; inputbuffer: string } };
  private socketCounter: number;
  frameLimiter: string;

  constructor(name: string = 'default') {
    super();
    this.serverName = name;
    this.sockets = {};
    this.socketCounter = 0;
    this.frameLimiter = '\n';
    this.listening = true;
    defer(() => {
      debug('Server is listening');
      this.emit('listening', this);
    });
  }

  public name(): string {
    return 'Loopback ' + this.serverName;
  }

  public type(): string {
    return 'loopback';
  }

  /** Is the server accepting connections? */
  public isListening(): boolean {
    return this.listening;
  }

  /**
   * Creates a new client connection to this server.
   */
  public connect(): LoopbackClientConnection {
    return new LoopbackClientConnection(this);
  }

  /** @internal called by LoopbackClientConnection. Returns the socketId or undefined if the server is closed. */
  attach(client: LoopbackClientConnection): string | undefined {
    if (!this.listening) return undefined;
    const socketId = 'lb' + (this.socketCounter++).toString(36);
    this.sockets[socketId] = { client, inputbuffer: '' };
    debug(`New connection, id: ${socketId}`);
    this.emit('connect', this, socketId);
    return socketId;
  }

  /** @internal called by LoopbackClientConnection */
  detach(socketId: string) {
    if (!(socketId in this.sockets)) return;
    debug(`Connection ${socketId} has been closed`);
    delete this.sockets[socketId];
    this.emit('close', this, socketId);
  }

  /** @internal called by LoopbackClientConnection */
  receive(socketId: string, data: string) {
    const socket = this.sockets[socketId];
    if (!socket) return;
    socket.inputbuffer += data;
    const messages = socket.inputbuffer.split(this.frameLimiter);
    socket.inputbuffer = messages.pop() as string;
    for (const message of messages) {
      debug(`#${socketId}< ${message}`);
      this.emit('frame', this, socketId, message.replace('\r', ''));
    }
  }

  /**
   * Write a string to a client. Empty socketId means broadcast to every client.
   */
  write(socketId: string, msg: string): void {
    if (socketId === '') {
      Object.keys(this.sockets).forEach((key) => this.write(key, msg));
      return;
    }
    const socket = this.sockets[socketId];
    if (!socket) {
      debug(`Error during write, unknown socketId: ${socketId}`);
      return;
    }
    debug(`#${socketId}> ${msg}`);
    const client = socket.client;
    defer(() => client.deliver(msg));
  }

  /**
   * Closes the server. Unlike a TCP server, the open connections are closed as well.
   */
  close() {
    if (!this.listening) return;
    debug('Closing server...');
    this.listening = false;
    Object.keys(this.sockets).forEach((socketId) => {
      this.sockets[socketId].client.drop();
      this.detach(socketId);
    });
    defer(() => {
      debug('Server closed');
      this.emit('serverclose', this);
    });
  }

  getConnectionCount() {
    return Object.keys(this.sockets).length;
  }
}
