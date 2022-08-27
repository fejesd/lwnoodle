import { Lw3Client } from '../lw3client';
import { TcpServerConnection } from '../tcpserverconnection';
import Debug from 'debug';
import { sleep, waitForAnEvent } from './helpers';
import { TcpClientConnection } from '../tcpclientconnection';
const debug = Debug('Test');

Debug.enable('TcpServerConnection,Test,Lw3Client');

var server: TcpServerConnection;
var client: Lw3Client;
var expectedMessage: string;
var mockedResponse: string;

beforeAll(async () => {
  server = new TcpServerConnection(6107);
  await waitForAnEvent(server, 'listening', debug);
  client = new Lw3Client(new TcpClientConnection());
  await waitForAnEvent(client, 'connect', debug);
  server.on('frame', (id, data) => {
    const parts = data.split('#');
    expect(parts[1]).toBe(expectedMessage);
    if (mockedResponse.length) server.write(1, '{' + parts[0] + '\n' + mockedResponse + '\n}\n');
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

  for (let testbenchId = 0; testbenchId < testbenches.length; testbenchId++) {
    try {
      expectedMessage = 'GET ' + testbenches[testbenchId][0];
      mockedResponse = testbenches[testbenchId][1] as string;
      const test = await client.GET(testbenches[testbenchId][0] as string);
      expect(test).toStrictEqual(testbenches[testbenchId][2]);
    } catch (err) {
      expect(testbenches[testbenchId][2]).toBe(undefined);
    }
  }

});


test('CALL', async () => {
  const testbenches = [
    ['/TEST/NODE:method', '', 'mO /TEST/NODE:method=All right', 'All right'],
    ['/TEST/NODE:method', 'Sample;Parameter', 'mO /TEST/NODE:method=All right', 'All right'],
    ['/TEST/NODE:method', 'Sample\nParameter', 'mO /TEST/NODE:method=All right', 'All right'],
    [
      '/TEST/NODE:method',
      'Sample;Parameter',
      'mE /TEST/NODE:method=%E007 Access denied',
      undefined,
      '%E007 Access denied',
    ],
    ['/TEST/NODE:method', 'Sample;Parameter', 'pR /TEST/NODE.method=ok', undefined, undefined],
    ['/TEST/NODE:method', 'Sample;Parameter', '', undefined, undefined],
    ['/TEST/NODE:method', 'Sample;Parameter', 'syntaxerr\n\nssad', undefined, undefined],
  ];

  for (let testbenchId = 0; testbenchId < testbenches.length; testbenchId++) {
    try {
      expectedMessage = 'CALL ' + testbenches[testbenchId][0] + '(' + Lw3Client.escape(testbenches[testbenchId][1] as string) + ')';
      mockedResponse = testbenches[testbenchId][2] as string;
      const test = await client.CALL(testbenches[testbenchId][0] as string, testbenches[testbenchId][1] as string);
      expect(test).toStrictEqual(testbenches[testbenchId][3]);
    } catch (err) {
      expect(testbenches[testbenchId][3]).toBe(undefined);
      if (testbenches[testbenchId][4]) expect((err as Error).toString()).toBe('Error: ' + testbenches[testbenchId][4]);
    }
  }
});

test('SET', async () => {
  const testbenches = [
    ['/TEST/NODE.property', 'value', 'pw /TEST/NODE.property=value', true], // todo: add error branches
  ];
 
  for (let testbenchId = 0; testbenchId < testbenches.length; testbenchId++) {
    try {
      expectedMessage = 'SET ' + testbenches[testbenchId][0] + '=' + Lw3Client.escape(testbenches[testbenchId][1] as string);
      mockedResponse = testbenches[testbenchId][2] as string;
      await client.SET(testbenches[testbenchId][0] as string, testbenches[testbenchId][1] as string);
      expect(testbenches[testbenchId][3]).toStrictEqual(true);
    } catch (err) {
      expect(testbenches[testbenchId][3]).toBe(false);
    }
  }
});
