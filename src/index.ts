import { Lw3Client } from './lw3client';
import { TcpClientConnection } from './tcpclientconnection';
import Debug from 'debug';
const debug = Debug('Noodle');

export type Noodle = {
  (): any;
  [name: string]: Noodle;
} & {
  [method: string]: (...args: any[]) => string;
} & {
  [property: string]: string;
} & {
  /** Close the connection to the server. */
  __close__(): void;
  /** Wait until every pending communication finishes. */
  __sync__(): Promise<void>;
  /** Will call the callback function when any property has changed under the node.
   * The optional condition might hold a property name or even a property value, eg. "SignalPresent" or "SignalPresent=true"
   * @returns {Promise<number>} the number can be used remove the callback later
   */
  addListener(callback: (path: string, property: string, value: string) => void, condition?: string): Promise<number>;

  /** It will remove the callback function (and also close the node if it is not needed to keep open) */
  closeListener(id: number): Promise<void>;

  /** Will call the callback function only once when a property has changed under the node.
   * The optional condition might hold a property name or even a property value, eg. "SignalPresent" or "SignalPresent=true"
   */
  once(callback: (path: string, property: string, value: string) => void, condition?: string): Promise<number>;

  /** Will resolve when a change has happened under the node.
   * The optional condition might hold a property name or even a property value, eg. "SignalPresent" or "SignalPresent=true"
   */
  waitFor(condition?: string): Promise<string>;

  /** parts of the path. It is not intended for external use */
  path: string[];
  /** the connection object. It is not intended for external use */
  lw3client: Lw3Client;
};

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
  clientname: string;
  /** Path for this object. (it is empty if it is on root) */
  path: string[];
  /** Lw3 client object reference */
  lw3client: Lw3Client;

  constructor(name: string, path: string[], lw3client: Lw3Client) {
    this.clientname = name;
    this.path = path;
    this.lw3client = lw3client;
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

const NoodleProxyHandler: ProxyHandler<Noodle> = {
  async apply(target: Noodle, ctx: string, args: any[]) {
    const last = target.path[target.path.length - 1];
    const path = '/' + target.path.slice(0, -1).join('/');
    if (last === 'addListener') {
      return target.lw3client.OPEN(path, (cbpath: string, cbproperty: string, cbvalue: string) => args[0](cbpath, cbproperty, cbvalue), args[1]);
    } else if (last === 'closeListener') {
      return target.lw3client.CLOSE(args[0]);
    } else if (last === 'once') {
      return target.lw3client.OPEN(path, (cbpath: string, cbproperty: string, cbvalue: string) => args[0](cbpath, cbproperty, cbvalue), args[1], 1);
    } else if (last === 'waitFor') {
      return new Promise<string>((resolve, reject) => {
        target.lw3client.OPEN(path, (cbpath: string, cbproperty: string, cbvalue: string) => resolve(cbvalue), args[0], 1);
      });
    } else {
      // method invocation
      return target.lw3client.CALL(path + ':' + last, args.join(','));
    }
  },

  get(target: Noodle, key: string): any {
    if (key === 'then') return undefined; // this is needed to use Noodle in Promises
    if (key in target) return target[key as keyof typeof target]; // make target fields accessible. Is this needed?
    if (key === '__close__')
      return () => {
        target.lw3client.close();
      };
    if (key === '__sync__') return target.lw3client.sync.bind(target.lw3client);
    const castedToProperty = key.indexOf('__prop__') !== -1;
    const isNode = key === key.toUpperCase() || key.indexOf('__node__') !== -1;
    const isMethod = key[0] === key[0].toLowerCase() || key.indexOf('__method__') !== -1;
    if ((isNode || isMethod) && !castedToProperty) {
      key = key.replace('__method__', '').replace('__node__', '');
      const node = new NoodleClientObject(target.name, target.path.slice().concat(key), target.lw3client);
      return new Proxy(obj2fun(node), NoodleProxyHandler);
    } else {
      key = key.replace('__prop__', '');
      const path = '/' + target.path.join('/');
      const value = target.lw3client.GET(path + '.' + key);
      return value;
    }
  },

  set(target: Noodle, key: string, value: string): boolean {
    key = key.replace('__prop__', '');
    // unfortunately ProxyHandler.set should return immediately with a boolean, there is no way to make it async
    // therefore we will catch the rejections from lw3client.SET here and drop them. __sync__() call should be used after set if error detection is important.
    (async () => {
      try {
        await target.lw3client.SET('/' + target.path.join('/') + '.' + key, value);
      } catch (e) {
        debug('SET command has been rejected');
      }
    })();
    return true;
  },
};

export const NoodleClient = (options: NoodleClientParameters | string = 'localhost'): Promise<Noodle> => {
  if (typeof options === 'string') {
    const opts: NoodleClientParameters = { host: options, port: 6107, waitresponses: false };
    options = opts;
  } else {
    options.host = options.host || 'localhost';
    options.port = options.port || 6107;
    options.waitresponses = options.waitresponses || false;
  }
  const clientObj: NoodleClientObject = new NoodleClientObject(
    options.name || 'default',
    [],
    new Lw3Client(new TcpClientConnection(options.host, options.port), options.waitresponses),
  );
  debug('Noodle client created');
  return new Promise((resolve, reject) => {
    clientObj.lw3client.connection.once('connect', () => {
      resolve(new Proxy(obj2fun(clientObj), NoodleProxyHandler) as Noodle);
      debug('Noodle promise resolved');
    });
  });
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

export const live = async (node: Noodle) => {
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
  liveObj.subscriptionId = await node.lw3client.OPEN('/' + node.path.join('/'), updater);
  await node.lw3client.FETCHALL('/' + node.path.join('/'), updater);
  return new Proxy(obj2fun(liveObj), LiveObjProxyHandler);
};
