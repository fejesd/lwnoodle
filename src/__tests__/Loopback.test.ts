import { beforeEach, test, expect, jest } from '@jest/globals';
import * as noodle from '../index';
import { LwServer } from '../lwserver';
import { LwClient } from '../lwclient';
import { LoopbackServerConnection } from '../loopbackserverconnection';
import { LoopbackClientConnection } from '../loopbackclientconnection';
import Debug from 'debug';
import { sleep, waitForAnEvent, waitLinesRcv } from './helpers';
const debug = Debug('Test');

beforeEach(() => {
  debug('');
  debug('=======' + expect.getState().currentTestName + '=======');
  debug('');
});

//
// transport level
//

test('Loopback connection: connect, frames in both directions, close', async () => {
  const server = new LoopbackServerConnection('test');
  await waitForAnEvent(server, 'listening', debug);
  expect(server.type()).toBe('loopback');
  expect(server.name()).toBe('Loopback test');

  const serverFrames: string[] = [];
  server.on('frame', (s, socketId, msg) => serverFrames.push(msg));
  let socketId = '';
  server.on('connect', (s, id) => (socketId = id));

  const client = server.connect();
  expect(client.isConnected()).toBe(false); // connection is asynchronous, like a socket
  await waitForAnEvent(client, 'connect', debug);
  expect(client.isConnected()).toBe(true);
  expect(server.getConnectionCount()).toBe(1);

  // frames are split by the delimiter, partial lines are buffered, \r is stripped
  client.write('GET /A');
  client.write('.B\r\nGET /C\nGET');
  await sleep(10);
  expect(serverFrames).toStrictEqual(['GET /A.B', 'GET /C']);

  const clientFrames: string[] = [];
  client.on('frame', (msg) => clientFrames.push(msg));
  server.write(socketId, 'pr /A.B=1\r\n');
  server.write(socketId, 'pr /C.D');
  server.write(socketId, '=2\n');
  await waitLinesRcv(client, 2);
  expect(clientFrames).toStrictEqual(['pr /A.B=1', 'pr /C.D=2']);

  client.close();
  await waitForAnEvent(client, 'close', debug);
  expect(client.isConnected()).toBe(false);
  expect(server.getConnectionCount()).toBe(0);
  client.write('GET /X\n'); // discarded silently
  server.close();
  await waitForAnEvent(server, 'serverclose', debug);
});

test('Loopback connection: broadcast write and multiple clients', async () => {
  const server = new LoopbackServerConnection();
  const c1 = server.connect();
  const c2 = server.connect();
  await Promise.all([waitForAnEvent(c1, 'connect', debug), waitForAnEvent(c2, 'connect', debug)]);
  expect(server.getConnectionCount()).toBe(2);
  const p = Promise.all([waitLinesRcv(c1, 1), waitLinesRcv(c2, 1)]);
  server.write('', 'hello\n');
  await p;
  c1.close();
  c2.close();
  server.close();
  await waitForAnEvent(server, 'serverclose', debug);
});

test('Loopback connection: closing the server drops the clients, they do not reconnect to a closed server', async () => {
  const server = new LoopbackServerConnection();
  const client = server.connect();
  client.setRetryTimeout(10);
  await waitForAnEvent(client, 'connect', debug);
  server.close();
  await waitForAnEvent(client, 'close', debug);
  expect(client.isConnected()).toBe(false);
  expect(server.isListening()).toBe(false);
  await sleep(50); // a few retries
  expect(client.isConnected()).toBe(false);
  expect(server.getConnectionCount()).toBe(0);
  client.close(); // stops retrying
});

test('Loopback connection: reopen after close', async () => {
  const server = new LoopbackServerConnection();
  const client = server.connect();
  await waitForAnEvent(client, 'connect', debug);
  client.close();
  await waitForAnEvent(client, 'close', debug);
  client.reopen();
  await waitForAnEvent(client, 'connect', debug);
  expect(server.getConnectionCount()).toBe(1);
  client.close();
  server.close();
});

//
// protocol level
//

test('LwServer and LwClient over loopback', async () => {
  const lwserver = new LwServer({ type: 'loopback', name: 'lb' });
  expect(lwserver.server[0]).toBeInstanceOf(LoopbackServerConnection);
  lwserver.root.TEST.NODE.Prop = 'abc';
  const connection = (lwserver.server[0] as LoopbackServerConnection).connect();
  const lwclient = new LwClient(connection);
  await waitForAnEvent(lwclient, 'connect', debug);
  expect(await lwclient.GET('/TEST/NODE.Prop')).toBe('abc');
  await lwclient.SET('/TEST/NODE.Prop', 'def');
  expect(lwserver.root.TEST.NODE.Prop).toBe('def');
  lwclient.close();
  lwserver.close();
});

test('noodleServer / noodleClient with loopback type', async () => {
  const server = noodle.noodleServer({ type: 'loopback' });
  expect(server.server[0].type()).toBe('loopback');
  server.TEST.NODE.Test = 123;
  server.TEST.NODE.add = ((a: number, b: number) => a + b) as any;

  const client = noodle.noodleClient({ type: 'loopback', server });
  await client.__connect__();
  expect(await client.TEST.NODE.Test).toBe(123);
  expect(await client.TEST.NODE.add(2, 3)).toBe('5');

  // subscriptions: changes on the server are delivered to the client
  const changes: string[] = [];
  await client.TEST.NODE.on('Test', (path: string, property: string, value: any) => changes.push(`${path}.${property}=${value}`));
  const waiter = client.TEST.NODE.waitFor('Test=456');
  server.TEST.NODE.Test = 456;
  await waiter;
  expect(changes).toStrictEqual(['/TEST/NODE.Test=456']);

  // set from the client
  client.TEST.NODE.Test = '789'; // note: the client side escape() expects a string
  await client.__sync__();
  expect(server.TEST.NODE.Test).toBe(789);

  client.__close__();
  server.__close__();
  await waitForAnEvent(server.server[0] as any, 'serverclose', debug);
});

test('noodleClient loopback type accepts a LoopbackServerConnection as server', async () => {
  const server = noodle.noodleServer({ type: 'loopback' });
  server.A.Bb = 1;
  const client = noodle.noodleClient({ type: 'loopback', server: server.server[0] as LoopbackServerConnection });
  await client.__connect__();
  expect(await client.A.Bb).toBe(1);
  client.__close__();
  server.__close__();
});

test('noodleClient loopback type needs a server with loopback transport', () => {
  expect(() => noodle.noodleClient({ type: 'loopback' })).toThrow();
  expect(() => noodle.noodleClient({ type: 'foo' as any })).toThrow();
});

test('custom transports can be injected on both sides', async () => {
  const transport = new LoopbackServerConnection('custom');
  const server = noodle.noodleServer({ connection: transport });
  expect(server.server[0]).toBe(transport);
  server.X.Yy = 'z';
  const clientTransport = transport.connect();
  const client = noodle.noodleClient({ connection: clientTransport });
  expect(client.lwclient.connection).toBe(clientTransport);
  await client.__connect__();
  expect(await client.X.Yy).toBe('z');
  client.__close__();
  server.__close__();
});

test('loopback server can be combined with other transports', async () => {
  const server = noodle.noodleServer([{ type: 'loopback' }, { type: 'tcp', port: 6107 }]);
  await waitForAnEvent(server.server[1] as any, 'listening', debug);
  server.A.Bb = 'shared';
  const lbclient = noodle.noodleClient({ type: 'loopback', server });
  const tcpclient = noodle.noodleClient({ type: 'tcp', port: 6107 });
  await lbclient.__connect__();
  await tcpclient.__connect__();
  expect(await lbclient.A.Bb).toBe('shared');
  expect(await tcpclient.A.Bb).toBe('shared');
  lbclient.__close__();
  tcpclient.__close__();
  server.__close__();
  await waitForAnEvent(server.server[1] as any, 'serverclose', debug);
});

//
// lazy loading of the Node.js specific transports
//

test('loopback transport works without the Node.js specific transport modules', async () => {
  const fail = (name: string) => () => {
    throw new Error(`${name} must not be loaded`);
  };
  let result: any;
  jest.isolateModules(() => {
    jest.doMock('net', fail('net'));
    jest.doMock('ws', fail('ws'));
    jest.doMock('https', fail('https'));
    jest.doMock('../tcpserverconnection', fail('tcpserverconnection'));
    jest.doMock('../tcpclientconnection', fail('tcpclientconnection'));
    jest.doMock('../wsserverconnection', fail('wsserverconnection'));
    jest.doMock('../wsclientconnection', fail('wsclientconnection'));
    const isolated = require('../index');
    const server = isolated.noodleServer({ type: 'loopback' });
    server.LAZY.Test = 42;
    const client = isolated.noodleClient({ type: 'loopback', server });
    result = { server, client };
    // a TCP server would need the mocked module
    expect(() => isolated.noodleServer({ type: 'tcp', port: 6108 })).toThrow('tcpserverconnection must not be loaded');
  });
  await result.client.__connect__();
  expect(await result.client.LAZY.Test).toBe(42);
  result.client.__close__();
  result.server.__close__();
  jest.dontMock('net');
  jest.dontMock('ws');
  jest.dontMock('https');
});
