import { TcpClientConnection } from '../tcpclientconnection';
import { TcpServerConnection } from '../tcpserverconnection';
import Debug from 'debug';

Debug.enable('TcpClientConnection,TcpServerConnection');

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

test('Single connection', async () => {
  const server = new TcpServerConnection(6107);
  await sleep(500);
  const client = new TcpClientConnection('127.0.0.1', 6107);
  await sleep(500);
  expect(client.isConnected()).toBe(true);
  client.close();
  server.close();
  await sleep(500);
  expect(client.isConnected()).toBe(false);
});

test('Multiple connection', async () => {
  const server = new TcpServerConnection(6107);
  await sleep(500);
  const client1 = new TcpClientConnection('127.0.0.1', 6107);
  const client2 = new TcpClientConnection('127.0.0.1', 6107);
  const client3 = new TcpClientConnection('127.0.0.1', 6107);
  await sleep(500);
  expect(server.getConnectionCount()).toBe(3);
  client1.close();
  await sleep(500);
  expect(server.getConnectionCount()).toBe(2);
  client3.close();
  await sleep(500);
  expect(server.getConnectionCount()).toBe(1);
  client2.close();
  await sleep(500);
  expect(server.getConnectionCount()).toBe(0);
  server.close();
  await sleep(500);
});

test('Sending message in both ways', async () => {
  let msg: any[][] = [];
  const server = new TcpServerConnection(6107);
  server.on('frame', (id, data) => {
    msg.push([id, data]);
  });
  await sleep(500);
  const client1 = new TcpClientConnection('127.0.0.1', 6107);
  await sleep(500);
  client1.write('Hello world!\nTest');
  client1.write(' this\nuncompleted');
  await sleep(500);
  expect(msg.length).toBe(2);
  expect(msg[0][1]).toBe('Hello world!');
  expect(msg[1][1]).toBe('Test this');
  msg = [];
  client1.on('frame', (data) => {
    msg.push([0, data]);
  });
  server.write(1, 'Hello!\nTada');
  server.write(1, '\nhey');
  await sleep(500);
  expect(msg.length).toBe(2);
  expect(msg[0][1]).toBe('Hello!');
  expect(msg[1][1]).toBe('Tada');
  client1.close();
  server.close();
  await sleep(500);
});
