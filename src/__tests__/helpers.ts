import { EventEmitter } from 'node:events';

/**
 * Will wait for an eventName event on obj object. It will reject if timeout has been reached.
 * @param obj
 * @param eventName
 * @param count
 * @param timeout
 * @returns
 */
 export async function waitForAnEvent(
    obj: EventEmitter,
    eventName: string,
    debug: any,
    count: number = 1,
    timeout: number = 1000,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        obj.removeAllListeners(eventName);
        debug(`Timeout... no ${eventName} event was received`);
        reject();
      }, timeout);
      obj.on(eventName, () => {
        if (--count === 0) {
          clearTimeout(timer);
          obj.removeAllListeners(eventName);
          resolve();
        }
      });
    });
  }

  export function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }