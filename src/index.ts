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

class NoodleClientObject {
  /** name for this client */
  name: string;
  /** Path for this object. (it is empty if it is on root) */
  path: string[];
  /** Lw3 client object reference */
  lw3client: Lw3Client;

  constructor(name: string, path: string[], lw3client: Lw3Client) {
    this.name = name;
    this.path = path;
    this.lw3client = lw3client;
  }
}

const NoodleProxyHandler: ProxyHandler<NoodleClientObject> = {
  async apply(target: NoodleClientObject, ctx: string, args: any[]) {
    const last = target.path[target.path.length - 1];
    const path = '/' + target.path.slice(0, -1).join('/');
    if (last === 'addListener') {
      target.lw3client.OPEN(path, args[0], args[1], (cbpath: string, cbproperty: string, cbvalue: string) =>
        args[2](cbpath, cbproperty, cbvalue),
      );
    } else if (last === 'once') {
      target.lw3client.OPEN(path, args[0], args[1], (cbpath: string, cbproperty: string, cbvalue: string) => {
        // target.lw3client.removeListener(this);  // TODO
        args[2](cbpath, cbproperty, cbvalue);
      });
    } else if (last === 'waitFor') {
      return new Promise<string>((resolve, reject) => {
        target.lw3client.OPEN(path, args[0], args[1], (cbpath: string, cbproperty: string, cbvalue: string) => {
          // target.lw3client.removeListener(this); // TODO
          resolve(cbvalue);
        });
      });
    } else {
      // method invocation
      return target.lw3client.CALL(path + ':' + last, args.join(','));
    }
  },

  get(target: NoodleClientObject, key: string): any {
    if (key in target) return target[key as keyof typeof target]; // make target fields accessible. Is this needed?
    if (key === '__close__')
      return () => {
        target.lw3client.close();
      };
    const castedToProperty = key.indexOf('__prop__') !== -1;
    const isNode = key === key.toUpperCase() || key.indexOf('__node__') !== -1;
    const isMethod = key[0] === key[0].toLowerCase() || key.indexOf('__method__') !== -1;
    if ((isNode || isMethod) && !castedToProperty) {
      key = key.replace('__method__', '').replace('__node__', '');
      const node = new NoodleClientObject(target.name, target.path.slice().concat(key), target.lw3client);
      return new Proxy(node, NoodleProxyHandler);
    } else {
      key = key.replace('__prop__', '');
      const path = '/' + target.path.join('/');
      return target.lw3client.GET(path + '.' + key);
    }
  },

  set(target: NoodleClientObject, key: string, value: string): boolean {
    key = key.replace('__prop__', '');
    target.lw3client.SET('/' + target.path.join('/') + '.' + key, value);
    return true; // unfortunately ProxyHandler.set should return immediately with a boolean, there is no way to make it async..
  },
};

export const Noodle = (options: NoodleClientParameters = {}): any => {
  options.host = options.host || 'localhost';
  options.port = options.port || 6107;
  options.waitresponses = options.waitresponses || false;
  const clientObj: NoodleClientObject = new NoodleClientObject(
    options.name || 'default',
    [],
    new Lw3Client(new TcpClientConnection(options.host, options.port), options.waitresponses),
  );
  return new Proxy(clientObj, NoodleProxyHandler);
};
