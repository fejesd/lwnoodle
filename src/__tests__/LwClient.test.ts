import { LwClient } from '../lwclient';
import { TcpServerConnection } from '../tcpserverconnection';
import { escape, unescape } from '../escaping';
import { sleep, waitForAnEvent, waitLinesRcv } from './helpers';
import { TcpClientConnection } from '../tcpclientconnection';
import Debug from 'debug';
const debug = Debug('Test');

Debug.enable('TcpServerConnection,Test,LwClient');

let server: TcpServerConnection;
let client: LwClient;
let expectedMessage: string;
let mockedResponse: string;
let receivedMessage: string;

beforeAll(async () => {
  server = new TcpServerConnection(6107);
  await waitForAnEvent(server, 'listening', debug);
  client = new LwClient(new TcpClientConnection());
  await waitForAnEvent(client, 'connect', debug);
  server.on('frame', (server, id, data) => {
    if (!expectedMessage) return;
    const parts = data.split('#');
    receivedMessage = parts[1];
    expect(parts[1]).toBe(expectedMessage);
    if (mockedResponse.length) server.write(id, '{' + parts[0] + '\n' + mockedResponse + '\n}\n');
  });
});

afterAll(async () => {
  client.close();
  server.close();
  debug('wait server to close');
  await waitForAnEvent(server, 'serverclose', debug);
  debug('server closed');
});

beforeEach(() => {
  debug('');
  debug('=======' + expect.getState().currentTestName + '=======');
  debug('');
});

test('GET should perform the lw command and return with the result', async () => {
  const testbenches = [
    ['/TEST/NODE.property', 'pr /TEST/NODE.property=test\\nvalue', 'test\nvalue'],
    ['/TEST/NODE.property', 'pw /TEST/NODE.property=test\\tvalue', 'test\tvalue'],
    ['/TEST/NODE.property', 'pw /TEST/NODE.property=true', true],
    ['/TEST/NODE.property', 'pw /TEST/NODE.property=5', 5],
    ['/TEST/NODE.property', 'pw /TEST/NODE.property=5.42', 5.42],
    ['/TEST/NODE.property', 'pw /TEST/NODE.property=true;false;1;2;3;O1', [true, false, 1, 2, 3, 'O1']],
    ['/TEST/NODE.property', 'pw /TEST/NODE.property', undefined],
    ['/TEST/NODE.property', 'aw /TEST/NODE.property=5', undefined],
    ['/TEST/NODE.property', '', undefined],
    ['/TEST/NODE.property', 'qwert\nwertz', undefined],
  ];

  for (const testbench of testbenches) {
    try {
      expectedMessage = 'GET ' + testbench[0];
      mockedResponse = testbench[1] as string;
      const test = await client.GET(testbench[0] as string);
      expect(test).toStrictEqual(testbench[2]);
    } catch (err) {
      expect(testbench[2]).toBe(undefined);
    }
  }
});

test('GET should return with the cached properties immediately', async () => {
  expectedMessage = 'OPEN /TEST/NODE';
  mockedResponse = 'o- /TEST/NODE';
  const tid = await client.OPEN('/TEST/NODE', (path, property, value) => {
    /* */
  });
  expect(receivedMessage).toBe(expectedMessage);

  server.write('', 'CHG /TEST/NODE.test1=some\\nvalue\r\n');
  server.write('', 'CHG /TEST/NODE.SignalPresent=true\r\n');
  server.write('', 'CHG /TEST/NODE.SignalPresent2=2\r\n');
  await waitLinesRcv(client.connection, 3);

  // test for cache hits
  expect(await client.GET('/TEST/NODE.test1')).toBe('some\nvalue');
  expect(await client.GET('/TEST/NODE.SignalPresent')).toBe(true);
  expect(await client.GET('/TEST/NODE.SignalPresent2')).toBe(2);

  // test for cache miss

  expectedMessage = 'GET /TEST/NODE.uncached';
  mockedResponse = 'pr /TEST/NODE.uncached=great';
  expect(await client.GET('/TEST/NODE.uncached')).toBe('great');

  // test for cached GETted property hit
  expectedMessage = '';
  mockedResponse = '';
  expect(await client.GET('/TEST/NODE.uncached')).toBe('great');

  // close node
  expectedMessage = 'CLOSE /TEST/NODE';
  mockedResponse = 'c- /TEST/NODE';
  await client.CLOSE(tid);
  expect(receivedMessage).toBe(expectedMessage);

  // test for invalidated cache after close
  expectedMessage = 'GET /TEST/NODE.uncached';
  mockedResponse = 'pr /TEST/NODE.uncached=question';
  expect(await client.GET('/TEST/NODE.uncached')).toBe('question');
});

test('CALL', async () => {
  const testbenches = [
    ['/TEST/NODE:method', '', 'mO /TEST/NODE:method=All right', 'All right'],
    ['/TEST/NODE:method', '', 'mO /TEST/NODE:method', ''],
    ['/TEST/NODE:method', 'Sample;Parameter', 'mO /TEST/NODE:method=All right', 'All right'],
    ['/TEST/NODE:method', 'Sample\nParameter', 'mO /TEST/NODE:method=All right', 'All right'],
    ['/TEST/NODE:method', 'Sample;Parameter', 'mE /TEST/NODE:method=%E007 Access denied', undefined, '%E007 Access denied'],
    ['/TEST/NODE:method', 'Sample;Parameter', 'pR /TEST/NODE.method=ok', undefined, undefined],
    ['/TEST/NODE:method', 'Sample;Parameter', '', undefined, undefined],
    ['/TEST/NODE:method', 'Sample;Parameter', 'syntaxerr\n\nssad', undefined, undefined],
  ];

  for (const testbench of testbenches) {
    try {
      expectedMessage = 'CALL ' + testbench[0] + '(' + escape(testbench[1] as string) + ')';
      mockedResponse = testbench[2] as string;
      const test = await client.CALL(testbench[0] as string, testbench[1] as string);
      expect(test).toStrictEqual(testbench[3]);
    } catch (err) {
      debug(err);
      expect(testbench[3]).toBe(undefined);
      if (testbench[4]) expect((err as Error).toString()).toBe('Error: ' + testbench[4]);
    }
  }
});

test('SET', async () => {
  const testbenches = [
    ['/TEST/NODE.property', 'value', 'pw /TEST/NODE.property=value', true], // todo: add error branches
  ];

  for (const testbench of testbenches) {
    try {
      expectedMessage = 'SET ' + testbench[0] + '=' + escape(testbench[1] as string);
      mockedResponse = testbench[2] as string;
      await client.SET(testbench[0] as string, testbench[1] as string);
      expect(testbench[3]).toStrictEqual(true);
    } catch (err) {
      expect(testbench[3]).toBe(false);
    }
  }
});

test('multiple OPEN and CLOSE, handling subscription list', async () => {
  expectedMessage = 'OPEN /TEST/A';
  mockedResponse = 'o- /TEST/A';
  const cb1 = jest.fn();
  const id1 = await client.OPEN('/TEST/A', cb1);

  expectedMessage = '';
  const cb2 = jest.fn();
  const id2 = await client.OPEN('/TEST/A', cb2);

  const cb3 = jest.fn();
  const id3 = await client.OPEN('/TEST/A', cb2, 'testprop');

  expectedMessage = 'OPEN /TEST/B';
  mockedResponse = 'o- /TEST/B';

  const cb4 = jest.fn();
  const id4 = await client.OPEN('/TEST/B', cb2, 'testprop');

  expect(client['subscribers'].length).toBe(4);

  expectedMessage = '';
  await client.CLOSE(id3);
  expect(client['subscribers'].length).toBe(3);

  await client.CLOSE(id2);
  expect(client['subscribers'].length).toBe(2);

  expectedMessage = 'CLOSE /TEST/A';
  mockedResponse = 'c- /TEST/A';
  await client.CLOSE(id1);
  expect(client['subscribers'].length).toBe(1);

  expectedMessage = 'CLOSE /TEST/B';
  mockedResponse = 'c- /TEST/B';
  await client.CLOSE(id4);
  expect(client['subscribers'].length).toBe(0);
});

test('callback is called when CHG was received on an opened node', async () => {
  expectedMessage = 'OPEN /TEST/A';
  mockedResponse = 'o- /TEST/A';
  const cb1 = jest.fn();
  const cb2 = jest.fn();
  const id1 = await client.OPEN('/TEST/A', cb1);
  const id2 = await client.OPEN('/TEST/A', cb2);

  server.write('', 'CHG /TEST/B.test1=somevalue\r\n');
  server.write('', 'CHG /TEST/A.test2=someothervalue\r\n');
  server.write('', 'CHG /TEST/C.test1=somevalue\r\n');
  server.write('', 'CHG /TEST/A.test3=somethirdvalue\r\n');
  await waitLinesRcv(client.connection, 4);

  expect(cb1.mock.calls.length).toBe(2);
  expect(cb1.mock.calls[0][0]).toBe('/TEST/A');
  expect(cb1.mock.calls[0][1]).toBe('test2');
  expect(cb1.mock.calls[0][2]).toBe('someothervalue');
  expect(cb1.mock.calls[1][0]).toBe('/TEST/A');
  expect(cb1.mock.calls[1][1]).toBe('test3');
  expect(cb1.mock.calls[1][2]).toBe('somethirdvalue');

  expect(cb2.mock.calls.length).toBe(2);
  expect(cb2.mock.calls[0][0]).toBe('/TEST/A');
  expect(cb2.mock.calls[0][1]).toBe('test2');
  expect(cb2.mock.calls[0][2]).toBe('someothervalue');
  expect(cb2.mock.calls[1][0]).toBe('/TEST/A');
  expect(cb2.mock.calls[1][1]).toBe('test3');
  expect(cb2.mock.calls[1][2]).toBe('somethirdvalue');

  expectedMessage = 'CLOSE /TEST/A';
  mockedResponse = 'c- /TEST/A';
  await client.CLOSE(id1);
  await client.CLOSE(id2);
});

test('callback is called only when CHG was received on an opened node with a specific property', async () => {
  expectedMessage = 'OPEN /TEST/A';
  mockedResponse = 'o- /TEST/A';
  const cb1 = jest.fn();
  const id1 = await client.OPEN('/TEST/A', cb1, 'SignalPresent');

  server.write('', 'CHG /TEST/A.test1=somevalue\r\n');
  server.write('', 'CHG /TEST/A.SignalPresent=true\r\n');
  server.write('', 'CHG /TEST/A.SignalPresent2=2\r\n');
  await waitLinesRcv(client.connection, 3);

  expect(cb1.mock.calls.length).toBe(1);
  expect(cb1.mock.calls[0][0]).toBe('/TEST/A');
  expect(cb1.mock.calls[0][1]).toBe('SignalPresent');
  expect(cb1.mock.calls[0][2]).toBe(true);

  expectedMessage = 'CLOSE /TEST/A';
  mockedResponse = 'c- /TEST/A';
  await client.CLOSE(id1);
});

test('callback is called only when CHG was received on an opened node with a specific property and value', async () => {
  expectedMessage = 'OPEN /TEST/A';
  mockedResponse = 'o- /TEST/A';
  const cb1 = jest.fn();
  const id1 = await client.OPEN('/TEST/A', cb1, 'SignalPresent=true');

  server.write('', 'CHG /TEST/A.test1=somevalue\r\n');
  server.write('', 'CHG /TEST/A.SignalPresent=false\r\n');
  server.write('', 'CHG /TEST/A.SignalPresent=true\r\n');
  server.write('', 'CHG /TEST/A.SignalPresent2=2\r\n');
  await waitLinesRcv(client.connection, 4);

  expect(cb1.mock.calls.length).toBe(1);
  expect(cb1.mock.calls[0][0]).toBe('/TEST/A');
  expect(cb1.mock.calls[0][1]).toBe('SignalPresent');
  expect(cb1.mock.calls[0][2]).toBe(true);

  expectedMessage = 'CLOSE /TEST/A';
  mockedResponse = 'c- /TEST/A';
  await client.CLOSE(id1);
});

test('get multiple properties at same time', async () => {
  expectedMessage = '';
  client.signatureCounter = 0;
  var v1 = client.GET('/TEST/NODE.property1');
  var v2 = client.GET('/TEST/NODE.property2');
  var v3 = client.GET('/TEST/NODE.property3');
  //wait 10ms
  await sleep(10);
  server.write('', '{0000\r\npr /TEST/NODE.property1=1\r\n}\r\n');
  server.write('', '{0001\r\npr /TEST/NODE.property2=2\r\n}\r\n');
  server.write('', '{0002\r\npr /TEST/NODE.property3=3\r\n}\r\n');
  debug('wait for lines');
  await waitLinesRcv(client.connection, 9);

  await Promise.all([v1, v2, v3]).then((values) => {
    expect(values).toStrictEqual([1, 2, 3]);
  });
});
