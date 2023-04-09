import { Noodle, NoodleClient } from './noodle';
import { LwClient } from './lwclient';
import { TcpClientConnection } from './tcpclientconnection';
import Debug from 'debug';
import { ClientConnection } from './clientconnection';
import { WsClientConnection } from './wsclientconnection';
const debug = Debug('NoodleClient');

interface NoodleClientParameters {
  /** Ip address or host. Default is 127.0.0.1 */
  host?: string;
  /** TCP port. Default is 6107 */
  port?: number;
  /** Connection type */
  type: 'tcp' | 'ws' | 'wss';
  /** Should we reject unauthorized certificates. Default is false */
  rejectUnauthorized?: boolean;
  /** Username for authentication. No need to specify with connections without authorization */
  username?: string;
  /** Password for authentication */
  password?: string;
  /** Connection retry timeout in milliseconds. Default is 1000 */
  connectionRetryTimeout?: number;
  /** Optional name for this client */
  name?: string;
  /** Should we wait the responses, before send a new command. Default is false */
  waitresponses?: boolean;
}

class NoodleClientObject {
  /** name for this client */
  clientname: string;
  /** Path for this object. (it is empty if it is on root) */
  path: string[];
  /** Lw client object reference */
  lwclient: LwClient;

  constructor(name: string, path: string[], lwclient: LwClient) {
    this.clientname = name;
    this.path = path;
    this.lwclient = lwclient;
  }
}

function obj2fun(object: object): () => void {
  // Converts the given dictionary into a function, thus we can create apply proxy around it
  // you can use apply() on functions, that's why we should convert dictionaries to functions
  const func = () => {
    /* */
  };
  for (const prop in object) {
    if (object.hasOwnProperty(prop)) {
      func[prop as keyof typeof func] = object[prop as keyof object];
    }
  }
  return func;
}

const NoodleClientProxyHandler: ProxyHandler<NoodleClient> = {
  async apply(target: NoodleClient, ctx: string, args: any[]) {
    const last = target.path[target.path.length - 1];
    const path = '/' + target.path.slice(0, -1).join('/');
    switch (last) {
      case 'on':
        if (typeof args[0] === 'function') return target.lwclient.OPEN(path, (cbpath: string, cbproperty: string, cbvalue: string) => args[0](cbpath, cbproperty, cbvalue), '*');
        else return target.lwclient.OPEN(path, (cbpath: string, cbproperty: string, cbvalue: string) => args[1](cbpath, cbproperty, cbvalue), args[0]);
      case 'once':
        if (typeof args[0] === 'function') return target.lwclient.OPEN(path, (cbpath: string, cbproperty: string, cbvalue: string) => args[0](cbpath, cbproperty, cbvalue), '*', 1);
        else return target.lwclient.OPEN(path, (cbpath: string, cbproperty: string, cbvalue: string) => args[1](cbpath, cbproperty, cbvalue), args[0], 1);
      case 'removeListener':
        return target.lwclient.CLOSE(args[0]);
      case 'waitFor':
        return new Promise<string>((resolve, reject) => {
          target.lwclient.OPEN(path, (cbpath: string, cbproperty: string, cbvalue: string) => resolve(cbvalue), args[0], 1);
        });
      default:
        return target.lwclient.CALL(path + ':' + last, args.join(','));
    }
  },

  get(target: NoodleClient, key: string): any {
    if (key === 'then') return undefined; // this is needed to use Noodle in Promises
    if (key in target) return target[key as keyof typeof target]; // make target fields accessible. Is this needed?
    if (key === '__close__') {
      return () => {
        target.lwclient.close();
      };
    } else if (key === '__sync__') {
      return target.lwclient.sync.bind(target.lwclient);
    } else if (key === '__connect__') {
      return (): Promise<void> => {
        return new Promise((resolve, reject) => {
          if (target.lwclient.connection.isConnected()) resolve();
          else target.lwclient.connection.once('connect', () => resolve());
        });
      };
    }
    const castedToProperty = key.indexOf('__prop__') !== -1;
    const isNode = key === key.toUpperCase() || key.indexOf('__node__') !== -1;
    const isMethod = key[0] === key[0].toLowerCase() || key.indexOf('__method__') !== -1;
    if ((isNode || isMethod) && !castedToProperty) {
      key = key.replace('__method__', '').replace('__node__', '');
      const node = new NoodleClientObject(target.name, target.path.slice().concat(key), target.lwclient);
      return new Proxy(obj2fun(node), NoodleClientProxyHandler);
    } else {
      key = key.replace('__prop__', '');
      const path = '/' + target.path.join('/');
      const value = target.lwclient.GET(path + '.' + key);
      return value;
    }
  },

  set(target: NoodleClient, key: string, value: string): boolean {
    key = key.replace('__prop__', '');
    // unfortunately ProxyHandler.set should return immediately with a boolean, there is no way to make it async
    // therefore we will catch the rejections from lwclient.SET here and drop them. __sync__() call should be used after set if error detection is important.
    (async () => {
      try {
        await target.lwclient.SET('/' + target.path.join('/') + '.' + key, value);
      } catch (e) {
        debug('SET command has been rejected');
      }
    })();
    return true;
  },
};

export const noodleClient = (options: NoodleClientParameters | string = 'localhost'): NoodleClient => {
  if (typeof options === 'string') {
    const opts: NoodleClientParameters = { host: options, port: 6107, waitresponses: false, type: 'tcp', name: 'default' };
    options = opts;
  } else {
    options.host = options.host || 'localhost';
    options.port = options.port || 6107;
    options.waitresponses = options.waitresponses || false;
    options.type = options.type || 'tcp';
    options.name = options.name || 'default';
  }
  let client: ClientConnection;
  if (options.type === 'tcp') {
    debug('Creating TCP client');
    client = new TcpClientConnection(options.host, options.port);
  } else if (options.type === 'ws') {
    debug('Creating WS client');
    client = new WsClientConnection({
      host: options.host,
      port: options.port,
      secure: false,
      connectionRetryTimeout: options.connectionRetryTimeout || 1000,
      username: options.username,
      password: options.password,
    });
  } else if (options.type === 'wss') {
    debug('Creating WSS client');
    client = new WsClientConnection({
      host: options.host,
      port: options.port,
      secure: true,
      connectionRetryTimeout: options.connectionRetryTimeout || 1000,
      username: options.username,
      password: options.password,
      rejectUnauthorized: options.rejectUnauthorized || false,
    });
  } else {
    throw new Error('Unknown client type: ' + options.type + '. Supported types are: tcp, ws, wss.');
  }
  const clientObj: NoodleClientObject = new NoodleClientObject(options.name || 'default', [], new LwClient(client, options.waitresponses));
  debug('Noodle client created');
  return new Proxy(obj2fun(clientObj), NoodleClientProxyHandler) as NoodleClient;
};

interface LiveObject {
  (): any;
  node: Noodle;
  subscriptionId: number;
  cache: { [path: string]: string };
}

const LiveObjProxyHandler: ProxyHandler<LiveObject> = {
  get(target: LiveObject, key: string): any {
    return target.cache[key];
  },

  set(target: LiveObject, key: string, value: string): boolean {
    (target.node as any)[key] = value;
    return true;
  },
};

export const live = async (node: NoodleClient) => {
  const liveObj: LiveObject = Object.assign(
    () => {
      /* */
    },
    {
      node,
      cache: {},
      subscriptionId: 0,
    },
  );
  const updater = ((obj: LiveObject): ((path: string, property: string, value: string) => void) => {
    return (path: string, property: string, value: string): void => {
      obj.cache[property] = value;
    };
  })(liveObj);
  liveObj.subscriptionId = await node.lwclient.OPEN('/' + node.path.join('/'), updater);
  await node.lwclient.FETCHALL('/' + node.path.join('/'), updater);
  return new Proxy(obj2fun(liveObj), LiveObjProxyHandler);
};
