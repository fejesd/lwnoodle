/// <reference types="node" />
import { ClientConnection } from './clientconnection';
import { EventEmitter } from 'node:events';
/**
 * WaitListItem stores a signature and callback information. Lw3Client::waitList store a list of WaitListItems,
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
 * will be pushed into Lw3Client::subscribers.
 * subscriptionId is an unique id used for delete the subscription. Count is optional, if greater than zero, subscription will be
 * deleted after count times calling the callback.
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
 * Lw3client::sync() method will return a promise which will be resolved when every task is done. Lw3Client.syncPromises hold a list of
 * SyncPromise objects which store the resolve and rejects functions.
 */
interface SyncPromise {
    resolve: () => void;
    reject: (msg: string) => void;
}
/**
 * Lw3Client class is not intended for external use, you should use only the proxy objects. However if you like, you have
 * access it through noodle_obj.lw3client
 */
export declare class Lw3Client extends EventEmitter {
    connection: ClientConnection;
    waitResponses: boolean;
    subscribers: SubscriberEntry[];
    subscriptionCounter: number;
    signatureCounter: number;
    waitList: WaitListItem[];
    isInBlock: boolean;
    block: string[];
    signature: string;
    cmdToSend: string[];
    syncPromises: SyncPromise[];
    cache: {
        [path: string]: {
            [property: string]: string;
        };
    };
    static convertValue(value: string): any;
    /**
     * Escape string according to lw3 protocol
     * @param value string to escape
     */
    static escape(value: string): string;
    /**
     * Unescape string according to lw3 protocol
     * @param value string to escape
     */
    static unescape(value: string): string;
    constructor(connection: ClientConnection, waitresponses?: boolean);
    socketError(e: Error): void;
    private socketClosed;
    private socketConnected;
    private cmdSend;
    private checkSyncPromises;
    private rejectSyncPromises;
    /**
     * Called when a new line was received
     * @param data
     */
    private lineRcv;
    private chgRcv;
    private blockRcv;
    private error;
    /**
     * Will set a property to a specific value
     * @param property
     * @param value
     * @returns promise will fullfill on success, reject on failure
     */
    SET(property: string, value: string): Promise<void>;
    /**
     * Will call a method with the given parameters
     * @param property  Full path + semicolon + methodname
     * @param param
     * @returns promise will fullfill on success (and return the method return value), reject on failure
     */
    CALL(property: string, param: string): Promise<string>;
    /**
     * Will return the value of a property
     * @param property Full path + dot + propertyname
     * @returns
     */
    GET(property: string): Promise<any>;
    /**
     * Will fetch all property of a node and store in the cache
     * @param path
     */
    FETCHALL(path: string, callback: (path: string, property: string, value: string) => void): Promise<void>;
    /**
     * It will OPEN a node and watch for changing data
     * @param path      path to the node
     * @param callback  callback function will notified about changes
     * @param rule  optional. you can watch property and also a value if you like. Examples: SignalPresent,  SignalPresent=false, ...
     * @param count optional. After calling the callback count times, the subscription will be closed automatically
     * @returns Promise rejects on failure. Promise return an ID number, which can be used for removing the watch entry later.
     */
    OPEN(path: string, callback: (path: string, property: string, value: string) => void, rule?: string, count?: number): Promise<number>;
    /**
     * Closes a subscription by ID
     * @param subscriptionId The ID of the subscription (returned by OPEN call) or the callback function
     * @returns
     */
    CLOSE(subscriptionId: any): Promise<void>;
    /**
     * Closes the connection
     */
    close(): void;
    /**
     * Returns with a promise that will be fulfilled when there are no more pending tasks. (ie. outgoing fifo is empty, all commands were answered)
     */
    sync(): Promise<void>;
}
export {};
