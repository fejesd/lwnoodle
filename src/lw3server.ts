import { NoodleServerObject } from './server';
import { TcpServerConnection } from './tcpserverconnection';
import { EventEmitter } from 'node:events';
import Debug from 'debug';
import * as _ from 'lodash';

const debug = Debug('Lw3Server');

export type Lw3ServerOptions = {
  name?: string;
  port?: number;
};

/**
 * represents a server session
 */
interface Lw3ServerSession {
  opened: string[];
  authenticated: boolean;
  socketId: number;
}

export interface Lw3Server {
  on(event: 'error', listener: (e: Error) => void): this;
  on(event: 'serverclose', listener: () => void): this;
  on(event: 'connect' | 'close', listener: (socketId: number) => void): this;
  on(event: 'socketerror', listener: (socketId: number, e: Error) => void): this;
}

export enum Lw3ErrorCodes {
  Lw3ErrorCodes_None = 0,
  Lw3ErrorCodes_Syntax = 1,
  Lw3ErrorCodes_NotFound = 2,
  Lw3ErrorCodes_AlreadyExists = 3,
  Lw3ErrorCodes_InvalidValue = 4,
  Lw3ErrorCodes_IllegalParamCount = 5,
  Lw3ErrorCodes_IllegalOperation = 6,
  Lw3ErrorCodes_AccessDenied = 7,
  Lw3ErrorCodes_Timeout = 8,
  Lw3ErrorCodes_CommandTooLong = 9,
  Lw3ErrorCodes_InternalError = 10,
  Lw3ErrorCodes_NotImplemented = 11,
  Lw3ErrorCodes_NodeDisabled = 12,
}

/**
 * Implements the LW3 Server at protocol level
 */
export class Lw3Server extends EventEmitter {
  /** root node */
  root: NoodleServerObject;
  /** session data */
  sessions: { [socketId: number]: Lw3ServerSession };
  server: TcpServerConnection;
  options: Lw3ServerOptions;

  static getErrorCodeString(errorcode: Lw3ErrorCodes): string {
    switch (errorcode) {
      case Lw3ErrorCodes.Lw3ErrorCodes_Syntax:
        return 'Syntax error';
      case Lw3ErrorCodes.Lw3ErrorCodes_NotFound:
        return 'Not exists';
      case Lw3ErrorCodes.Lw3ErrorCodes_AlreadyExists:
        return 'Already exists';
      case Lw3ErrorCodes.Lw3ErrorCodes_InvalidValue:
        return 'Invalid value';
      case Lw3ErrorCodes.Lw3ErrorCodes_IllegalParamCount:
        return 'Illegal parameter count';
      case Lw3ErrorCodes.Lw3ErrorCodes_IllegalOperation:
        return 'Illegal operation';
      case Lw3ErrorCodes.Lw3ErrorCodes_AccessDenied:
        return 'Access denied';
      case Lw3ErrorCodes.Lw3ErrorCodes_Timeout:
        return 'Timeout';
      case Lw3ErrorCodes.Lw3ErrorCodes_CommandTooLong:
        return 'Command too long';
      case Lw3ErrorCodes.Lw3ErrorCodes_InternalError:
        return 'Internal error';
      case Lw3ErrorCodes.Lw3ErrorCodes_NotImplemented:
        return 'Not implemented';
      case Lw3ErrorCodes.Lw3ErrorCodes_NodeDisabled:
        return 'Node disabled or standby mode active';
      default:
        return 'Unknown error';
    }
  }

  static getErrorHeader(errorcode: Lw3ErrorCodes): string {
    return '%E' + ('00' + (errorcode as number).toString()).substr(-3) + ':' + Lw3Server.getErrorCodeString(errorcode);
  }

  constructor(options: Lw3ServerOptions) {
    super();
    this.sessions = [];
    this.options = options;
    this.server = new TcpServerConnection(this.options.port || 6107);
    this.server.on('listening', () => {
      debug(`Server started`);
      this.emit('listening');
    });
    this.server.on('serverclose', () => {
      debug(`Server closed`);
      this.emit('serverclose');
    });
    this.server.on('error', (e: Error) => {
      debug(`Server error: ${e}`);
      this.emit('error', e);
    });
    this.server.on('connect', (socketId: number) => {
      this.sessions[socketId] = {
        opened: [],
        authenticated: false,
        socketId,
      };
      this.emit('connect', socketId);
      debug(`New connection id:${socketId}`);
    });
    this.server.on('close', (socketId: number) => {
      delete this.sessions[socketId];
      this.emit('close', socketId);
      debug(`Closed connection id:${socketId}`);
    });
    this.server.on('socketerror', (socketId: number, e: Error) => {
      debug(`Socket error: ${socketId}: ${e}`);
      this.emit('socketerror', socketId, e);
    });
    this.server.on('frame', this.lineRcv.bind(this));

    this.root = new NoodleServerObject(options.name || 'default', [], this);
  }

  private async lineRcv(socketId: number, msg: string) {
    let response: string = '';
    let signature: boolean;
    debug(msg);
    if (msg[4] === '#') {
      signature = true;
      response = '{' + msg.substring(0, 4) + '\n';
      msg = msg.substring(5);
    } else signature = false;

    response += '-E ' + msg + ' ' + Lw3Server.getErrorHeader(Lw3ErrorCodes.Lw3ErrorCodes_Syntax);

    if (signature) response += '\n}\n';
    else response += '\n';
    this.server.write(socketId, response);
  }

  close() {
    this.server.close();
    debug(`Server closed`);
  }
}
