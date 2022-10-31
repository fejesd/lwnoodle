import { Lw3Client } from './lw3client';
import { Lw3Server } from './lw3server';

export type ListenerCallback = (path: string, property: string, value: any) => void;

export type Noodle = {
  [method: string]: (...args: any[]) => string;
} & {
  [property: string]: string;
} & {
  /**
   * Getting notification when an event happens.
   * Will call the callback function when a property has changed under the node.
   * Event can be a property name or a property=value pair. Alternatively '*' or empty event will trigger for any change.
   * @returns {Promise<number>} the number can be used remove the callback later
   */
  on(event: string, callback: ListenerCallback): Promise<number>;
  /**
   * Shorthand for .on('*', callback).
   * Will call the callback function when any property has changed under the node.
   * @returns {Promise<number>} the number can be used remove the callback later
   */
  on(callback: ListenerCallback): Promise<number>;

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
  once(event: string, callback: ListenerCallback): Promise<number>;

  /**
   * Shorthand for once('*', callback)
   * @returns {Promise<number>} the number can be used remove the callback later
   */
  once(callback: ListenerCallback): Promise<number>;

  /** Will resolve when a change has happened under the node.
   * The optional condition might hold a property name or even a property value, eg. "SignalPresent" or "SignalPresent=true"
   */
  waitFor(condition?: string): Promise<string>;
};

export type NoodleClient = Noodle & {
  (): any;
  [name: string]: NoodleClient;
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
  lw3client: Lw3Client;
};

export enum Lw3ErrorCodes {
  Lw3ErrorCodes_None = 0,
  Lw3ErrorCodes_Syntax = 1,
  Lw3ErrorCodes_NotFound = 2,
  Lw3ErrorCodes_AlreadyExists = 3,
  Lw3ErrorCodes_InvalidValue = 4,
  Lw3ErrorCodes_IllegalParamCount = 5,
  Lw3ErrorCodes_IllegalOperation = 6,
  Lw3ErrorCodes_AccessDenied = 7,
  Lw3ErrorCodes_Timeout = 8,
  Lw3ErrorCodes_CommandTooLong = 9,
  Lw3ErrorCodes_InternalError = 10,
  Lw3ErrorCodes_NotImplemented = 11,
  Lw3ErrorCodes_NodeDisabled = 12,
}

export class Lw3Error extends Error {
  lw3Error: Lw3ErrorCodes;
  constructor(error: Lw3ErrorCodes) {
    super(Lw3Error.getErrorCodeString(error));
    this.lw3Error = error;
  }

  static getErrorCodeString(errorcode: Lw3ErrorCodes): string {
    switch (errorcode) {
      case Lw3ErrorCodes.Lw3ErrorCodes_Syntax:
        return 'Syntax error';
      case Lw3ErrorCodes.Lw3ErrorCodes_NotFound:
        return 'Not exists';
      case Lw3ErrorCodes.Lw3ErrorCodes_AlreadyExists:
        return 'Already exists';
      case Lw3ErrorCodes.Lw3ErrorCodes_InvalidValue:
        return 'Invalid value';
      case Lw3ErrorCodes.Lw3ErrorCodes_IllegalParamCount:
        return 'Illegal parameter count';
      case Lw3ErrorCodes.Lw3ErrorCodes_IllegalOperation:
        return 'Illegal operation';
      case Lw3ErrorCodes.Lw3ErrorCodes_AccessDenied:
        return 'Access denied';
      case Lw3ErrorCodes.Lw3ErrorCodes_Timeout:
        return 'Timeout';
      case Lw3ErrorCodes.Lw3ErrorCodes_CommandTooLong:
        return 'Command too long';
      case Lw3ErrorCodes.Lw3ErrorCodes_InternalError:
        return 'Internal error';
      case Lw3ErrorCodes.Lw3ErrorCodes_NotImplemented:
        return 'Not implemented';
      case Lw3ErrorCodes.Lw3ErrorCodes_NodeDisabled:
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
  setter?: (value: string) => Lw3ErrorCodes /* setter function will be called if available instead of setting value directly */;
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
  /** return an Lw3Server */
  server: Lw3Server;
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
  lw3server: Lw3Server;
};
