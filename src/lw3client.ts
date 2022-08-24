import { ClientConnection } from './clientconnection';
import { EventEmitter } from 'node:events';
import Debug from 'debug';
const debug = Debug('Lw3Client');

interface WaitListItem {
  signature: string;
  callback: ((cb: string[], info: any) => void) | undefined;
  callbackInfo: any;
}

interface SubscriberEntry {
  path: string;
  property: string;
  value: string;
  callback: (path: string, property: string, value: string) => void;
}

export class Lw3Client extends EventEmitter {
  connection: ClientConnection;
  waitResponses: boolean;
  subscribers: SubscriberEntry[];
  signatureCounter: number;
  waitList: WaitListItem[];
  isInBlock: boolean; /* Are we in a middle of a {...} block? */
  block: string[]; /* Collect lines of incoming block here */
  signature: string; /* signature of currently received block */
  cmdToSend: string[]; /* Outgoing message FIFO */

  /* Helper function, convert common values to appropriate JavaScript types. (integer / boolean / list) */
  static convertValue(value: string) {
    let retvalue: any;
    if (!isNaN(parseFloat(value))) retvalue = parseFloat(value);
    else if (value.toUpperCase() === 'FALSE') retvalue = false;
    else if (value.toUpperCase() === 'TRUE') retvalue = true;
    else if (value.indexOf(';') !== -1) {
      retvalue = value.split(';');
      if (retvalue.slice(-1)[0] === '') retvalue.pop();
      for (let i = 0; i < retvalue.length; i++) retvalue[i] = Lw3Client.convertValue(retvalue[i]);
    } else return value;
    return retvalue;
  }

  /**
   * Escape string according to lw3 protocol
   * @param value string to escape
   */
  static escape(value: string): string {
    value = value.replace(/\t/g, '\\t').replace(/\n/g, '\\n');
    return value;
  }

  /**
   * Unescape string according to lw3 protocol
   * @param value string to escape
   */
  static unescape(value: string): string {
    value = value.replace(/\\t/g, '\t').replace(/\\n/g, '\n');
    return value;
  }

  constructor(connection: ClientConnection, waitresponses: boolean = false) {
    super();
    this.connection = connection;
    this.waitResponses = waitresponses;
    this.subscribers = [];
    this.waitList = [];
    this.signatureCounter = 0;
    this.isInBlock = false;
    this.block = [];
    this.cmdToSend = [];
    this.signature = '';
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
    const subscribed: string[] = [];
    this.subscribers.forEach((i: any) => {
      if (subscribed.indexOf(i.path) === -1) {
        this.cmdSend('OPEN ' + i.path);
        subscribed.push(i.path);
      }
    });
  }

  private cmdSend(cmd: string, callback?: (data: string[], info: any) => void, callbackInfo?: any): void {
    if (!this.connection.isConnected()) return;
    const signature = (this.signatureCounter + 0x10000).toString(16).substr(-4).toUpperCase();
    const data = signature + '#' + cmd + '\n';
    this.connection.write(data);
    callbackInfo = callbackInfo || undefined;
    this.waitList.push({ signature, callback, callbackInfo });
    this.signatureCounter = (this.signatureCounter + 1) % 0x10000;
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
    data = data.substring(4, data.length - 1);
    const eq = data.search('=');
    if (eq === -1) {
      debug(`Strange message: ${data}`); // TODO: better errorhandling
      return;
    }
    const proppath = data.substring(0, eq);
    const nodepath = proppath.substring(0, proppath.indexOf('.'));
    const propname = proppath.substring(proppath.indexOf('.') + 1, proppath.length);
    const value = Lw3Client.unescape(data.substring(eq + 1, data.length));
    // notify subscribers
    this.subscribers.forEach((i) => {
      if (i.path === nodepath) {
        if (i.property === '*' || i.property === '' || i.property === propname) {
          if (i.value === '' || i.value === value) {
            i.callback(nodepath, propname, Lw3Client.convertValue(value));
          }
        }
      }
    });
  }

  /* Called when a new block (in {...} parenthesis) has been arrived with a signature*/
  private blockRcv(signature: string, data: string[]): void {
    for (let i = 0; i < this.waitList.length; i++)
      if (this.waitList[i].signature === signature) {
        const waitRecord: WaitListItem = this.waitList[i];
        this.waitList.splice(i, 1);
        if (this.waitResponses) {
          if (this.cmdToSend.length > 0) {
            const dataToSend: string = this.cmdToSend.shift() as string;
            this.connection.write(dataToSend);
            debug('> ' + dataToSend);
          }
        }
        if (waitRecord.callback) waitRecord.callback(data, waitRecord.callbackInfo);
        return;
      }
    debug(`Unexpected response with signature: ${signature}`); // TODO: better errorhandling
  }

  /**
   * Will set a property to a specific value
   * @param property
   * @param value
   * @returns promise will fullfill on success, reject on failure
   */
  SET(property: string, value: string): Promise<void> {
    value = Lw3Client.escape(value);
    // todo sanity check
    return new Promise<void>((resolve, reject) => {
      this.cmdSend('SET ' + property + '=' + value.toString(), (data: string[], info: any) => {
        data[0].charAt(1) !== 'E' ? resolve() : reject();
      });
    });
  }

  /**
   * Will call a method with the given parameters
   * @param property  Full path + semicolon + methodname
   * @param param
   * @returns promise will fullfill on success (and return the method return value), reject on failure
   */
  CALL(property: string, param: string): Promise<string> {
    param = Lw3Client.escape(param);
    // todo sanity check
    return new Promise<string>((resolve, reject) => {
      function error(msg: string): void {
        debug(msg);
        reject(new Error(msg));
      }
      this.cmdSend('CALL ' + property + '(' + param + ')', (data: string[], info: any) => {
        if (data.length > 1) {
          error('GET response contains multiple lines: ' + JSON.stringify(data));
          return;
        } else if (data.length === 0) {
          error('GET response contains no data!');
          return;
        }
        if (!data.length) {
          error('Empty response');
          return;
        }
        const line = data[0];
        if (!line.length) {
          error('Empty response');
          return;
        }
        if (line.substring(0, 3) === 'mO ') resolve(line.substring(line.search('=') + 1, line.length));
        else if (line.substring(0, 3) === 'mE ') error(line.substring(data[0].search('=') + 1, line.length));
        else error('Malformed response: ' + data);
      });
    });
  }

  /**
   * Will return the value of a property
   * @param property Full path + dot + propertyname
   * @returns
   */
  GET(property: string): Promise<string> {
    const pathParts = property.split('.');
    return new Promise((resolve, reject) => {
      function error(msg: string): void {
        debug(msg);
        reject(new Error(msg));
      }
      if (pathParts.length !== 2) error(`Getting invalid property: ${property}`);
      this.cmdSend('GET ' + property, (data: string[], info: any) => {
        if (data.length > 1) {
          error('GET response contains multiple lines: ' + JSON.stringify(data));
          return;
        } else if (data.length === 0) {
          error('GET response contains no data!');
          return;
        }
        if (!data.length) {
          error('Empty response');
          return;
        }
        const line = data[0];
        if (!line.length) {
          error('Empty response');
          return;
        }
        if (line.charAt(0) !== 'p') {
          error('GET response contains no property... ' + line);
          return;
        }
        const n = line.indexOf('=');
        if (n === -1) {
          error('Malformed GET response: ' + line);
          return;
        }
        resolve(Lw3Client.convertValue(Lw3Client.unescape(line.substring(n + 1, line.length))));
      });
    });
  }

  /**
   * It will OPEN a node and watch for changing data
   * @param path      path to the node
   * @param property  optional. you can watch only single property if you like. Set it empty if not needed
   * @param value     optional. you can watch for a specific value only if you like. Set it empty if not needed
   * @param callback  callback function will notified about changes
   * @returns Promise rejects on failure. Promise return an ID number, which can be used for removing the watch entry later.
   */
  OPEN(
    path: string,
    property: string,
    value: string,
    callback: (path: string, property: string, value: string) => void,
  ): Promise<number> {
    // todo sanity check
    if (path[path.length - 1] === '/') path = path.slice(0, -1);
    let alreadyOpen = false;
    for (const subscriber of this.subscribers) if (subscriber.path === path) alreadyOpen = true;
    return new Promise<number>((resolve, reject) => {
      if (!alreadyOpen) {
        this.cmdSend('OPEN ' + path, (data: string[], info: any) => {
          if (data[0].charAt(0) !== 'o' || data[0].search(path) === -1) {
            debug(`Strange response to OPEN command: ${data[0]}`);
            reject();
            return;
          }
          this.subscribers.push({ path, property, value, callback });
          resolve(this.subscribers.length);
        });
      } else {
        this.subscribers.push({ path, property, value, callback });
        resolve(this.subscribers.length);
      }
    });
  }

  /**
   * Closes the connection
   */
  close() {
    this.connection.close();
  }
}
