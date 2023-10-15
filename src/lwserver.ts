import { NoodleServerObject, NoodleServerProxyHandler } from './server';
import { TcpServerConnection } from './tcpserverconnection';
import { ServerConnection } from './serverconnection';
import { EventEmitter } from 'node:events';
import Debug from 'debug';
import * as _ from 'lodash';
import { LwErrorCodes as LwErrorCodes, LwError as LwError, Noodle, NoodleServer, Property } from './noodle';
import { escape, unescape } from './escaping';
import { convertValue } from './common';
import { WsServerConnection } from './wsserverconnection';

const debug = Debug('LwServer');

export type LwServerOptions = {
  name?: string;
  port?: number;
  host?: string;
  type?: 'tcp' | 'ws' | 'wss';
  auth?: (username: string, password: string) => boolean;
  key?: string | Buffer;
  cert?: string | Buffer;
};

/**
 * represents a server session
 */
interface LwServerSession {
  opened: { node: Noodle; path: string; subscriptionId: number }[];
  authenticated: boolean;
  socketId: string;
  server: ServerConnection;
}

export interface LwServer {
  on(event: 'error', listener: (e: Error) => void): this;
  on(event: 'serverclose', listener: () => void): this;
  on(event: 'connect' | 'close', listener: (socketId: number) => void): this;
  on(event: 'socketerror', listener: (socketId: number, e: Error) => void): this;
}

/**
 * Implements the LW Server at protocol level
 */
export class LwServer extends EventEmitter {
  /** root node */
  root: NoodleServer;
  /** session data */
  sessions: { [socketId: string]: LwServerSession };
  server: ServerConnection[];
  // list of server options
  options: LwServerOptions[];

  static getErrorHeader(errorcode: LwErrorCodes): string {
    return '%E' + ('00' + (errorcode as number).toString()).substr(-3) + ':' + LwError.getErrorCodeString(errorcode);
  }

  constructor(options: LwServerOptions | LwServerOptions[]) {
    super();
    this.sessions = {};
    if (!Array.isArray(options)) options = [options];
    this.options = options;
    this.server = [];
    this.options.forEach((option, idx) => {
      option.type = option.type || 'tcp';
      if (option.type === 'tcp') {
        this.server.push(new TcpServerConnection(option.port || 6107, option.host || 'localhost'));
      } else if (option.type === 'ws') {
        this.server.push(
          new WsServerConnection({
            port: option.port || 6107,
            host: option.host || 'localhost',
            secure: false,
            auth: option.auth,
          }),
        );
      } else if (option.type === 'wss') {
        this.server.push(
          new WsServerConnection({
            port: option.port || 6107,
            host: option.host || 'localhost',
            secure: true,
            key: option.key,
            cert: option.cert,
            auth: option.auth,
          }),
        );
      } else {
        throw new Error(`Unknown server type ${option.type}`);
      }
      this.server[idx].on('listening', (s: ServerConnection) => {
        debug(`${s.name()} Server started`);
        this.emit('listening');
      });
      this.server[idx].on('serverclose', (s: ServerConnection) => {
        debug(`${s.name()} Server closed`);
        this.emit('serverclose');
      });
      this.server[idx].on('error', (s: ServerConnection, e: Error) => {
        debug(`Server error: ${s.name()} ${e}`);
        this.emit('error', e);
      });
      this.server[idx].on('connect', (s: ServerConnection, socketId: string) => {
        this.sessions[socketId] = {
          opened: [],
          authenticated: false,
          socketId,
          server: s,
        };
        this.emit('connect', socketId);
        debug(`New connection id:${socketId}`);
      });
      this.server[idx].on('close', (s: ServerConnection, socketId: string) => {
        this.sessions[socketId].opened.forEach((entry) => {
          entry.node.closeListener(entry.subscriptionId);
        });
        delete this.sessions[socketId];
        this.emit('close', socketId);
        debug(`Closed connection server:${s.name()} id:${socketId}`);
      });
      this.server[idx].on('socketerror', (s: ServerConnection, socketId: string, e: Error) => {
        debug(`Socket error: ${s.name()} ${socketId}: ${e}`);
        this.emit('socketerror', socketId, e);
      });
      this.server[idx].on('frame', this.lineRcv.bind(this));
    });

    this.root = new Proxy(new NoodleServerObject(options[0].name || 'default', [], this), NoodleServerProxyHandler) as unknown as NoodleServer;
  }

  private async lineRcv(server: ServerConnection, socketId: string, msg: string) {
    debug(`Received frame from ${server.name()} socket ${socketId}: ${msg}`);
    let response: string = '';
    let signature: boolean;
    debug(msg);
    if (msg[4] === '#') {
      signature = true;
      response = '{' + msg.substring(0, 4) + '\r\n';
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
          response += '-E ' + msg + ' ' + LwServer.getErrorHeader(LwErrorCodes.LwErrorCodes_Syntax) + '\r\n';
          break;
        }
        const dotPosition = args.indexOf('.');
        if (dotPosition === -1) {
          // GET /SOME/PATH   - get subnodes
          const node: NoodleServer | undefined = this.getNode(args) as NoodleServer;
          if (!node) response += '-E ' + msg + ' ' + LwServer.getErrorHeader(LwErrorCodes.LwErrorCodes_NotFound) + '\r\n';
          const subnodes: string[] = node?.__nodes__();
          if (args === '/') args = '';
          subnodes?.forEach((element) => {
            response += 'n- ' + args + '/' + element + '\r\n';
          });
        } else {
          const node: NoodleServer | undefined = this.getNode(args.substring(0, dotPosition)) as NoodleServer;
          const propName = args.substring(dotPosition + 1);
          if (!node) {
            response += '-E ' + msg + ' ' + LwServer.getErrorHeader(LwErrorCodes.LwErrorCodes_NotFound) + '\r\n';
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
                response += 'p' + (props[propname].rw ? 'w' : 'r') + ' ' + nodename + '.' + propname + '=' + escape(props[propname].value) + '\r\n';
              });
            methods.forEach((name) => {
              response += 'm-' + ' ' + nodename + ':' + name + '\r\n';
            });
          } else {
            // getting single property
            const prop = node.__properties__(propName);
            if (prop === undefined) {
              response += '-E ' + msg + ' ' + LwServer.getErrorHeader(LwErrorCodes.LwErrorCodes_NotFound) + '\r\n';
              break;
            }
            response += 'p' + (prop.rw ? 'w' : 'r') + ' ' + args + '=' + escape(prop.value) + '\r\n';
          }
        }
      } else if (command === 'SET') {
        /**
         * SET command syntax:  SET /NODE/PATH.Property=value
         */
        const dotPosition = args.indexOf('.');
        const eqPosition = args.indexOf('=');
        if (dotPosition === -1 || eqPosition === -1) {
          response += '-E ' + msg + ' ' + LwServer.getErrorHeader(LwErrorCodes.LwErrorCodes_Syntax) + '\r\n';
          break;
        }
        const node: NoodleServer | undefined = this.getNode(args.substring(0, dotPosition)) as NoodleServer;
        const propName = args.substring(dotPosition + 1, eqPosition);
        const value = args.substring(eqPosition + 1);
        if (!node) {
          response += '-E ' + msg + ' ' + LwServer.getErrorHeader(LwErrorCodes.LwErrorCodes_NotFound) + '\r\n';
          break;
        }
        let property = node.__properties__(propName);
        if (property === undefined) {
          response += '-E ' + msg + ' ' + LwServer.getErrorHeader(LwErrorCodes.LwErrorCodes_NotFound) + '\r\n';
          break;
        }
        if (!(property as Property).rw) {
          response += '-E ' + msg + ' ' + LwServer.getErrorHeader(LwErrorCodes.LwErrorCodes_AccessDenied) + '\r\n';
          break;
        }
        (node as any)[propName + '__prop__'] = unescape(value);
        property = node.__properties__(propName);
        response += 'p' + (property.rw ? 'w' : 'r') + ' ' + args.substring(0, eqPosition) + '=' + escape(property.value) + '\r\n';
      } else if (command === 'CALL') {
        /**
         * CALL command syntax:  CALL /NODE/PATH:method(param1,param2,...)
         */
        const semicolonPosition = args.indexOf(':');
        const bracketPosition = args.indexOf('(');
        if (semicolonPosition === -1 || bracketPosition <= semicolonPosition || args[args.length - 1] !== ')') {
          response += '-E ' + msg + ' ' + LwServer.getErrorHeader(LwErrorCodes.LwErrorCodes_Syntax) + '\r\n';
          break;
        }
        const node: NoodleServer | undefined = this.getNode(args.substring(0, semicolonPosition)) as NoodleServer;
        if (!node) {
          response += '-E ' + msg + ' ' + LwServer.getErrorHeader(LwErrorCodes.LwErrorCodes_NotFound) + '\r\n';
          break;
        }
        const methodname = args.substring(semicolonPosition + 1, bracketPosition);
        const methodarguments = args
          .substring(bracketPosition + 1, args.length - 1)
          .split(',')
          .map((x) => convertValue(unescape(x)));
        if (node.__methods__().indexOf(methodname) === -1) {
          response += '-E ' + msg + ' ' + LwServer.getErrorHeader(LwErrorCodes.LwErrorCodes_NotFound) + '\r\n';
          break;
        }
        try {
          debug(methodarguments);
          const resp = await node[methodname + '__method__'](...methodarguments);
          if (!resp) response += 'mO ' + args.substring(0, bracketPosition) + '\r\n';
          else response += 'mO ' + args.substring(0, bracketPosition) + '=' + escape(resp.toString()) + '\r\n';
        } catch (e) {
          if ((e as LwError).lwError) {
            response += 'mE ' + args.substring(0, bracketPosition) + ' ' + LwServer.getErrorHeader((e as LwError).lwError) + '\r\n';
          } else {
            response +=
              'mE ' + args.substring(0, bracketPosition) + '=' + escape((e as Error).message) + ' ' + LwServer.getErrorHeader(LwErrorCodes.LwErrorCodes_InternalError) + '\r\n';
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
          response += '-E ' + msg + ' ' + LwServer.getErrorHeader(LwErrorCodes.LwErrorCodes_Syntax) + '\r\n';
          break;
        }
        const dotPosition = args.indexOf('.');
        if (dotPosition === -1) {
          const semicolonPosition = args.indexOf(':');
          if (semicolonPosition === -1) {
            response += '-E ' + msg + ' ' + LwServer.getErrorHeader(LwErrorCodes.LwErrorCodes_Syntax) + '\r\n';
            break;
          }
          // MAN /SOME/PATH:method - get a manual single method
          const node: NoodleServer | undefined = this.getNode(args.substring(0, semicolonPosition)) as NoodleServer;
          if (!node) {
            response += '-E ' + msg + ' ' + LwServer.getErrorHeader(LwErrorCodes.LwErrorCodes_NotFound) + '\r\n';
            break;
          }
          const methodName = args.substring(semicolonPosition + 1);
          // todo: non-existent method
          response += 'mm ' + args + ' ' + node[methodName + '__method__man__'] + '\r\n';
        } else {
          const node: NoodleServer | undefined = this.getNode(args.substring(0, dotPosition)) as NoodleServer;
          if (!node) {
            response += '-E ' + msg + ' ' + LwServer.getErrorHeader(LwErrorCodes.LwErrorCodes_NotFound) + '\r\n';
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
                response += 'pm ' + nodename + '.' + propname + ' ' + props[propname].manual + '\r\n';
              });
            methods.forEach((name) => {
              response += 'mm' + ' ' + nodename + ':' + name + ' ' + node[name + '__method__man__'] + '\r\n';
            });
          } else {
            // getting single property
            const prop = node.__properties__(propName);
            if (prop === undefined) {
              response += '-E ' + msg + ' ' + LwServer.getErrorHeader(LwErrorCodes.LwErrorCodes_NotFound) + '\r\n';
              break;
            }
            response += 'pm ' + args + ' ' + escape(prop.manual) + '\r\n';
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
            response += 'o- ' + element.path + '\r\n';
          });
        } else {
          // open a node
          if (args[0] !== '/') {
            response += '-E ' + msg + ' ' + LwServer.getErrorHeader(LwErrorCodes.LwErrorCodes_Syntax) + '\r\n';
            break;
          }
          const node: NoodleServer | undefined = this.getNode(args) as NoodleServer;
          if (node === undefined) {
            response += 'oE ' + args + ' ' + LwServer.getErrorHeader(LwErrorCodes.LwErrorCodes_NotFound) + '\r\n';
            break;
          }
          if (_.find(this.sessions[socketId].opened, { path: args })) {
            response += 'oE ' + args + ' ' + LwServer.getErrorHeader(LwErrorCodes.LwErrorCodes_AlreadyExists) + '\r\n';
            break;
          }
          const subscriptionId: number = await node.on((path: string, property: string, value: any) => {
            server.write(socketId, 'CHG ' + path + '.' + property + '=' + value + '\r\n');
          }, args);
          this.sessions[socketId].opened.push({ node, path: args, subscriptionId });
          response += 'o- ' + args + '\r\n';
        }
      } else if (command === 'CLOSE') {
        /**
         * CLOSE  /SOME/PATH
         */
        if (_.find(this.sessions[socketId].opened, { path: args })) {
          this.sessions[socketId].opened = this.sessions[socketId].opened.filter((v) => {
            if (v.path === args) v.node.removeListener(v.subscriptionId);
            return v.path !== args;
          });
          response += 'c- ' + args + '\r\n';
        } else {
          // not subscribed
          response += 'cE ' + args + ' ' + LwServer.getErrorHeader(LwErrorCodes.LwErrorCodes_NotFound) + '\r\n';
        }
      } else {
        // unknown command
        response += '-E ' + msg + ' ' + LwServer.getErrorHeader(LwErrorCodes.LwErrorCodes_Syntax) + '\r\n';
      }
    } while (false);
    if (signature) response += '}\r\n';
    server.write(socketId, response);
  }

  close() {
    this.server.forEach((server) => {
      debug(`${server.name()} Server closed`);
      server.close();
    });
  }

  private getNode(s: string): Noodle | undefined {
    const path = s.split('/');
    if (path[0]) return undefined;
    let node: any = this.root;
    if (path.length === 1) return undefined;
    if (path.length === 2 && path[1] === '') return node; // root
    for (let i = 1; i < path.length; i++) {
      if (!path[i]) return undefined;
      node = node[('$' + path[i]) as keyof NoodleServerObject];
      if (node === undefined) return undefined;
    }
    return node;
  }
}
