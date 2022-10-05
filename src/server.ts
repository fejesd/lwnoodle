import { Noodle, NoodleServer } from './noodle';
import { Lw3Server, Lw3ServerOptions, Lw3ErrorCodes } from './lw3server';
import { convertValue, obj2fun } from './common';
import Debug from 'debug';
import { findLastKey } from 'lodash';
const debug = Debug('NoodleServer');

export interface Property {
  value: string;
  manual: string;
  rw: boolean;
  setter?: (value: string) => Lw3ErrorCodes /* setter function will be called if available instead of setting value directly */;
  getter?: () => string /* getter function will override the value string */;
}

export interface Method {
  manual: string;
  fun?: (args: any[]) => string;
}

export class NoodleServerObject {
  /** name for this client */
  declare clientname: string;
  /** Path for this object. (it is empty if it is on root) */
  declare path: string[];
  /** Lw3 client object reference */
  declare lw3server?: Lw3Server;
  /** Container for properties */
  declare properties: { [name: string]: Property };
  /** Container for methods */
  declare methods: { [name: string]: Method };
  /** Container for child nodes */
  declare nodes: { [name: string]: Noodle };

  constructor(name: string = 'default', path: string[] = [], lw3server?: Lw3Server) {
    Object.defineProperty(this, 'clientname', { enumerable: false, configurable: true, value: name });
    Object.defineProperty(this, 'path', { enumerable: false, configurable: true, value: path });
    Object.defineProperty(this, 'lw3server', { enumerable: false, configurable: true, value: lw3server });
    Object.defineProperty(this, 'properties', { enumerable: false, configurable: true, writable: true, value: {} });
    Object.defineProperty(this, 'nodes', { enumerable: false, configurable: true, value: {} });
    Object.defineProperty(this, 'methods', { enumerable: false, configurable: true, value: {} });
    this.properties = {};
  }
}

export const NoodleServerProxyHandler: ProxyHandler<NoodleServerObject> = {
  get(t: NoodleServerObject, key: string): any {
    let $ = false;
    if (key[0] === '$') {
      $ = true;
      key = key.substring(1);
    }
    const mainkey = key.split('__')[0];
    if (mainkey in t.properties) {
      const property = t.properties[mainkey];
      if (property.getter) return property.getter.bind(property)();
      else return convertValue(property.value);
    }
    if (mainkey in t.nodes) return new Proxy(t.nodes[key] as unknown as NoodleServerObject, NoodleServerProxyHandler);

    if (mainkey in t.methods)
      return (
        t.methods[mainkey].fun ||
        ((...args: string[]) => {
          /* */
        })
      );

    // todo: methods

    if ($) return undefined; // keys marked with $ sign are not auto-created
    // a new object shall be created
    const castedToProperty = key.indexOf('__prop__') !== -1;
    const isNode = key === key.toUpperCase() || key.indexOf('__node__') !== -1;
    const isMethod = key[0] === key[0].toLowerCase() || key.indexOf('__method__') !== -1;
    if ((isNode || isMethod) && !castedToProperty) {
      // request a non existing node/method. Creating it.
      if (isMethod) {
        // request a non existing method.
        t.methods[mainkey] = { manual: '' };
        return (...args: string[]) => {
          /* */
        }; // return with an empty callable function
      }
      debug(`Create ${mainkey} node in ${t.path.at(-1)}`);
      const node = (t.nodes[mainkey] = new NoodleServerObject(t.clientname, t.path.slice().concat(key), t.lw3server) as any);
      return new Proxy(node, NoodleServerProxyHandler);
    } else {
      // request a non-existing property. Creating it with empty string as default
      const prop = (t.properties[mainkey] = { value: '', manual: '', rw: true });
      return '';
    }
  },

  set(t: NoodleServerObject, key: string, value: string | object): boolean {
    let $ = false;
    if (key[0] === '$') {
      $ = true;
      key = key.substring(1);
    }
    if (key in t.properties) {
      // update an existing property value
      if (typeof value === 'object') {
        // update to a new Property object
        if ('value' in value) t.properties[key].value = value['value' as keyof object]; // todo: type checks?
        if ('manual' in value) t.properties[key].manual = value['manual' as keyof object];
        if ('rw' in value) t.properties[key].rw = value['rw' as keyof object];
        if ('setter' in value) t.properties[key].setter = value['setter' as keyof object];
        if ('getter' in value) t.properties[key].getter = value['getter' as keyof object];
      } else {
        // update with a primitive type
        if (t.properties[key].setter) t.properties[key].setter?.bind(t.properties[key])(value);
        else t.properties[key].value = value.toString();
      }
      return true;
    } else if (key in t.nodes) {
      if (typeof value !== 'object') return false;
      t.nodes[key] = value as Noodle; // todo: type check somehow? Is the passed object really a noodle?
      return true;
    } else if (key in t.methods) {
      if (typeof value === 'object') {
        // update to a new Method object
        if ('manual' in value) t.methods[key].manual = value['manual' as keyof object]; // todo: type checks?
        if ('fun' in value) t.methods[key].fun = value['fun' as keyof object];
      } else if (typeof value === 'function') {
        // update with a function type
        t.methods[key].fun = value;
      } else return false;
    }
    if ($) return false;
    const castedToProperty = key.indexOf('__prop__') !== -1;
    const isNode = key === key.toUpperCase() || key.indexOf('__node__') !== -1;
    const isMethod = key[0] === key[0].toLowerCase() || key.indexOf('__method__') !== -1;
    // create new object on the fly
    if (isNode && !castedToProperty) {
      // node
      key = key.replace('__node__', '');
      t.nodes[key] = new NoodleServerObject(t.clientname, t.path.slice().concat(key), t.lw3server) as any;
    } else if (isMethod && !castedToProperty) {
      // method
      key = key.replace('__method__', '');
      t.methods[key] = { manual: '' };
      if (typeof value === 'object') {
        // update to a new Method object
        debug(`Create a new method from object ${key}`);
        if ('manual' in value) t.methods[key].manual = value['manual' as keyof object]; // todo: type checks?
        if ('fun' in value) t.methods[key].fun = value['fun' as keyof object];
      } else if (typeof value === 'function') {
        // update with a function type
        debug(`Create a new method from function ${key}`);
        t.methods[key].fun = value;
      } else {
        debug(`Create a new method failed: ${key}`);
        return false;
      }
    } else {
      // property
      key = key.replace('__prop__', '');
      t.properties[key] = { value: '', manual: '', rw: true };
      if (typeof value === 'object') {
        debug('Create new property from object');
        if ('value' in value) t.properties[key].value = value['value' as keyof object]; // todo: type checks?
        if ('manual' in value) t.properties[key].manual = value['manual' as keyof object];
        if ('rw' in value) t.properties[key].rw = value['rw' as keyof object];
        if ('setter' in value) t.properties[key].setter = value['setter' as keyof object];
        if ('getter' in value) t.properties[key].getter = value['getter' as keyof object];
      } else {
        debug(`Create ${key} property from data in ${t.path.at(-1)}`);
        t.properties[key].value = value.toString();
      }
    }
    return true;
  },

  deleteProperty(t: NoodleServerObject, key: string): boolean {
    if (key in t.nodes) {
      delete t.nodes[key];
      debug(`node ${key} deleted`);
      return true;
    } else if (key in t.properties) {
      delete t.properties[key];
      debug(`property ${key} deleted`);
      return true;
    } else if (key in t.methods) {
      delete t.methods[key];
      debug(`method ${key} deleted`);
      return true;
    } else return false;
  },

  ownKeys(t: NoodleServerObject) {
    return [...Object.keys(t.nodes).sort(), ...Object.keys(t.properties).sort(), ...Object.keys(t.methods).sort()];
  },

  getOwnPropertyDescriptor(target: NoodleServerObject) {
    return {
      enumerable: true,
      configurable: true,
    };
  },
};

export const noodleServer = (options: number | Lw3ServerOptions = 6107): NoodleServer => {
  let opts: Lw3ServerOptions = {};
  if (typeof options === 'number') {
    opts = {
      port: options,
      name: 'default',
    };
  } else {
    opts.port = options.port || 6107;
    opts.name = options.name || 'default';
  }

  const server = new Lw3Server(opts);
  const clientObj = server.root;

  debug('Noodle server created');
  return new Proxy(clientObj, NoodleServerProxyHandler) as unknown as NoodleServer;
};
