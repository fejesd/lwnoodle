import { EventEmitter } from 'ws';

export declare interface ServerConnection extends EventEmitter {
  on(event: 'listening' | 'serverclose', listener: () => void): this;
  on(event: 'error', listener: (e: Error) => void): this;
  on(event: 'connect' | 'close', listener: (socketId: number) => void): this;
  on(event: 'socketerror', listener: (socketId: number, e: Error) => void): this;
  on(event: 'frame', listener: (socketId: number, msg: string) => void): this;

  write(socketId: number, msg: string): void;
  close(): void;
  getConnectionCount(): number;
}
