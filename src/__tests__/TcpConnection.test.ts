import { TcpClientConnection } from '../tcpclientconnection';
import { TcpServerConnection } from '../tcpserverconnection';
import { EventEmitter } from 'node:events';
import Debug from 'debug';
const debug = Debug('Test');

Debug.enable('TcpClientConnection,TcpServerConnection,Test');

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Will wait for an eventName event on obj object. It will reject if timeout has been reached.
 * @param obj
 * @param eventName
 * @param count
 * @param timeout
 * @returns
 */
async function waitForAnEvent(
  obj: EventEmitter,
  eventName: string,
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

beforeEach(() => {
  debug('');
  debug('=======' + expect.getState().currentTestName + '=======');
  debug('');
});

afterEach(async () => {
  await sleep(100); // jest fails exiting sometimes without this, as the fd for server socket needs some time to release. Todo: find a better workaround.
});

test('Single connection', async () => {
  const server = new TcpServerConnection(6107);
  await waitForAnEvent(server, 'listening');
  const client = new TcpClientConnection('127.0.0.1', 6107);
  await waitForAnEvent(client, 'connect');
  expect(client.isConnected()).toBe(true);
  client.close();
  await waitForAnEvent(client, 'close');
  server.close();
  await waitForAnEvent(server, 'close');
});

test('Multiple connection', async () => {
  const server = new TcpServerConnection(6107);
  await waitForAnEvent(server, 'listening');
  const client1 = new TcpClientConnection('127.0.0.1', 6107);
  await waitForAnEvent(client1, 'connect');
  const client2 = new TcpClientConnection('127.0.0.1', 6107);
  await waitForAnEvent(client2, 'connect');
  const client3 = new TcpClientConnection('127.0.0.1', 6107);
  await waitForAnEvent(client3, 'connect');
  while (server.getConnectionCount() < 3) await waitForAnEvent(server, 'connect');
  expect(server.getConnectionCount()).toBe(3);
  client1.close();
  await waitForAnEvent(client1, 'close');
  expect(server.getConnectionCount()).toBe(2);

  client3.close();
  await waitForAnEvent(client3, 'close');
  expect(server.getConnectionCount()).toBe(1);

  client2.close();
  await waitForAnEvent(client2, 'close');
  expect(server.getConnectionCount()).toBe(0);

  server.close();
  await waitForAnEvent(server, 'close');
});

test('Sending message in both ways', async () => {
  let msg: any[][] = [];
  const server = new TcpServerConnection(6107);

  await waitForAnEvent(server, 'listening');
  server.on('frame', (id, data) => {
    msg.push([id, data]);
  });
  const client1 = new TcpClientConnection('127.0.0.1', 6107);
  await waitForAnEvent(client1, 'connect');
  client1.write('Hello world!\nTest');
  client1.write(' this\nuncompleted');
  await waitForAnEvent(server, 'frame', 2);
  expect(msg.length).toBe(2);
  expect(msg[0][1]).toBe('Hello world!');
  expect(msg[1][1]).toBe('Test this');
  msg = [];
  client1.on('frame', (data) => {
    msg.push([0, data]);
  });
  server.write(1, 'Hello!\nTada');
  server.write(1, '\nhey');
  await waitForAnEvent(client1, 'frame', 2);
  expect(msg.length).toBe(2);
  expect(msg[0][1]).toBe('Hello!');
  expect(msg[1][1]).toBe('Tada');
  client1.close();
  server.close();
  await waitForAnEvent(server, 'close');
});
