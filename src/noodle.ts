import { Lw3Client } from './lw3client';
import { Lw3Server } from './lw3server';

export type Noodle = {
  [method: string]: (...args: any[]) => string;
} & {
  [property: string]: string;
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
  /** the connection object. It is not intended for external use */
  lw3server: Lw3Server;
};
