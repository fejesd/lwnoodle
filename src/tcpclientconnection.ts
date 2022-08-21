import { Socket } from 'net';
import { EventEmitter } from 'node:events';
import Debug from 'debug';
const debug = Debug('TcpClientConnection');

/**
 * TcpClientConnection will abstract a tcp/ip raw connection. The class will handle:
 *  - the automatic reconnection, error handling
 *  - buffering the outgoing data until the socket is drained
 *  - split the incoming data into frames (default frame delimiter: \n)
 *  - error handling
 *
 * @event   error
 * @event   connect
 * @event   close
 * @event   frame   Fires when a new complete frame has been arrived. Parameter is the frame.
 */
export class TcpClientConnection extends EventEmitter {
  host: string;
  port: number;
  connected: boolean; /* is connected? */
  connecting: boolean; /* connection in progress */
  private shutdown: boolean; /* shutdown in progress */
  private drained: boolean;
  private socket: Socket;
  private connection_retry_timeout: number;
  private inputbuffer: string;
  private outputbuffer: Array<string>;
  private frameLimiter: string;

  constructor(host: string, port: number) {
    super();
    this.host = host;
    this.port = port;
    this.connected = false;
    this.connecting = false;
    this.shutdown = false;
    this.drained = false;
    this.inputbuffer = '';
    this.outputbuffer = [];
    this.frameLimiter = '\n';
    this.connection_retry_timeout = 1000; // retry after 1 secs
    this.socket = new Socket();
    this.socket.setEncoding('utf8');
    this.socket.setKeepAlive(true, 6000); //keepalive to 10 seconds
    this.socket.setNoDelay(true);
    this.socket.on('error', this.socketError.bind(this));
    this.socket.on('connect', this.socketConnected.bind(this));
    this.socket.on('close', this.socketClosed.bind(this));
    this.socket.on('drain', this.socketDrained.bind(this));
    this.socket.on('data', this.socketData.bind(this));
    this.on('error', (e)=>{});  //prevent throwing "unhandled error event"
    debug('TcpClientConnection created');
    this.startConnect();
  }

  private socketError(e: Error) {      
    debug('TCP connection error:' + e.toString());
    if (this.connected) this.emit('error', e);
  }

  private socketClosed() {
    debug('TCP connection was closed');
    this.connected = false;
    this.outputbuffer = [];
    this.inputbuffer = '';
    if (!this.shutdown) setTimeout(this.startConnect.bind(this), this.connection_retry_timeout);
    this.emit('close');
  }

  private socketConnected() {
    debug(`TCP connection to ${this.host}:${this.port} established succesfully`);
    this.connecting = false;
    this.connected = true;
    this.drained = true;
    this.outputbuffer = [];
    this.emit('connect');
  }

  private socketDrained(): void {
    this.drained = true;
    debug('Output buffer empty');
    while (this.outputbuffer.length) {
      var msg: string = this.outputbuffer.shift() as string;
      debug(`> ${msg}`);
      if (!this.socket.write(msg)) {
        this.drained = false;
        debug('Output buffer full');
        return;
      }
    }
  }

  private socketData(data: string): void {
    this.inputbuffer += data.toString();
    var messages = this.inputbuffer.split(this.frameLimiter);
    for (var i = 0; i < messages.length - 1; i++) {
      debug(`< ${messages[i]}`);
      this.emit('frame', messages[i]);
    }
    this.inputbuffer = messages[messages.length - 1];
    if (this.inputbuffer.length > 1e6) {
      this.inputbuffer = '';
      this.emit(
        'error',
        new Error('Incoming buffer is full, no delimiter was received since 1MB of data. Data is dropped.'),
      );
    }
  }

  private startConnect(): void {
    if (this.connected) return;
    if (!this.shutdown) {
      this.connecting = true;
      debug('TcpClientConnection connect..');
      this.socket.connect(this.port, this.host);
    }
  }

  /**
   * Write a string to the socket. Please don't write small chunks, as Naggle algorithm is disabled. Write at least full lines / messages instead of charachters!
   * @param msg
   * @returns
   */
  write(msg: string): void {
    if (!this.connected) return;
    if (this.drained) {
      if (!this.socket.write(msg)) this.drained = false;
      debug(`> ${msg}`);
      if (!this.drained) debug('Output buffer full');
    } else {
      if (this.outputbuffer.length < 1024) this.outputbuffer.push(msg); // message delayed
      else this.emit('error', new Error('Outgoing buffer is stalled, message has been dropped'));
    }
  }

  /**
   * Sets the timeout for attempting re-connection after an error
   * @param timeout msec
   */
  setRetryTimeout(timeout: number) {
    this.connection_retry_timeout = timeout;
  }

  /**
   * Sets the frame delimiter string
   * @param delimiter Default: '\n'
   */
  setFrameDelimiter(delimiter: string) {
    this.frameLimiter = delimiter;
  }

  /**
   * Is socket connected?
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Close the socket
   */
  close() {
    this.shutdown = true;
    if (this.connected) this.socket.end();
  }

  /**
   * Reopen a closed socket
   */
  reopen() {
    if (this.shutdown) {
      this.shutdown = false;
      setImmediate(this.startConnect.bind(this));
    }
  }
}
