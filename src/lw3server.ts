import { NoodleServerObject, NoodleServerProxyHandler } from './server';
import { TcpServerConnection } from './tcpserverconnection';
import { EventEmitter } from 'node:events';
import Debug from 'debug';
import * as _ from 'lodash';
import { Lw3ErrorCodes, Noodle, NoodleServer } from './noodle';
import { escape, unescape } from './escaping';

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

/**
 * Implements the LW3 Server at protocol level
 */
export class Lw3Server extends EventEmitter {
  /** root node */
  root: NoodleServer;
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

    this.root = new Proxy(new NoodleServerObject(options.name || 'default', [], this), NoodleServerProxyHandler) as unknown as NoodleServer;
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
    const firstSpace = msg.indexOf(' ');
    let command = '';
    let args = '';
    if (firstSpace !== -1) {
      command = msg.substring(0, firstSpace);
      args = msg.substring(firstSpace + 1);
    }
    do {
      if (command === 'GET') {
        /**
         *  GET command has three variant:
         *  GET /SOME/PATH   - get subnodes
         *  GET /SOME/PATH.* - get all props and methods
         *  GET /SOME/PATH.Prop - get a single prop
         */
        const dotPosition = args.indexOf('.');
        if (dotPosition === -1) {
          // GET /SOME/PATH   - get subnodes
          const node: NoodleServer | undefined = this.getNode(args) as NoodleServer;
          if (!node) response += '-E ' + msg + ' ' + Lw3Server.getErrorHeader(Lw3ErrorCodes.Lw3ErrorCodes_NotFound);
          const subnodes: string[] = node?.__nodes__();
          subnodes?.forEach((element) => {
            response += 'n- ' + args + '/' + element + '\n';
          });
        } else {
          const node: NoodleServer | undefined = this.getNode(args.substring(0, dotPosition)) as NoodleServer;
          const propName = args.substring(dotPosition + 1);
          if (!node) {
            response += '-E ' + msg + ' ' + Lw3Server.getErrorHeader(Lw3ErrorCodes.Lw3ErrorCodes_NotFound);
            break;
          }
          if (propName === '*') {
            // getting all property
            const props = node.__properties__();
            const nodename = args.substring(0, dotPosition);
            Object.keys(props).sort().forEach((propname) => {
              response += 'p' + (props[propname].rw ? 'w' : 'r') + ' ' + nodename + '.' + propname + '=' + escape(props[propname].value) + '\n';
            });
          } else {
            // getting single property
            const prop = node.__properties__(propName);
            response += 'p' + (prop.rw ? 'w' : 'r') + ' ' + args + '=' + escape(prop.value) + '\n';
          }
        }
        /* todo */
      } else if (command === 'SET') {
        /* todo */
      } else if (command === 'CALL') {
        /* todo */
      } else if (command === 'MAN') {
        /* todo */
      } else if (command === 'SET') {
        /* todo */
      } else if (command === 'OPEN') {
        /* todo */
      } else if (command === 'CLOSE') {
        /* todo */
      } else {
        response += '-E ' + msg + ' ' + Lw3Server.getErrorHeader(Lw3ErrorCodes.Lw3ErrorCodes_Syntax) + '\n';
      }
    } while (false);
    if (signature) response += '}\n';
    this.server.write(socketId, response);
  }

  close() {
    this.server.close();
    debug(`Server closed`);
  }

  private getNode(s: string): Noodle | undefined {
    const path = s.split('/');
    if (path[0]) return undefined;
    let node: any = this.root;
    for (let i = 1; i < path.length; i++) {
      if (!path[i]) return undefined;
      node = node[('$' + path[i]) as keyof NoodleServerObject];
      if (node === undefined) return undefined;
    }
    return node;
  }
}
