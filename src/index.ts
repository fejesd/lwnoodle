import { Lw3Client } from './lw3client';
import { TcpClientConnection } from './tcpclientconnection';

interface NoodleClientParameters {
  /** Ip address or host. Default is 127.0.0.1 */
  host?: string;
  /** TCP port. Default is 6107 */
  port?: number;
  /** Optional name for this client */
  name?: string;
  /** Should we wait the responses, before send a new command. Default is false */
  waitresponses?: boolean;
}

interface NoodleClientObject {
  /** name for this client */
  name: string;
  /** Should we wait the responses, before send a new command */
  waitresponses: boolean;
  /** Path for this object. (it is empty if it is on root) */
  path: string;
  /** Lw3 client object reference */
  lw3client: Lw3Client;
}

export const NoodleClient = (options: NoodleClientParameters = {}) => {
  options.host = options.host || '127.0.0.1';
  options.port = options.port || 6107;
  options.waitresponses = options.waitresponses || false;
  const clientObj: NoodleClientObject = {
    name: options.name || 'default',
    waitresponses: options.waitresponses || false,
    path: '',
    lw3client: new Lw3Client(new TcpClientConnection(options.host, options.port), options.waitresponses),
  };
  return new Proxy(clientObj, {
    async apply(target: NoodleClientObject, ctx, args) {
      /* todo */
    },

    get(target: NoodleClientObject, key: string): any {
      if (key in target) return target[key as keyof typeof target]; // make target fields accessible. Is this needed?
    },

    set(target: NoodleClientObject, key: string, value: string): boolean {
      return true;
    },
  });
};
