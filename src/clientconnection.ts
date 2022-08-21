import { EventEmitter } from 'node:events';

export abstract class ClientConnection extends EventEmitter {
  abstract write(msg: string): void;
  abstract setRetryTimeout(timeout: number): void;
  abstract setFrameDelimiter(delimiter: string): void;
  abstract isConnected(): boolean;
  abstract close(): void;
  abstract reopen(): void;
}
