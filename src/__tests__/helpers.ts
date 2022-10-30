import { EventEmitter } from 'node:events';
import { ClientConnection } from '../clientconnection';

/**
 * Will wait for an eventName event on obj object. It will reject if timeout has been reached.
 * @param obj
 * @param eventName
 * @param count
 * @param timeout
 * @returns
 */
export async function waitForAnEvent(obj: EventEmitter, eventName: string, debug: any, count: number = 1, timeout: number = 1000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      obj.removeAllListeners(eventName);
      debug(`Timeout... no ${eventName} event was received`);
      reject('timeout');
    }, timeout);
    const handler = () => {
      if (--count === 0) {
        clearTimeout(timer);
        obj.removeListener(eventName, handler);
        resolve();
      }
    };
    obj.on(eventName, handler);
  });
}

export function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function waitLinesRcv(c: ClientConnection, cnt: number): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    let n = 0;
    const handler = () => {
      n++;
      if (n === cnt) {
        c.removeListener('frame', handler);
        resolve();
      }
    };
    c.on('frame', handler);
  });
}
