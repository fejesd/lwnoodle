import { TcpClientConnection } from '../tcpclientconnection';
import { TcpServerConnection } from '../tcpserverconnection';
import Debug from 'debug';
import { sleep, waitForAnEvent } from './helpers';
const debug = Debug('Test');

Debug.enable('TcpClientConnection,TcpServerConnection,Test');

beforeEach(() => {
  debug('');
  debug('=======' + expect.getState().currentTestName + '=======');
  debug('');
});

afterEach(async () => {
  await sleep(200); // jest fails exiting sometimes without this, as the fd for server socket needs some time to release. Todo: find a better workaround.
});

test('Single connection', async () => {
  const server = new TcpServerConnection(6107);
  await waitForAnEvent(server, 'listening', debug);
  const client = new TcpClientConnection('localhost', 6107);
  await waitForAnEvent(client, 'connect', debug);
  expect(client.isConnected()).toBe(true);
  client.close();
  await waitForAnEvent(client, 'close', debug);
  server.close();
  await waitForAnEvent(server, 'close', debug);
});

test('Multiple connection', async () => {
  const server = new TcpServerConnection(6107);
  await waitForAnEvent(server, 'listening', debug);
  const client1 = new TcpClientConnection('localhost', 6107);
  await waitForAnEvent(client1, 'connect', debug);
  const client2 = new TcpClientConnection('localhost', 6107);
  await waitForAnEvent(client2, 'connect', debug);
  const client3 = new TcpClientConnection('localhost', 6107);
  await waitForAnEvent(client3, 'connect', debug);
  while (server.getConnectionCount() < 3) await waitForAnEvent(server, 'connect', debug);
  expect(server.getConnectionCount()).toBe(3);
  client1.close();
  await waitForAnEvent(client1, 'close', debug);
  expect(server.getConnectionCount()).toBe(2);

  client3.close();
  await waitForAnEvent(client3, 'close', debug);
  expect(server.getConnectionCount()).toBe(1);

  client2.close();
  await waitForAnEvent(client2, 'close', debug);
  expect(server.getConnectionCount()).toBe(0);

  server.close();
  await waitForAnEvent(server, 'close', debug);
});

test('Sending message in both ways', async () => {
  let msg: any[][] = [];
  const server = new TcpServerConnection(6107);

  await waitForAnEvent(server, 'listening', debug);
  server.on('frame', (id, data) => {
    msg.push([id, data]);
  });
  const client1 = new TcpClientConnection('localhost', 6107);
  await waitForAnEvent(client1, 'connect', debug);
  client1.write('Hello world!\nTest');
  client1.write(' this\nuncompleted');
  await waitForAnEvent(server, 'frame', debug, 2);
  expect(msg.length).toBe(2);
  expect(msg[0][1]).toBe('Hello world!');
  expect(msg[1][1]).toBe('Test this');
  msg = [];
  client1.on('frame', (data) => {
    msg.push([0, data]);
  });
  server.write(1, 'Hello!\nTada');
  server.write(1, '\nhey');
  await waitForAnEvent(client1, 'frame', debug, 2);
  expect(msg.length).toBe(2);
  expect(msg[0][1]).toBe('Hello!');
  expect(msg[1][1]).toBe('Tada');
  client1.close();
  server.close();
  await waitForAnEvent(server, 'close', debug);
});
