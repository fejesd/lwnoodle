import { PropValue } from './common';
import { LwClient } from './lwclient';
import { LwServer } from './lwserver';
import { ServerConnection } from './serverconnection';

export type ListenerCallback = (path: string, property: string, value: PropValue) => void;

// A dynamic node in the noodle tree. We intentionally expose a single loose
// index signature so TypeScript allows assigning primitives, config objects
// and functions without needing explicit casts to 'any'.
// Formerly two conflicting index signatures (method & property) forced users
// to cast when setting values. That has been replaced by a unified signature.
export type Noodle = {
  [key: string]: any;
} & {
  /**
   * Getting notification when an event happens.
   * Will call the callback function when a property has changed under the node.
   * Event can be a property name or a property=value pair. Alternatively '*' or empty event will trigger for any change.
   * Passing path is optional. You need to pass the full path only if you use on(..) function with a symlink
   * @returns {Promise<number>} the number can be used remove the callback later
   */
  on(event: string, callback: ListenerCallback, path?: string): Promise<number>;
  /**
   * Shorthand for .on('*', callback).
   * Will call the callback function when any property has changed under the node.
   * When you call on an symlink, you need to pass the full path
   * @returns {Promise<number>} the number can be used remove the callback later
   */
  on(callback: ListenerCallback, path?: string): Promise<number>;

  /**
   * Will remove an event listener from the node.
   * @param id either the id returned by the on() function, or the callback function itself.
   */
  removeListener(id: number | ListenerCallback): void;

  /**
   * Will call the callback function only once when a property has changed under the node.
   * The event name might hold a property name or even a property value, eg. "SignalPresent" or "SignalPresent=true". Can be '*' as wildchar
   * @returns {Promise<number>} the number can be used remove the callback later
   */
  once(event: string, callback: ListenerCallback, path?: string): Promise<number>;

  /**
   * Shorthand for once('*', callback)
   * @returns {Promise<number>} the number can be used remove the callback later
   */
  once(callback: ListenerCallback, path?: string): Promise<number>;

  /** Will resolve when a change has happened under the node.
   * The optional condition might hold a property name or even a property value, eg. "SignalPresent" or "SignalPresent=true"
   */
  waitFor(condition?: string): Promise<string>;
};

export type NoodleClient = Noodle & {
  (): any;
  [name: string]: NoodleClient; // recursive nodes
} & {
  /** Return with a promise which will fullfilled when the connection has been created. It is fullfilled immediately if
   * the connection is already opened. As the client attempts reconnect continously on error, the promise will never
   * rejected
   */
  __connect__(): Promise<void>;
  /** Close the connection to the server. */
  __close__(): void;
  /** Wait until every pending communication finishes. */
  __sync__(): Promise<void>;

  /** parts of the path. It is not intended for external use */
  path: string[];
  /** the connection object. It is not intended for external use */
  lwclient: LwClient;
};

export enum LwErrorCodes {
  LwErrorCodes_None = 0,
  LwErrorCodes_Syntax = 1,
  LwErrorCodes_NotFound = 2,
  LwErrorCodes_AlreadyExists = 3,
  LwErrorCodes_InvalidValue = 4,
  LwErrorCodes_IllegalParamCount = 5,
  LwErrorCodes_IllegalOperation = 6,
  LwErrorCodes_AccessDenied = 7,
  LwErrorCodes_Timeout = 8,
  LwErrorCodes_CommandTooLong = 9,
  LwErrorCodes_InternalError = 10,
  LwErrorCodes_NotImplemented = 11,
  LwErrorCodes_NodeDisabled = 12,
}

export class LwError extends Error {
  lwError: LwErrorCodes;
  constructor(error: LwErrorCodes) {
    super(LwError.getErrorCodeString(error));
    this.lwError = error;
  }

  static getErrorCodeString(errorcode: LwErrorCodes): string {
    switch (errorcode) {
      case LwErrorCodes.LwErrorCodes_Syntax:
        return 'Syntax error';
      case LwErrorCodes.LwErrorCodes_NotFound:
        return 'Not exists';
      case LwErrorCodes.LwErrorCodes_AlreadyExists:
        return 'Already exists';
      case LwErrorCodes.LwErrorCodes_InvalidValue:
        return 'Invalid value';
      case LwErrorCodes.LwErrorCodes_IllegalParamCount:
        return 'Illegal parameter count';
      case LwErrorCodes.LwErrorCodes_IllegalOperation:
        return 'Illegal operation';
      case LwErrorCodes.LwErrorCodes_AccessDenied:
        return 'Access denied';
      case LwErrorCodes.LwErrorCodes_Timeout:
        return 'Timeout';
      case LwErrorCodes.LwErrorCodes_CommandTooLong:
        return 'Command too long';
      case LwErrorCodes.LwErrorCodes_InternalError:
        return 'Internal error';
      case LwErrorCodes.LwErrorCodes_NotImplemented:
        return 'Not implemented';
      case LwErrorCodes.LwErrorCodes_NodeDisabled:
        return 'Node disabled or standby mode active';
      default:
        return 'Unknown error';
    }
  }
}

export interface Property {
  value: string;
  manual: string;
  rw: boolean;
  setter?: (value: string) => LwErrorCodes /* setter function will be called if available instead of setting value directly */;
  getter?: () => string /* getter function will override the value string */;
}

export interface Method {
  manual: string;
  fun?: (args: any[]) => string;
}

export type NoodleServer = Noodle & {
  (): any;
  [name: string]: NoodleServer;
} & {
  /** parts of the path. It is not intended for external use */
  path: string[];
  /** return an LwServer */
  server: ServerConnection[];
  /** Shutdown the server, close listening ports, close all clients */
  __close__(): void;
  /** return all subnodes */
  __nodes__(): string[];
  /** return all methods */
  __methods__(): string[];
  /** return all properties */
  __properties__(): { [name: string]: Property };
  /** return single property */
  __properties__(s: string): Property;

  /** the connection object. It is not intended for external use */
  lwserver: LwServer;
};
