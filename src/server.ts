import { ListenerCallback, Method, Noodle, NoodleServer, Property } from './noodle';
import { Lw3Server, Lw3ServerOptions } from './lw3server';
import { convertValue, obj2fun } from './common';
import Debug from 'debug';
import * as _ from 'lodash';
const debug = Debug('NoodleServer');

/**
 * Storing subscriptions.
 * TODO: make this common with lw3client SubscriberEntry
 */
interface SubscriberEntry {
  path: string;
  property: string;
  value: string;
  callback: (path: string, property: string, value: any) => void;
  subscriptionId: number;
  count: number;
}

/**
 * NoodleServerObject represents a single node stored in local memory.
 * A node might hold subnodes, properties, methods.
 * NoodleServerObject is intended to use by a proxy around it, no need to access it directly
 */
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
  /** Store subscriptions */
  declare subscribers: SubscriberEntry[];
  declare subscriptionIdCounter: number;

  constructor(name: string = 'default', path: string[] = [], lw3server?: Lw3Server) {
    Object.defineProperty(this, 'clientname', { enumerable: false, configurable: true, value: name });
    Object.defineProperty(this, 'path', { enumerable: false, configurable: true, value: path });
    Object.defineProperty(this, 'lw3server', { enumerable: false, configurable: true, value: lw3server });
    Object.defineProperty(this, 'properties', { enumerable: false, configurable: true, writable: true, value: {} });
    Object.defineProperty(this, 'nodes', { enumerable: false, configurable: true, value: {} });
    Object.defineProperty(this, 'methods', { enumerable: false, configurable: true, value: {} });
    Object.defineProperty(this, 'subscribers', { enumerable: false, configurable: true, value: [] });
    Object.defineProperty(this, 'subscriptionIdCounter', { enumerable: false, configurable: true, writable: true, value: 0 });
    this.properties = {};
  }

  /** converting the node to JSON */
  toJSON() {
    const ret = {} as any;
    Object.keys(this.properties).forEach((element) => {
      if (this.properties[element].getter) ret[element] = this.properties[element].getter?.bind(this.properties[element])();
      else ret[element] = this.properties[element].value;
    });
    Object.keys(this.nodes).forEach((element) => {
      ret[element] = (this.nodes[element] as unknown as NoodleServerObject).toJSON();
    });
    return ret;
  }

  /** create / update subnodes, properties, methods from a JSON */
  fromJSON(json: any) {
    Object.keys(json).forEach((element) => {
      const keytype = typeof json[element as keyof typeof json];
      if (keytype === 'string' || keytype === 'number' || keytype === 'boolean') {
        // property
        if (element in this.properties) {
          // existing property
          const oldvalue = this.properties[element].value;
          if (this.properties[element].setter) this.properties[element].setter?.bind(this.properties[element])(json[element as keyof typeof json].toString());
          else this.properties[element].value = json[element as keyof typeof json].toString();
          if (oldvalue !== this.properties[element].value) this.handleCallbacks(element, this.properties[element].value);
        } else {
          // create new property
          // todo: a node or method exists with this name?
          this.properties[element] = { rw: false, manual: '', value: json[element as keyof typeof json].toString() };
          this.handleCallbacks(element, this.properties[element].value);
        }
      } else if (keytype === 'object') {
        // node
        if (element in this.nodes) {
          // existing node
          (this.nodes[element] as unknown as NoodleServerObject).fromJSON(json[element as keyof typeof json]);
        } else {
          // todo: a method or property exists with that name
          this.nodes[element] = new NoodleServerObject(this.clientname, this.path.slice().concat(element), this.lw3server) as unknown as Noodle;
          (this.nodes[element] as unknown as NoodleServerObject).fromJSON(json[element as keyof typeof json]);
        }
      } else if (keytype === 'function') {
        if (element in this.methods) {
          this.methods[element].fun = json[element as keyof typeof json];
        } else {
          // create new method
          // todo: a node or property exists with this name?
          this.methods[element] = { fun: json[element as keyof typeof json], manual: '' };
        }
      }
    });
  }

  /** Called when a property has changed. Will trigger the callback functions */
  handleCallbacks(property: string, value: string) {
    this.subscribers.forEach((entry: SubscriberEntry, index, object) => {
      if ((!entry.property || entry.property === property) && (!entry.value || entry.value === value)) {
        debug('callback ', this.path, property, value);
        entry.callback('/' + this.path.join('/'), property, convertValue(value));
        if (entry.count > 0) {
          entry.count--;
          if (entry.count === 0) {
            object.splice(index, 1);
            debug('(callback deleted)');
          }
        }
      }
    });
  }
}

export const NoodleServerProxyHandler: ProxyHandler<NoodleServerObject> = {
  get(t: NoodleServerObject, key: string): any {
    switch (key) {
      case 'toJSON':
        const ret = t.toJSON();
        return () => ret;
      case 'fromJSON':
        return (json: any) => {
          t.fromJSON(json);
        };
      case '__nodes__':
        return () => {
          return Object.keys(t.nodes).sort();
        };
      case '__methods__':
        return () => {
          return Object.keys(t.methods).sort();
        };
      case '__properties__':
        return (pkey: string | undefined) => {
          if (pkey) return t.properties[pkey];
          else return t.properties;
        };
      case 'server':
        return t.lw3server?.server;
      case '__close__':
        return () => {
          t.lw3server?.close();
        };
      case 'on':
      case 'once':
        return (...args: any[]) => {
          let callback = args[0];
          let condition = '';
          if (typeof args[0] === 'string') {
            callback = args[1];
            condition = args[0];
          }
          let property = '';
          let value = '';
          if (condition) {
            const conditionParts = condition.split('=');
            property = conditionParts[0];
            if (conditionParts.length === 2) value = conditionParts[1];
          }
          const subscriptionId = ++t.subscriptionIdCounter;
          t.subscribers.push({
            path: '',
            callback,
            subscriptionId,
            count: key === 'once' ? 1 : -1,
            property,
            value,
          });
          return new Promise<number>((resolve, reject) => {
            resolve(subscriptionId);
          });
        };
      case 'waitFor': {
        return (condition?: string): Promise<void> => {
          return new Promise<void>((resolve, reject) => {
            (NoodleServerProxyHandler as any).get(t, 'once')(condition, (path: string, property: string, value: string) => {
              resolve();
            });
          });
        };
      }
      case 'removeListener':
      case 'off':
        return (subscriptionId: number | ListenerCallback) => {
          let subscriptionIndex = -1;
          if (typeof subscriptionId === 'number') subscriptionIndex = _.findIndex(t.subscribers, { subscriptionId: subscriptionId as number });
          else if (typeof subscriptionId === 'function') subscriptionIndex = _.findIndex(t.subscribers, { callback: subscriptionId as ListenerCallback });
          if (subscriptionIndex !== -1) t.subscribers.splice(subscriptionIndex, 1);
        };
    }
    let $ = false;
    if (key[0] === '$') {
      $ = true;
      key = key.substring(1);
    }
    const keyparts = key.split('__');
    const mainkey = keyparts[0];
    let keymodifier = keyparts.length > 2 ? keyparts[1] : '';
    if (mainkey in t.nodes) return new Proxy(t.nodes[key] as unknown as NoodleServerObject, NoodleServerProxyHandler);
    if (keymodifier === 'man' || keymodifier === 'rw') keymodifier = '';
    const isManual = keyparts[keyparts.length - 2] === 'man';
    const isRw = keyparts[keyparts.length - 2] === 'rw';
    if (mainkey in t.properties) {
      const property = t.properties[mainkey];
      if (isManual) return property.manual;
      if (isRw) return property.rw;
      if (property.getter) return property.getter.bind(property)();
      else return convertValue(property.value);
    }

    if (mainkey in t.methods) {
      if (isManual) return t.methods[mainkey].manual;
      return ((f: ((args: any[]) => string) | undefined) => {
        if (f === undefined)
          return async (...args: string[]) => {
            /* */
          } /* do nothing */;
        else if (f.constructor.name === 'AsyncFunction') return f /* return with the async function */;
        else
          return async (...args: any) => {
            return f.apply(this, args);
          }; /* wrap into async function */
      })(t.methods[mainkey].fun);
    }
    if ($) return undefined; // keys marked with $ sign are not auto-created
    // a new object shall be created
    const castedToProperty = keymodifier === 'prop';
    const isNode = key === key.toUpperCase() || keymodifier === 'node';
    const isMethod = key[0] === key[0].toLowerCase() || keymodifier === '__method__';
    if ((isNode || isMethod) && !castedToProperty) {
      // request a non existing node/method. Creating it.
      if (isMethod) {
        // request a non existing method.
        t.methods[mainkey] = { manual: '' };
        if (isManual) return '';
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
      if (isRw) return true;
      return '';
    }
  },

  set(t: NoodleServerObject, key: string, value: string | object): boolean {
    let $ = false;
    if (key[0] === '$') {
      $ = true;
      key = key.substring(1);
    }
    const keyparts = key.split('__');
    const mainkey = keyparts[0];
    let keymodifier = keyparts.length > 2 ? keyparts[1] : '';
    const isManual = keyparts[keyparts.length - 2] === 'man';
    const isRw = keyparts[keyparts.length - 2] === 'rw';
    if (keymodifier === 'man' || keymodifier === 'rw') keymodifier = '';
    if (mainkey in t.properties && (keymodifier === '' || keymodifier === 'prop')) {
      // update an existing property value
      if (typeof value === 'object') {
        if (isRw || isManual) return false;
        // update to a new Property object
        if ('manual' in value) t.properties[mainkey].manual = value['manual' as keyof object];
        if ('rw' in value) t.properties[mainkey].rw = value['rw' as keyof object];
        if ('setter' in value) t.properties[mainkey].setter = value['setter' as keyof object];
        if ('getter' in value) t.properties[mainkey].getter = value['getter' as keyof object];
        if ('value' in value) {
          const newValue = (value['value' as keyof object] as any).toString();
          if (t.properties[mainkey].value !== newValue) {
            t.properties[mainkey].value = newValue;
            t.handleCallbacks(mainkey, newValue);
          }
        }
      } else {
        // update with a primitive type
        if (isManual) t.properties[mainkey].manual = value.toString();
        else if (isRw) t.properties[mainkey].rw = value ? true : false;
        else if (t.properties[mainkey].setter) {
          const oldvalue = t.properties[mainkey].value;
          t.properties[mainkey].setter?.bind(t.properties[mainkey])(value);
          if (oldvalue !== t.properties[mainkey].value) t.handleCallbacks(mainkey, t.properties[mainkey].value);
        } else {
          const newValue = value.toString();
          if (t.properties[mainkey].value !== newValue) {
            t.properties[mainkey].value = newValue;
            t.handleCallbacks(mainkey, newValue);
          }
        }
      }
      return true;
    } else if (mainkey in t.nodes && (keymodifier === '' || keymodifier === 'node')) {
      if (typeof value !== 'object') return false;
      (t.nodes[mainkey] as unknown as NoodleServerObject).fromJSON(value);
      return true;
    } else if (mainkey in t.methods && (keymodifier === '' || keymodifier === 'method')) {
      if (typeof value === 'object') {
        if (isManual || isRw) return false;
        // update to a new Method object
        if ('manual' in value) t.methods[mainkey].manual = value['manual' as keyof object]; // todo: type checks?
        if ('fun' in value) t.methods[mainkey].fun = value['fun' as keyof object];
      } else if (typeof value === 'function') {
        if (isManual || isRw) return false;
        // update with a function type
        t.methods[mainkey].fun = value;
      } else {
        if (isManual) t.methods[mainkey].manual = value.toString();
        else return false;
      }
      return true;
    }
    if ($) return false;
    const castedToProperty = keymodifier === 'prop';
    const isNode = key === key.toUpperCase() || keymodifier === 'node';
    const isMethod = key[0] === key[0].toLowerCase() || keymodifier === 'method';
    // create new object on the fly
    if (isNode && !castedToProperty) {
      // node
      if (isManual || isRw) return false;
      t.nodes[mainkey] = new NoodleServerObject(t.clientname, t.path.slice().concat(mainkey), t.lw3server) as any;
      (t.nodes[mainkey] as unknown as NoodleServerObject).fromJSON(value);
    } else if (isMethod && !castedToProperty) {
      // method
      if (isRw) return false;
      t.methods[mainkey] = { manual: '' };
      if (typeof value === 'object') {
        if (isManual) return false;
        // update to a new Method object
        debug(`Create a new method from object ${mainkey}`);
        if ('manual' in value) t.methods[mainkey].manual = value['manual' as keyof object]; // todo: type checks?
        if ('fun' in value) t.methods[mainkey].fun = value['fun' as keyof object];
      } else if (typeof value === 'function') {
        if (isManual) return false;
        // update with a function type
        debug(`Create a new method from function ${mainkey}`);
        t.methods[mainkey].fun = value;
      } else {
        if (isManual) {
          t.methods[mainkey].manual = value.toString();
          return true;
        }
        debug(`Create a new method failed: ${mainkey}`);
        return false;
      }
    } else {
      // property

      t.properties[mainkey] = { value: '', manual: '', rw: true };
      if (typeof value === 'object') {
        if (isManual || isRw) return false;
        debug('Create new property from object');
        if ('value' in value) t.properties[mainkey].value = (value['value' as keyof object] as any).toString(); // todo: type checks?
        if ('manual' in value) t.properties[mainkey].manual = value['manual' as keyof object];
        if ('rw' in value) t.properties[mainkey].rw = value['rw' as keyof object];
        if ('setter' in value) t.properties[mainkey].setter = value['setter' as keyof object];
        if ('getter' in value) t.properties[mainkey].getter = value['getter' as keyof object];
        t.handleCallbacks(mainkey, t.properties[mainkey].value);
      } else {
        if (isManual) {
          t.properties[mainkey].manual = value.toString();
        } else if (isRw) {
          t.properties[mainkey].rw = value ? true : false;
        } else {
          debug(`Create ${mainkey} property from data in ${t.path.at(-1)}`);
          t.properties[mainkey].value = value.toString();
          t.handleCallbacks(mainkey, t.properties[mainkey].value);
        }
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

  debug('Noodle server created');
  return server.root;
};
