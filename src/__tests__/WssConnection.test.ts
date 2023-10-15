import { WsClientConnection } from '../wsclientconnection';
import { WsServerConnection } from '../wsserverconnection';
import Debug from 'debug';
import { sleep, waitForAnEvent } from './helpers';
const debug = Debug('Test');
import { readFileSync } from 'fs';

Debug.enable('WsClientConnection,WsServerConnection,Test');

beforeEach(() => {
  debug('');
  debug('=======' + expect.getState().currentTestName + '=======');
  debug('');
});

test('Single wss connection without identification', async () => {
  console.log(process.cwd());
  const server = new WsServerConnection({
    port: 6107,
    host: 'localhost',
    secure: true,
    key: readFileSync('src/__tests__/certs/key.pem'),
    cert: readFileSync('src/__tests__/certs/cert.pem'),
  });
  await waitForAnEvent(server, 'listening', debug);
  const client = new WsClientConnection({ host: 'localhost', port: 6107, secure: true, rejectUnauthorized: false });
  await waitForAnEvent(client, 'connect', debug);
  expect(client.isConnected()).toBe(true);
  client.close();
  await waitForAnEvent(client, 'close', debug);
  server.close();
  await waitForAnEvent(server, 'serverclose', debug);
});

test('Single wss connection with basic authentication', async () => {
  const server = new WsServerConnection({
    port: 6107,
    host: 'localhost',
    secure: true,
    key: readFileSync('src/__tests__/certs/key.pem'),
    cert: readFileSync('src/__tests__/certs/cert.pem'),
    auth: (username, password) => {
      return username === 'user' && password === 'pass';
    },
  });
  // test connection without authentication
  await waitForAnEvent(server, 'listening', debug);
  var client = new WsClientConnection({ host: 'localhost', port: 6107, secure: true, rejectUnauthorized: false });
  client.on('error', (err) => {});
  await waitForAnEvent(client, 'error', debug);
  expect(client.isConnected()).toBe(false);
  client.close();

  // test connection with wrong authentication
  var client = new WsClientConnection({ host: 'localhost', port: 6107, secure: true, rejectUnauthorized: false, username: 'user', password: 'wrong' });
  client.on('error', (err) => {});
  await waitForAnEvent(client, 'error', debug);
  expect(client.isConnected()).toBe(false);
  client.close();

  // test connection with correct authentication
  var client = new WsClientConnection({ host: 'localhost', port: 6107, secure: true, rejectUnauthorized: false, username: 'user', password: 'pass' });
  await waitForAnEvent(client, 'connect', debug);
  expect(client.isConnected()).toBe(true);
  client.close();
  await waitForAnEvent(client, 'close', debug);
  server.close();
  await waitForAnEvent(server, 'serverclose', debug);
});

/*
test('Multiple wss connection', async () => {
  const server = new WsServerConnection({
    port: 6107,
    host: 'localhost',
    secure: true,
    key: readFileSync('src/__tests__/certs/key.pem'),
    cert: readFileSync('src/__tests__/certs/cert.pem'),
  });
  await waitForAnEvent(server, 'listening', debug);
  const client1 = new WsClientConnection({ host: 'localhost', port: 6107, secure: true, rejectUnauthorized: false });
  await waitForAnEvent(client1, 'connect', debug);
  const client2 = new WsClientConnection({ host: 'localhost', port: 6107, secure: true, rejectUnauthorized: false });
  await waitForAnEvent(client2, 'connect', debug);
  const client3 = new WsClientConnection({ host: 'localhost', port: 6107, secure: true, rejectUnauthorized: false });
  await waitForAnEvent(client3, 'connect', debug);
  while (server.getConnectionCount() < 3) await waitForAnEvent(server, 'connect', debug);
  expect(server.getConnectionCount()).toBe(3);
  client1.close();
  await waitForAnEvent(server, 'close', debug);
  expect(server.getConnectionCount()).toBe(2);

  client3.close();
  await waitForAnEvent(server, 'close', debug);
  expect(server.getConnectionCount()).toBe(1);

  client2.close();
  await waitForAnEvent(server, 'close', debug);
  expect(server.getConnectionCount()).toBe(0);

  server.close();
  await waitForAnEvent(server, 'serverclose', debug);
});

test('Sending message in both ways on a wss connection', async () => {
  let msg: any[][] = [];
  const server = new WsServerConnection({
    port: 6107,
    host: 'localhost',
    secure: true,
    key: readFileSync('src/__tests__/certs/key.pem'),
    cert: readFileSync('src/__tests__/certs/cert.pem'),
  });

  await waitForAnEvent(server, 'listening', debug);
  server.on('frame', (server, id, data) => {
    msg.push([id, data]);
  });
  const client1 = new WsClientConnection({ host: 'localhost', port: 6107, secure: true, rejectUnauthorized: false });
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
  server.write(Object.keys(server.sockets)[0], 'Hello!\nTada');
  server.write(Object.keys(server.sockets)[0], '\nhey');
  await waitForAnEvent(client1, 'frame', debug, 2);
  expect(msg.length).toBe(2);
  expect(msg[0][1]).toBe('Hello!');
  expect(msg[1][1]).toBe('Tada');
  client1.close();
  server.close();
  await waitForAnEvent(server, 'serverclose', debug);
});
*/