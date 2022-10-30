import { NoodleServerObject, NoodleServerProxyHandler } from './server';
import { TcpServerConnection } from './tcpserverconnection';
import { EventEmitter } from 'node:events';
import Debug from 'debug';
import * as _ from 'lodash';
import { Lw3ErrorCodes, Lw3Error, Noodle, NoodleServer, Property } from './noodle';
import { escape, unescape } from './escaping';
import { convertValue } from './common';

const debug = Debug('Lw3Server');

export type Lw3ServerOptions = {
  name?: string;
  port?: number;
};

/**
 * represents a server session
 */
interface Lw3ServerSession {
  opened: { node: Noodle; path: string; subscriptionId: number }[];
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

  static getErrorHeader(errorcode: Lw3ErrorCodes): string {
    return '%E' + ('00' + (errorcode as number).toString()).substr(-3) + ':' + Lw3Error.getErrorCodeString(errorcode);
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
      this.sessions[socketId].opened.forEach((entry) => {
        entry.node.closeListener(entry.subscriptionId);
      });
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
    } else command = msg;
    do {
      if (command === 'GET') {
        /**
         *  GET command has three variant:
         *  GET /SOME/PATH   - get subnodes
         *  GET /SOME/PATH.* - get all props and methods
         *  GET /SOME/PATH.Prop - get a single prop
         */
        if (args[0] !== '/') {
          response += '-E ' + msg + ' ' + Lw3Server.getErrorHeader(Lw3ErrorCodes.Lw3ErrorCodes_Syntax) + '\n';
          break;
        }
        const dotPosition = args.indexOf('.');
        if (dotPosition === -1) {
          // GET /SOME/PATH   - get subnodes
          const node: NoodleServer | undefined = this.getNode(args) as NoodleServer;
          if (!node) response += '-E ' + msg + ' ' + Lw3Server.getErrorHeader(Lw3ErrorCodes.Lw3ErrorCodes_NotFound) + '\n';
          const subnodes: string[] = node?.__nodes__();
          subnodes?.forEach((element) => {
            response += 'n- ' + args + '/' + element + '\n';
          });
        } else {
          const node: NoodleServer | undefined = this.getNode(args.substring(0, dotPosition)) as NoodleServer;
          const propName = args.substring(dotPosition + 1);
          if (!node) {
            response += '-E ' + msg + ' ' + Lw3Server.getErrorHeader(Lw3ErrorCodes.Lw3ErrorCodes_NotFound) + '\n';
            break;
          }
          if (propName === '*') {
            // getting all property and methods
            const props = node.__properties__();
            const methods = node.__methods__();
            const nodename = args.substring(0, dotPosition);
            Object.keys(props)
              .sort()
              .forEach((propname) => {
                response += 'p' + (props[propname].rw ? 'w' : 'r') + ' ' + nodename + '.' + propname + '=' + escape(props[propname].value) + '\n';
              });
            methods.forEach((name) => {
              response += 'm-' + ' ' + nodename + ':' + name + '\n';
            });
          } else {
            // getting single property
            const prop = node.__properties__(propName);
            if (prop === undefined) {
              response += '-E ' + msg + ' ' + Lw3Server.getErrorHeader(Lw3ErrorCodes.Lw3ErrorCodes_NotFound) + '\n';
              break;
            }
            response += 'p' + (prop.rw ? 'w' : 'r') + ' ' + args + '=' + escape(prop.value) + '\n';
          }
        }
      } else if (command === 'SET') {
        /**
         * SET command syntax:  SET /NODE/PATH.Property=value
         */
        const dotPosition = args.indexOf('.');
        const eqPosition = args.indexOf('=');
        if (dotPosition === -1 || eqPosition === -1) {
          response += '-E ' + msg + ' ' + Lw3Server.getErrorHeader(Lw3ErrorCodes.Lw3ErrorCodes_Syntax) + '\n';
          break;
        }
        const node: NoodleServer | undefined = this.getNode(args.substring(0, dotPosition)) as NoodleServer;
        const propName = args.substring(dotPosition + 1, eqPosition);
        const value = args.substring(eqPosition + 1);
        if (!node) {
          response += '-E ' + msg + ' ' + Lw3Server.getErrorHeader(Lw3ErrorCodes.Lw3ErrorCodes_NotFound) + '\n';
          break;
        }
        let property = node.__properties__(propName);
        if (property === undefined) {
          response += '-E ' + msg + ' ' + Lw3Server.getErrorHeader(Lw3ErrorCodes.Lw3ErrorCodes_NotFound) + '\n';
          break;
        }
        if (!(property as Property).rw) {
          response += '-E ' + msg + ' ' + Lw3Server.getErrorHeader(Lw3ErrorCodes.Lw3ErrorCodes_AccessDenied) + '\n';
          break;
        }
        (node as any)[propName + '__prop__'] = unescape(value);
        property = node.__properties__(propName);
        response += 'p' + (property.rw ? 'w' : 'r') + ' ' + args.substring(0, eqPosition) + '=' + escape(property.value) + '\n';
      } else if (command === 'CALL') {
        /**
         * CALL command syntax:  CALL /NODE/PATH:method(param1,param2,...)
         */
        const semicolonPosition = args.indexOf(':');
        const bracketPosition = args.indexOf('(');
        if (semicolonPosition === -1 || bracketPosition <= semicolonPosition || args[args.length - 1] !== ')') {
          response += '-E ' + msg + ' ' + Lw3Server.getErrorHeader(Lw3ErrorCodes.Lw3ErrorCodes_Syntax) + '\n';
          break;
        }
        const node: NoodleServer | undefined = this.getNode(args.substring(0, semicolonPosition)) as NoodleServer;
        if (!node) {
          response += '-E ' + msg + ' ' + Lw3Server.getErrorHeader(Lw3ErrorCodes.Lw3ErrorCodes_NotFound) + '\n';
          break;
        }
        const methodname = args.substring(semicolonPosition + 1, bracketPosition);
        const methodarguments = args
          .substring(bracketPosition + 1, args.length - 1)
          .split(',')
          .map((x) => convertValue(unescape(x)));
        if (node.__methods__().indexOf(methodname) === -1) {
          response += '-E ' + msg + ' ' + Lw3Server.getErrorHeader(Lw3ErrorCodes.Lw3ErrorCodes_NotFound) + '\n';
          break;
        }
        try {
          debug(methodarguments);
          const resp = await node[methodname + '__method__'](...methodarguments);
          if (!resp) response += 'mO ' + args.substring(0, bracketPosition) + '\n';
          else response += 'mO ' + args.substring(0, bracketPosition) + '=' + escape(resp.toString()) + '\n';
        } catch (e) {
          if ((e as Lw3Error).lw3Error) {
            response += 'mE ' + args.substring(0, bracketPosition) + ' ' + Lw3Server.getErrorHeader((e as Lw3Error).lw3Error) + '\n';
          } else {
            response +=
              'mE ' + args.substring(0, bracketPosition) + '=' + escape((e as Error).message) + ' ' + Lw3Server.getErrorHeader(Lw3ErrorCodes.Lw3ErrorCodes_InternalError) + '\n';
          }
        }
      } else if (command === 'MAN') {
        /**
         *  MAN command has three variant:
         *  MAN /SOME/PATH.* - get manual of all props and methods
         *  MAN /SOME/PATH.Prop - get a manual single prop
         *  MAN /SOME/PATH:method - get a manual single method
         */

        if (args[0] !== '/') {
          response += '-E ' + msg + ' ' + Lw3Server.getErrorHeader(Lw3ErrorCodes.Lw3ErrorCodes_Syntax) + '\n';
          break;
        }
        const dotPosition = args.indexOf('.');
        if (dotPosition === -1) {
          const semicolonPosition = args.indexOf(':');
          if (semicolonPosition === -1) {
            response += '-E ' + msg + ' ' + Lw3Server.getErrorHeader(Lw3ErrorCodes.Lw3ErrorCodes_Syntax) + '\n';
            break;
          }
          // MAN /SOME/PATH:method - get a manual single method
          const node: NoodleServer | undefined = this.getNode(args.substring(0, semicolonPosition)) as NoodleServer;
          if (!node) {
            response += '-E ' + msg + ' ' + Lw3Server.getErrorHeader(Lw3ErrorCodes.Lw3ErrorCodes_NotFound) + '\n';
            break;
          }
          const methodName = args.substring(semicolonPosition + 1);
          // todo: non-existent method
          response += 'mm ' + args + '=' + node[methodName + '__method__man__'] + '\n';
        } else {
          const node: NoodleServer | undefined = this.getNode(args.substring(0, dotPosition)) as NoodleServer;
          if (!node) {
            response += '-E ' + msg + ' ' + Lw3Server.getErrorHeader(Lw3ErrorCodes.Lw3ErrorCodes_NotFound) + '\n';
            break;
          }
          const propName = args.substring(dotPosition + 1);
          if (propName === '*') {
            // getting all property and methods
            const props = node.__properties__();
            const methods = node.__methods__();
            const nodename = args.substring(0, dotPosition);
            Object.keys(props)
              .sort()
              .forEach((propname) => {
                response += 'pm ' + nodename + '.' + propname + '=' + props[propname].manual + '\n';
              });
            methods.forEach((name) => {
              response += 'mm' + ' ' + nodename + ':' + name + '=' + node[name + '__method__man__'] + '\n';
            });
          } else {
            // getting single property
            const prop = node.__properties__(propName);
            if (prop === undefined) {
              response += '-E ' + msg + ' ' + Lw3Server.getErrorHeader(Lw3ErrorCodes.Lw3ErrorCodes_NotFound) + '\n';
              break;
            }
            response += 'pm ' + args + '=' + escape(prop.manual) + '\n';
          }
        }
      } else if (command === 'OPEN') {
        /* OPEN command has two variant:
           OPEN /SOME/PATH  - open the node
           OPEN   - will list the opened nodes
        */
        if (args === '') {
          // list opened nodes
          this.sessions[socketId].opened.forEach((element) => {
            response += 'o- ' + element.path + '\n';
          });
        } else {
          // open a node
          if (args[0] !== '/') {
            response += '-E ' + msg + ' ' + Lw3Server.getErrorHeader(Lw3ErrorCodes.Lw3ErrorCodes_Syntax) + '\n';
            break;
          }
          const node: NoodleServer | undefined = this.getNode(args) as NoodleServer;
          if (node === undefined) {
            response += 'oE ' + args + ' ' + Lw3Server.getErrorHeader(Lw3ErrorCodes.Lw3ErrorCodes_NotFound) + '\n';
            break;
          }
          if (_.find(this.sessions[socketId].opened, { path: args })) {
            response += 'oE ' + args + ' ' + Lw3Server.getErrorHeader(Lw3ErrorCodes.Lw3ErrorCodes_AlreadyExists) + '\n';
            break;
          }
          const subscriptionId: number = node.addListener((path: string, property: string, value: any) => {
            this.server.write(socketId, 'CHG ' + path + '.' + property + '=' + value + '\n');
          });
          this.sessions[socketId].opened.push({ node, path: args, subscriptionId });
          response += 'o- ' + args + '\n';
        }
      } else if (command === 'CLOSE') {
        /**
         * CLOSE  /SOME/PATH
         */
        if (_.find(this.sessions[socketId].opened, { path: args })) {
          this.sessions[socketId].opened = this.sessions[socketId].opened.filter((v) => {
            if (v.path === args) v.node.closeListener(v.subscriptionId);
            return v.path !== args;
          });
          response += 'c- ' + args + '\n';
        } else {
          // not subscribed
          response += 'cE ' + args + ' ' + Lw3Server.getErrorHeader(Lw3ErrorCodes.Lw3ErrorCodes_NotFound) + '\n';
        }
      } else {
        // unknown command
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
