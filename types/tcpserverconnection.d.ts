/// <reference types="node" />
/// <reference types="node" />
import { Socket, Server } from 'net';
import { EventEmitter } from 'node:events';
interface ServerSocket {
    socket: Socket;
    drained: boolean;
    inputbuffer: string;
    outputbuffer: string[];
}
export declare class TcpServerConnection extends EventEmitter {
    server: Server;
    sockets: {
        [id: number]: ServerSocket;
    };
    socketcount: number;
    frameLimiter: string;
    constructor(port: number);
    private serverClose;
    private serverListen;
    private serverError;
    private serverConnection;
    /**
     * Write a string to the socket. Please don't write small chunks, as Naggle algorithm is disabled. Write at least full lines / messages instead of charachters!
     * @param socketId  The socket ID
     * @param msg
     * @returns
     */
    write(socketId: number, msg: string): void;
    close(): void;
    getConnectionCount(): number;
}
export {};
