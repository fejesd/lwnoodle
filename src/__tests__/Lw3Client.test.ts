import { Lw3Client } from '../lw3client';
import { TcpServerConnection } from '../tcpserverconnection';
import Debug from 'debug';
import { sleep, waitForAnEvent } from './helpers';
import { TcpClientConnection } from '../tcpclientconnection';
import { extendWith, isArguments } from 'lodash';
const debug = Debug('Test');

Debug.enable('TcpServerConnection,Test,Lw3Client');

let server: TcpServerConnection;
let client: Lw3Client;
let expectedMessage: string;
let mockedResponse: string;

beforeAll(async () => {
  server = new TcpServerConnection(6107);
  await waitForAnEvent(server, 'listening', debug);
  client = new Lw3Client(new TcpClientConnection());
  await waitForAnEvent(client, 'connect', debug);
  server.on('frame', (id, data) => {
    const parts = data.split('#');
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

test('escaping and unescaping', () => {
  //  \ { } # % ( ) \r \n \t
  const testbenches = [
    ['árvíztűrő tükörfúrógép', 'árvíztűrő tükörfúrógép'],
    ['test\nelek\ntest\ttest\ttest', 'test\\nelek\\ntest\\ttest\\ttest'],
    ['hello{}\\()', 'hello\\{\\}\\\\\\(\\)'],
    ['test#dfs%dfsd', 'test\\#dfs\\%dfsd'],
  ];
  for (const test of testbenches) {
    expect(Lw3Client.escape(test[0])).toBe(test[1]);
    expect(Lw3Client.unescape(test[1])).toBe(test[0]);
    expect(Lw3Client.unescape(Lw3Client.unescape(Lw3Client.escape(Lw3Client.escape(test[0]))))).toBe(test[0]);
  }
});

test('GET', async () => {
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
      expectedMessage = 'CALL ' + testbench[0] + '(' + Lw3Client.escape(testbench[1] as string) + ')';
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
      expectedMessage = 'SET ' + testbench[0] + '=' + Lw3Client.escape(testbench[1] as string);
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

  server.write(-1, 'CHG /TEST/B.test1=somevalue\r\n');
  server.write(-1, 'CHG /TEST/A.test2=someothervalue\r\n');
  server.write(-1, 'CHG /TEST/C.test1=somevalue\r\n');
  server.write(-1, 'CHG /TEST/A.test3=somethirdvalue\r\n');
  await new Promise<void>((resolve, reject)=>{  
    let n=0;
    const handler = ()=>{ n++; if (n === 4) { client.connection.removeListener('frame', handler); resolve(); }};
    client.connection.on('frame',handler);
  }); 

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

  server.write(-1, 'CHG /TEST/A.test1=somevalue\r\n');
  server.write(-1, 'CHG /TEST/A.SignalPresent=true\r\n');
  server.write(-1, 'CHG /TEST/A.SignalPresent2=2\r\n');
  await new Promise<void>((resolve, reject)=>{  
    let n=0;
    const handler = ()=>{ n++; if (n === 3) { client.connection.removeListener('frame', handler); resolve(); }};
    client.connection.on('frame',handler);
  }); 

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

  server.write(-1, 'CHG /TEST/A.test1=somevalue\r\n');
  server.write(-1, 'CHG /TEST/A.SignalPresent=false\r\n');
  server.write(-1, 'CHG /TEST/A.SignalPresent=true\r\n');
  server.write(-1, 'CHG /TEST/A.SignalPresent2=2\r\n');
  await new Promise<void>((resolve, reject)=>{  
    let n=0;
    const handler = ()=>{ n++; if (n === 4) { client.connection.removeListener('frame', handler); resolve(); }};
    client.connection.on('frame',handler);
  }); 

  expect(cb1.mock.calls.length).toBe(1);
  expect(cb1.mock.calls[0][0]).toBe('/TEST/A');
  expect(cb1.mock.calls[0][1]).toBe('SignalPresent');
  expect(cb1.mock.calls[0][2]).toBe(true);

  expectedMessage = 'CLOSE /TEST/A';
  mockedResponse = 'c- /TEST/A';
  await client.CLOSE(id1);
});
