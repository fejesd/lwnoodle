import { EventEmitter } from 'ws';

export declare interface ServerConnection extends EventEmitter {
  on(event: 'listening' | 'serverclose', listener: (server: ServerConnection) => void): this;
  on(event: 'error', listener: (server: ServerConnection, e: Error) => void): this;
  on(event: 'connect' | 'close', listener: (server: ServerConnection, socketId: string) => void): this;
  on(event: 'socketerror', listener: (server: ServerConnection, socketId: string, e: Error) => void): this;
  on(event: 'frame', listener: (server: ServerConnection, socketId: string, msg: string) => void): this;

  name(): string;
  write(socketId: string, msg: string): void;
  close(): void;
  getConnectionCount(): number;
}
