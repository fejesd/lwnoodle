import { ClientConnection } from './clientconnection';
import { EventEmitter } from 'node:events';
import { escape, unescape } from './escaping';
import { convertValue } from './common';
import Debug from 'debug';
import * as _ from 'lodash';
import { ListenerCallback } from './noodle';

const debug = Debug('LwClient');

/**
 * WaitListItem stores a signature and callback information. LwClient::waitList store a list of WaitListItems,
 * timeouts and callbacks are handled through this list.
 */
interface WaitListItem {
  signature: string;
  callback: ((cb: string[], info: any) => void) | undefined;
  callbackInfo: any;
  timeoutcb?: () => void;
}

/**
 * If somebody watch a node (optionally just for a specific property, optionally for a specific values) then a SubscriberEntry
 * will be pushed into LwClient::subscribers.
 * subscriptionId is an unique id used for delete the subscription. Count is optional, if greater than zero, subscription will be
 * deleted after count times calling the callback.
 */
interface SubscriberEntry {
  path: string;
  property: string;
  value: string;
  callback: ListenerCallback;
  subscriptionId: number;
  count: number;
}

/**
 * Lwclient::sync() method will return a promise which will be resolved when every task is done. LwClient.syncPromises hold a list of
 * SyncPromise objects which store the resolve and rejects functions.
 */
interface SyncPromise {
  resolve: () => void;
  reject: (msg: string) => void;
}

/**
 * LwClient class is not intended for external use, you should use only the proxy objects. However if you like, you have
 * access it through noodle_obj.lwclient
 */
export class LwClient extends EventEmitter {
  connection: ClientConnection;
  waitResponses: boolean;
  subscribers: SubscriberEntry[];
  subscriptionCounter: number;
  signatureCounter: number;
  waitList: WaitListItem[];
  isInBlock: boolean; /* Are we in a middle of a {...} block? */
  block: string[]; /* Collect lines of incoming block here */
  signature: string; /* signature of currently received block */
  cmdToSend: string[]; /* Outgoing message FIFO */
  syncPromises: SyncPromise[]; /* List of promise resolve functions that shall be fulfilled when there are no more tasks */
  cache: { [path: string]: { [property: string]: string } };

  constructor(connection: ClientConnection, waitresponses: boolean = false) {
    super();
    this.connection = connection;
    this.waitResponses = waitresponses;
    this.subscribers = [];
    this.subscriptionCounter = 0;
    this.waitList = [];
    this.signatureCounter = 0;
    this.isInBlock = false;
    this.block = [];
    this.cmdToSend = [];
    this.signature = '';
    this.syncPromises = [];
    this.cache = {};
    connection.on('error', this.socketError.bind(this));
    connection.on('close', this.socketClosed.bind(this));
    connection.on('connect', this.socketConnected.bind(this));
    connection.on('frame', this.lineRcv.bind(this));
  }

  socketError(e: Error) {
    debug('Connection error:' + e.toString());
    this.emit('error', e);
  }

  private socketClosed() {
    debug('Connection was closed');
    this.emit('close');
  }

  private socketConnected() {
    debug('Connection established succesfully');
    this.emit('connect');
    this.signatureCounter = 0;
    this.waitList = [];
    this.isInBlock = false;
    this.block = [];
    this.cmdToSend = [];
    this.cache = {};
    const subscribed: string[] = [];
    this.subscribers.forEach((i: any) => {
      if (subscribed.indexOf(i.path) === -1) {
        this.cmdSend('OPEN ' + i.path);
        subscribed.push(i.path);
      }
    });
  }

  private cmdSend(cmd: string, callback?: (data: string[], info: any) => void, callbackInfo?: any, timeoutcb?: () => void): void {
    if (!this.connection.isConnected()) return;
    const signature = (this.signatureCounter + 0x10000).toString(16).substr(-4).toUpperCase();
    const data = signature + '#' + cmd + '\n';
    this.connection.write(data);
    callbackInfo = callbackInfo || undefined;
    this.waitList.push({ signature, callback, callbackInfo, timeoutcb });
    this.signatureCounter = (this.signatureCounter + 1) % 0x10000;
    setTimeout(
      ((signo: string) => {
        return () => {
          for (const item of this.waitList)
            if (item.signature === signo) {
              debug('timeout for signature: ' + signo);
              if (item.timeoutcb) item.timeoutcb();
              this.waitList.splice(this.waitList.indexOf(item), 1); // remove item, we wait no longer for it
              if (this.cmdToSend.length > 0) {
                // send the next command if outgoing fifo is not empty
                const dataToSend: string = this.cmdToSend.shift() as string;
                this.connection.write(dataToSend);
                debug('> ' + dataToSend);
              }
              this.checkSyncPromises();
              return;
            }
        };
      })(signature as string),
      1000,
    );
  }

  private checkSyncPromises() {
    if (!this.cmdToSend.length && !this.waitList.length) {
      // if there are no more pending tasks
      if (this.syncPromises.length) {
        debug('fullfilling sync promises');
        for (const promise of this.syncPromises) promise.resolve(); // fullfill all promises
        this.syncPromises = [];
      }
    }
  }

  private rejectSyncPromises(err: string) {
    if (this.syncPromises.length) {
      debug('rejecting all sync promises: ' + err);
      for (const promise of this.syncPromises) promise.reject(err); // fullfill all promises
      this.syncPromises = [];
    }
  }

  /**
   * Called when a new line was received
   * @param data
   */
  private lineRcv(data: string): void {
    if (!data.length) return;
    debug('< ' + data);
    if (data.search('CHG ') === 0) this.chgRcv(data);
    else if (!this.isInBlock) {
      if (data.charAt(0) === '{') {
        this.isInBlock = true;
        this.signature = data.substring(1, 5);
      } else {
        debug('Some strange thing has arrived: ' + data); // TODO: better errorhandling
      }
    } else if (data.charAt(0) === '}') {
      this.blockRcv(this.signature, this.block);
      this.block = [];
      this.isInBlock = false;
    } else {
      this.block.push(data);
    }
  }

  /* Called when an asynv CHG command is received */
  private chgRcv(data: string): void {
    // parse incoming line
    data = data.substring(4, data.length);
    const eq = data.search('=');
    if (eq === -1) {
      debug(`Strange message: ${data}`); // TODO: better errorhandling
      return;
    }
    const proppath = data.substring(0, eq);
    const nodepath = proppath.substring(0, proppath.indexOf('.'));
    const propname = proppath.substring(proppath.indexOf('.') + 1, proppath.length);
    const value = unescape(data.substring(eq + 1, data.length));
    // update cache
    const nodecache = this.cache[nodepath];
    if (nodecache) nodecache[propname] = value;
    else {
      debug('This should not happen - CHG to an unopened node?');
      this.cache[nodepath] = { [propname]: value }; // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Object_initializer#computed_property_names
    }
    // notify subscribers
    const subscriptionsToClose: number[] = [];
    this.subscribers.forEach((i) => {
      if (i.path === nodepath) {
        if (i.property === '*' || i.property === '' || i.property === propname) {
          if (i.value === '' || i.value === value) {
            i.callback(nodepath, propname, convertValue(value));
            if (i.count !== -1) {
              i.count--;
              if (!i.count) subscriptionsToClose.push(i.subscriptionId);
            }
          }
        }
      }
    });
    subscriptionsToClose.forEach((x: number) => this.CLOSE(x));
  }

  /* Called when a new block (in {...} parenthesis) has been arrived with a signature*/
  private blockRcv(signature: string, data: string[]): void {
    for (let i = 0; i < this.waitList.length; i++)
      if (this.waitList[i].signature === signature) {
        const waitRecord: WaitListItem = this.waitList[i];
        debug('Removed :' + this.waitList.splice(i, 1)[0].signature);
        if (this.waitResponses) {
          if (this.cmdToSend.length > 0) {
            const dataToSend: string = this.cmdToSend.shift() as string;
            this.connection.write(dataToSend);
            debug('> ' + dataToSend);
          }
        }
        if (waitRecord.callback) waitRecord.callback(data, waitRecord.callbackInfo);
        this.waitList.splice(i, 1);
        this.checkSyncPromises();
        return;
      }
    debug(`Unexpected response with signature: ${signature}`); // TODO: better errorhandling
  }

  private error(msg: string, reject?: (msg: any) => void) {
    debug(msg);
    if (reject) reject(new Error(msg));
    this.rejectSyncPromises(msg);
  }

  /**
   * Will set a property to a specific value
   * @param property
   * @param value
   * @returns promise will fullfill on success, reject on failure
   */
  SET(property: string, value: string): Promise<void> {
    value = escape(value);
    // todo sanity check
    return new Promise<void>((resolve, reject) => {
      this.cmdSend(
        'SET ' + property + '=' + value.toString(),
        (data: string[], info: any) => {
          data[0].charAt(1) !== 'E' ? resolve() : this.error('Error received: ' + data, reject);
        },
        undefined,
        () => {
          this.error('no answer, timeout', reject);
          return;
        },
      );
    });
  }

  /**
   * Will call a method with the given parameters
   * @param property  Full path + semicolon + methodname
   * @param param
   * @returns promise will fullfill on success (and return the method return value), reject on failure
   */
  CALL(property: string, param: string): Promise<string> {
    param = escape(param);
    // todo sanity check
    return new Promise<string>((resolve, reject) => {
      this.cmdSend(
        'CALL ' + property + '(' + param + ')',
        (data: string[], info: any) => {
          if (data.length > 1) return this.error('CALL response contains multiple lines: ' + JSON.stringify(data), reject);
          else if (data.length === 0) return this.error('CALL response contains no data!', reject);
          if (!data.length) return this.error('Empty response to CALL', reject);
          const line = data[0];
          if (!line.length) return this.error('Empty response', reject);
          let eqpos = line.search('=');
          if (eqpos === -1) eqpos = line.length;
          if (line.substring(0, 3) === 'mE ') return this.error(line.substring(eqpos + 1, line.length), reject);
          if (line.substring(0, 3) === 'mO ') resolve(line.substring(eqpos + 1, line.length));
          else return this.error('Malformed response to CALL: ' + data, reject);
        },
        undefined,
        () => {
          this.error('no answer, timeout', reject);
          return;
        },
      );
    });
  }

  /**
   * Will return the value of a property
   * @param property Full path + dot + propertyname
   * @returns
   */
  GET(property: string): Promise<any> {
    const pathParts = property.split('.');
    return new Promise((resolve, reject) => {
      if (pathParts.length !== 2) return this.error(`Getting invalid property: ${property}`, reject);
      {
        // check cache
        const nodeCache = this.cache[pathParts[0]];
        if (nodeCache) {
          // this node has cached entries
          const propCache = nodeCache[pathParts[1]];
          if (propCache) {
            // cache hit. Return with the cached value immediatately
            debug(`Cache hit for ${pathParts[0]}.${pathParts[1]}`);
            resolve(convertValue(propCache));
            return;
          }
        }
      }
      this.cmdSend(
        'GET ' + property,
        (data: string[], pathPartsCb: any) => {
          if (data.length > 1) return this.error('GET response contains multiple lines: ' + JSON.stringify(data), reject);
          else if (data.length === 0) return this.error('GET response contains no data!', reject);
          if (!data.length) return this.error('Empty response', reject);
          const line = data[0];
          if (!line.length) return this.error('Empty response', reject);
          if (line.charAt(0) !== 'p') return this.error('GET response contains no property... ' + line, reject);
          const n = line.indexOf('=');
          if (n === -1) return this.error('Malformed GET response: ' + line, reject);
          const value = convertValue(unescape(line.substring(n + 1, line.length)));
          // if this node is cached, store the property into the cache
          const nodeCache = this.cache[pathPartsCb[0]];
          if (nodeCache) nodeCache[pathPartsCb[1]] = value;
          // resolve
          resolve(value);
        },
        pathParts,
        () => this.error('no answer, timeout', reject),
      );
    });
  }

  /**
   * Will fetch all property of a node and store in the cache
   * @param path
   */
  FETCHALL(path: string, callback: ListenerCallback): Promise<void> {
    return new Promise((resolve, reject) => {
      this.cmdSend(
        'GET ' + path + '.*',
        (data: string[], pathCb: any) => {
          data.forEach((dline: string) => {
            if (dline.charAt(0) === 'p') {
              const n = dline.indexOf('=');
              const p = dline.indexOf('.');
              if (n === -1) return this.error('Malformed GET response: ' + dline, reject);
              const value = convertValue(unescape(dline.substring(n + 1, dline.length)));
              const nodeCache = this.cache[pathCb];
              const property = dline.substring(p + 1, n);
              if (nodeCache) nodeCache[property] = value;
              callback(pathCb, property, value);
              debug(JSON.stringify(this.cache));
            }
          });
          resolve();
        },
        path,
        () => this.error('no answer, timeout', reject),
      );
    });
  }

  /**
   * It will OPEN a node and watch for changing data
   * @param path      path to the node
   * @param callback  callback function will notified about changes
   * @param rule  optional. you can watch property and also a value if you like. Examples: SignalPresent,  SignalPresent=false, ...
   * @param count optional. After calling the callback count times, the subscription will be closed automatically
   * @returns Promise rejects on failure. Promise return an ID number, which can be used for removing the watch entry later.
   */
  OPEN(path: string, callback: ListenerCallback, rule: string = '', count = -1): Promise<number> {
    // todo sanity check
    if (path[path.length - 1] === '/') path = path.slice(0, -1);
    const alreadyOpen = _.findIndex(this.subscribers, { path }) !== -1;
    if (rule === '*') rule = '';
    return new Promise<number>((resolve, reject) => {
      let property = '';
      let value = '';
      if (rule) {
        const ruleparts = rule.split('=');
        property = ruleparts[0];
        if (ruleparts.length > 1) value = ruleparts[1];
      }
      if (!alreadyOpen) {
        this.cmdSend('OPEN ' + path, (data: string[], info: any) => {
          if (data[0].charAt(0) !== 'o' || data[0].search(path) === -1) {
            debug(`Strange response to OPEN command: ${data[0]}`);
            reject();
            return;
          }
          this.subscribers.push({ path, property, value, callback, subscriptionId: this.subscriptionCounter, count });
          if (!this.cache[path]) this.cache[path] = {};
          resolve(this.subscriptionCounter++);
        });
      } else {
        debug(`${path} is already opened`);
        this.subscribers.push({ path, property, value, callback, subscriptionId: this.subscriptionCounter, count });
        resolve(this.subscriptionCounter++);
      }
    });
  }

  /**
   * Closes a subscription by ID
   * @param subscriptionId The ID of the subscription (returned by OPEN call) or the callback function
   * @returns
   */

  CLOSE(subscriptionId: any): Promise<void> {
    return new Promise((resolve, reject) => {
      let subscriptionIndex = -1;
      debug(JSON.stringify(subscriptionId));
      if (typeof subscriptionId === 'number') subscriptionIndex = _.findIndex(this.subscribers, { subscriptionId: subscriptionId as number });
      else if (typeof subscriptionId === 'function') {
        subscriptionIndex = _.findIndex(this.subscribers, { callback: subscriptionId as ListenerCallback });
      }
      if (subscriptionIndex === -1) {
        reject();
        return;
      }
      const path = this.subscribers[subscriptionIndex].path;
      this.subscribers.splice(subscriptionIndex, 1);
      if (_.findIndex(this.subscribers, { path }) === -1) {
        // there are no other subscription to this node
        this.cmdSend('CLOSE ' + path, (data: string[], info: any) => {
          if (data[0] !== 'c- ' + path) {
            debug(`Strange response to CLOSE command: ${data[0]}`);
            reject();
            return;
          }
          delete this.cache[path]; // node is closed now, we should invalidate all properties in the cache
          resolve();
        });
      } else {
        // there are other subscriptions, dont close the node yet
        resolve();
      }
    });
  }

  /**
   * Closes the connection
   */
  close() {
    this.connection.close();
  }

  /**
   * Returns with a promise that will be fulfilled when there are no more pending tasks. (ie. outgoing fifo is empty, all commands were answered)
   */
  sync(): Promise<void> {
    const promise = new Promise<void>((resolve, reject) => {
      if (!this.cmdToSend.length && !this.waitList.length) {
        debug('sync has happened immediately');
        resolve();
        return;
      }
      debug('sync request has been queued');
      this.syncPromises.push({ resolve, reject });
    });
    return promise;
  }
}
