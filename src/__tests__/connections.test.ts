import * as noodle from '../index';
import Debug from 'debug';
import { sleep, waitForAnEvent, waitLinesRcv } from './helpers';
import { obj2fun } from '../common';
import { readFileSync } from 'fs';
const debug = Debug('Test');

beforeEach(() => {
  debug('');
  debug('=======' + expect.getState().currentTestName + '=======');
  debug('');
});

test('Simple TCP connection', async () => {
  const server = noodle.noodleServer({ port: 6107 });
  await waitForAnEvent(server.server[0] as any, 'listening', debug);
  const client = noodle.noodleClient();
  await waitForAnEvent(server.server[0] as any, 'connect', debug);
  await client.__connect__();

  expect(server.server[0].type()).toBe('tcp');

  server.TEST.NODE.Test = 123 as any;
  expect(await client.TEST.NODE.Test).toBe(123);

  client.__close__();
  server.__close__();
  debug('wait server to close');
  await waitForAnEvent(server.server[0] as any, 'serverclose', debug);
  await waitForAnEvent(server.server[0] as any, 'close', debug);
  debug('server closed');
});

test('Simple simple websocket connection', async () => {
  const server = noodle.noodleServer({ port: 6107, type: 'ws' });
  await waitForAnEvent(server.server[0] as any, 'listening', debug);
  const client = noodle.noodleClient({ type: 'ws' });
  await waitForAnEvent(server.server[0] as any, 'connect', debug);
  await client.__connect__();

  expect(server.server[0].type()).toBe('ws');

  server.TEST.NODE.Test = 123 as any;
  expect(await client.TEST.NODE.Test).toBe(123);

  client.__close__();
  server.__close__();
  debug('wait server to close');
  await waitForAnEvent(server.server[0] as any, 'serverclose', debug);
  await waitForAnEvent(server.server[0] as any, 'close', debug);
  debug('server closed');
});


test('Secure websocket connection', async () => {    
    const server = noodle.noodleServer({ port: 6107 , type: 'wss', key: readFileSync('src/__tests__/certs/key.pem'), cert: readFileSync('src/__tests__/certs/cert.pem')});
    await waitForAnEvent(server.server[0] as any, 'listening', debug);
    const client = noodle.noodleClient({ type: 'wss', rejectUnauthorized: false});
    await waitForAnEvent(server.server[0] as any, 'connect', debug);
    await client.__connect__();

    expect(server.server[0].type()).toBe('wss');

    server.TEST.NODE.Test = 123 as any;
    expect(await client.TEST.NODE.Test).toBe(123);

    client.__close__();    
    server.__close__();
    debug('wait server to close');
    await waitForAnEvent(server.server[0] as any, 'serverclose', debug);
    await waitForAnEvent(server.server[0] as any, 'close', debug);
    debug('server closed');
});

