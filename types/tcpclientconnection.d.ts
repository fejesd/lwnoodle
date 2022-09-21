import { ClientConnection } from './clientconnection';
/**
 * TcpClientConnection will abstract a tcp/ip raw connection. The class will handle:
 *  - the automatic reconnection, error handling
 *  - buffering the outgoing data until the socket is drained
 *  - split the incoming data into frames (default frame delimiter: \n)
 *  - error handling
 *
 * @event   error
 * @event   connect
 * @event   close
 * @event   frame   Fires when a new complete frame has been arrived. Parameter is the frame.
 */
export declare class TcpClientConnection extends ClientConnection {
    host: string;
    port: number;
    connected: boolean;
    connecting: boolean;
    private shutdown;
    private drained;
    private socket;
    private connectionRetryTimeout;
    private inputbuffer;
    private outputbuffer;
    private frameLimiter;
    constructor(host?: string, port?: number);
    private socketError;
    private socketClosed;
    private socketConnected;
    private socketDrained;
    private socketData;
    private startConnect;
    /**
     * Write a string to the socket. Please don't write small chunks, as Naggle algorithm is disabled. Write at least full lines / messages instead of charachters!
     * @param msg
     * @returns
     */
    write(msg: string): void;
    /**
     * Sets the timeout for attempting re-connection after an error
     * @param timeout msec
     */
    setRetryTimeout(timeout: number): void;
    /**
     * Sets the frame delimiter string
     * @param delimiter Default: '\n'
     */
    setFrameDelimiter(delimiter: string): void;
    /**
     * Is socket connected?
     */
    isConnected(): boolean;
    /**
     * Close the socket
     */
    close(): void;
    /**
     * Reopen a closed socket
     */
    reopen(): void;
}
