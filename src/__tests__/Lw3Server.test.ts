import { Lw3Server } from '../lw3server';
import { TcpClientConnection } from '../tcpclientconnection';
import Debug from 'debug';
import { sleep, waitForAnEvent, waitLinesRcv } from './helpers';
import { extendWith, isArguments } from 'lodash';
import { Lw3Client } from '../lw3client';
import { noodleServer } from '../server';
import { Lw3Error, Lw3ErrorCodes, NoodleServer } from '../noodle';
const debug = Debug('Test');

Debug.enable('TcpClientConnection,TcpServerConnection,Test,Lw3Server,NoodleServer');

let server: NoodleServer;
let client: TcpClientConnection;
let receivedMessage: string[] = [];

beforeAll(async () => {
  server = noodleServer({ port: 6107 });
  await waitForAnEvent(server.server, 'listening', debug);
  client = new TcpClientConnection();
  await waitForAnEvent(server.server, 'connect', debug);
  if (!client.connected) await waitForAnEvent(client, 'connect', debug);
  client.on('frame', (data) => {
    receivedMessage.push(data);
  });
});

afterAll(async () => {
  client.close();
  await waitForAnEvent(server.server, 'close', debug);
  server.__close__();
  debug('wait server to close');
  await waitForAnEvent(server.server, 'serverclose', debug);
  debug('server closed');
});

beforeEach(() => {
  debug('');
  debug('=======' + expect.getState().currentTestName + '=======');
  debug('');
  receivedMessage = [];
});

test('error message forming', () => {
  expect(Lw3Server.getErrorHeader(Lw3ErrorCodes.Lw3ErrorCodes_Syntax)).toBe('%E001:Syntax error');
  expect(Lw3Server.getErrorHeader(100 as Lw3ErrorCodes)).toBe('%E100:Unknown error');
});

test('syntax error response', async () => {
  client.write('Unknown\n');
  await waitForAnEvent(client, 'frame', debug);
  expect(receivedMessage).toStrictEqual(['-E Unknown %E001:Syntax error']);

  receivedMessage = [];
  client.write('0001#GETTER /\n');
  await waitForAnEvent(client, 'frame', debug, 3);
  expect(receivedMessage).toStrictEqual(['{0001', '-E GETTER / %E001:Syntax error', '}']);
});

//
// GET
//

test('get - subnodes', async () => {
  server.PATH.TO.MY.NODE.TESTB.Ab = 2 as any;
  server.PATH.TO.MY.NODE.TESTA.Ab = 1 as any;
  server.PATH.TO.MY.NODE.TESTC.Ab = 3 as any;
  server.PATH.TO.MY.NODE.TESTD.Ab = 4 as any;

  client.write('0001#GET /PATH/TO/MY/NODE\n');
  await waitForAnEvent(client, 'frame', debug, 6);
  expect(receivedMessage).toStrictEqual(['{0001', 'n- /PATH/TO/MY/NODE/TESTA', 'n- /PATH/TO/MY/NODE/TESTB', 'n- /PATH/TO/MY/NODE/TESTC', 'n- /PATH/TO/MY/NODE/TESTD', '}']);
});

test('get - subnodes (empty)', async () => {
  server.PATH.TO.YOUR.NODE.Ab = 2 as any;

  client.write('0001#GET /PATH/TO/YOUR/NODE\n');
  await waitForAnEvent(client, 'frame', debug, 2);
  expect(receivedMessage).toStrictEqual(['{0001', '}']);
});

test('get - a single property', async () => {
  server.PATH.TO.MY.NODE.TESTB.Aa = 'hello\nworld' as any;
  receivedMessage = [];
  client.write('0001#GET /PATH/TO/MY/NODE/TESTB.Aa\n');
  await waitForAnEvent(client, 'frame', debug, 3);
  expect(receivedMessage).toStrictEqual(['{0001', 'pw /PATH/TO/MY/NODE/TESTB.Aa=hello\\nworld', '}']);

  server.PATH.TO.MY.NODE.TESTB.Ab = 2 as any;
  receivedMessage = [];
  client.write('0002#GET /PATH/TO/MY/NODE/TESTB.Ab\n');
  await waitForAnEvent(client, 'frame', debug, 3);
  expect(receivedMessage).toStrictEqual(['{0002', 'pw /PATH/TO/MY/NODE/TESTB.Ab=2', '}']);

  server.PATH.TO.MY.NODE.TESTB.Ac = { rw: false, value: true } as any;
  receivedMessage = [];
  client.write('GET /PATH/TO/MY/NODE/TESTB.Ac\n');
  await waitForAnEvent(client, 'frame', debug, 1);
  expect(receivedMessage).toStrictEqual(['pr /PATH/TO/MY/NODE/TESTB.Ac=true']);
});

test('get - all property', async () => {
  server.PATH.TO.MY.NODE.TESTB.Aa = 'hello\nworld' as any;
  server.PATH.TO.MY.NODE.TESTB.Ab = 2 as any;
  server.PATH.TO.MY.NODE.TESTB.Ac = { rw: false, value: true } as any;

  client.write('GET /PATH/TO/MY/NODE/TESTB.*\n');
  await waitForAnEvent(client, 'frame', debug, 3);
  expect(receivedMessage).toStrictEqual(['pw /PATH/TO/MY/NODE/TESTB.Aa=hello\\nworld', 'pw /PATH/TO/MY/NODE/TESTB.Ab=2', 'pr /PATH/TO/MY/NODE/TESTB.Ac=true']);
});

test('get - syntax error', async () => {
  server.PATH.TO.MY.NODE.TestProperty = 'hello\nworld' as any;

  client.write('GET NODETestProperty\n');
  await waitForAnEvent(client, 'frame', debug, 1);
  expect(receivedMessage).toStrictEqual(['-E GET NODETestProperty %E001:Syntax error']);
});

test('get - non existing node', async () => {
  server.PATH.TO.MY.NODE.TestProperty = 'hello\nworld' as any;

  client.write('GET /PATH/TO/YOUR/NODE.TestProperty\n');
  await waitForAnEvent(client, 'frame', debug, 1);
  expect(receivedMessage).toStrictEqual(['-E GET /PATH/TO/YOUR/NODE.TestProperty %E002:Not exists']);
});

test('get - non existing property', async () => {
  server.PATH.TO.MY.NODE.TestProperty = 'hello\nworld' as any;

  client.write('GET /PATH/TO/MY/NODE.Property\n');
  await waitForAnEvent(client, 'frame', debug, 1);
  expect(receivedMessage).toStrictEqual(['-E GET /PATH/TO/MY/NODE.Property %E002:Not exists']);
});

//
// SET
//

test('set a property - string', async () => {
  server.PATH.TO.MY.NODE.TestProperty = 'hello\nworld' as any;
  expect(server.PATH.TO.MY.NODE.TestProperty).toBe('hello\nworld');

  client.write('SET /PATH/TO/MY/NODE.TestProperty=sample\\nvalue\n');
  await waitForAnEvent(client, 'frame', debug, 1);
  expect(receivedMessage).toStrictEqual(['pw /PATH/TO/MY/NODE.TestProperty=sample\\nvalue']);

  expect(server.PATH.TO.MY.NODE.TestProperty).toBe('sample\nvalue');
});

test('set a property - booelan', async () => {
  server.PATH.TO.MY.NODE.TestProperty = 'hello\nworld' as any;
  expect(server.PATH.TO.MY.NODE.TestProperty).toBe('hello\nworld');

  client.write('SET /PATH/TO/MY/NODE.TestProperty=true\n');
  await waitForAnEvent(client, 'frame', debug, 1);
  expect(receivedMessage).toStrictEqual(['pw /PATH/TO/MY/NODE.TestProperty=true']);

  expect(server.PATH.TO.MY.NODE.TestProperty).toBe(true);

  receivedMessage = [];
  client.write('SET /PATH/TO/MY/NODE.TestProperty=false\n');
  await waitForAnEvent(client, 'frame', debug, 1);
  expect(receivedMessage).toStrictEqual(['pw /PATH/TO/MY/NODE.TestProperty=false']);

  expect(server.PATH.TO.MY.NODE.TestProperty).toBe(false);
});

test('set a property - number', async () => {
  server.PATH.TO.MY.NODE.TestProperty = 'hello\nworld' as any;
  expect(server.PATH.TO.MY.NODE.TestProperty).toBe('hello\nworld');

  client.write('SET /PATH/TO/MY/NODE.TestProperty=42\n');
  await waitForAnEvent(client, 'frame', debug, 1);
  expect(receivedMessage).toStrictEqual(['pw /PATH/TO/MY/NODE.TestProperty=42']);

  expect(server.PATH.TO.MY.NODE.TestProperty).toBe(42);
});

test('set a property - using setter function', async () => {
  server.PATH.TO.MY.NODE.TestProperty = {
    value: 'hello\nworld',
    setter(s: string) {
      this.value = s.toUpperCase();
    },
  } as any;

  expect(server.PATH.TO.MY.NODE.TestProperty).toBe('hello\nworld');

  client.write('SET /PATH/TO/MY/NODE.TestProperty=sample\\nvalue\n');
  await waitForAnEvent(client, 'frame', debug, 1);
  expect(receivedMessage).toStrictEqual(['pw /PATH/TO/MY/NODE.TestProperty=SAMPLE\\nVALUE']);

  expect(server.PATH.TO.MY.NODE.TestProperty).toBe('SAMPLE\nVALUE');
});

test('set a property - non-existent node', async () => {
  server.PATH.TO.MY.NODE.TestProperty = {
    value: 'hello\nworld',
    setter(s: string) {
      this.value = s.toUpperCase();
    },
  } as any;

  client.write('SET /PATH/TO/YOUR/NODE.TestProperty=sample\\nvalue\n');
  await waitForAnEvent(client, 'frame', debug, 1);
  expect(receivedMessage).toStrictEqual(['-E SET /PATH/TO/YOUR/NODE.TestProperty=sample\\nvalue %E002:Not exists']);
});

test('set a property - non-existent property', async () => {
  server.PATH.TO.MY.NODE.TestProperty = {
    value: 'hello\nworld',
    setter(s: string) {
      this.value = s.toUpperCase();
    },
  } as any;

  client.write('SET /PATH/TO/MY/NODE.Property=sample\\nvalue\n');
  await waitForAnEvent(client, 'frame', debug, 1);
  expect(receivedMessage).toStrictEqual(['-E SET /PATH/TO/MY/NODE.Property=sample\\nvalue %E002:Not exists']);
});

test('set a property - read only property', async () => {
  server.PATH.TO.MY.NODE.TestProperty = 'hello\nworld' as any;
  server.PATH.TO.MY.NODE.TestProperty__rw__ = false as any;

  client.write('SET /PATH/TO/MY/NODE.TestProperty=sample\\nvalue\n');
  await waitForAnEvent(client, 'frame', debug, 1);
  expect(receivedMessage).toStrictEqual(['-E SET /PATH/TO/MY/NODE.TestProperty=sample\\nvalue %E007:Access denied']);
});

test('set a property - syntax error 1', async () => {
  server.PATH.TO.MY.NODE.TestProperty = 'hello\nworld' as any;

  client.write('SET /PATH/TO/MY/NODETestProperty=sample\\nvalue\n');
  await waitForAnEvent(client, 'frame', debug, 1);
  expect(receivedMessage).toStrictEqual(['-E SET /PATH/TO/MY/NODETestProperty=sample\\nvalue %E001:Syntax error']);
});

test('set a property - syntax error 2', async () => {
  server.PATH.TO.MY.NODE.TestProperty = 'hello\nworld' as any;

  client.write('SET NODETestProperty\n');
  await waitForAnEvent(client, 'frame', debug, 1);
  expect(receivedMessage).toStrictEqual(['-E SET NODETestProperty %E001:Syntax error']);
});

//
// CALL
//

test('call a method - number parameters', async () => {
  server.PATH.TO.MY.NODE.subtract = ((a: number, b: number) => {
    return a - b;
  }) as any;

  client.write('CALL /PATH/TO/MY/NODE:subtract(10,2)\n');
  await waitForAnEvent(client, 'frame', debug, 1);
  expect(receivedMessage).toStrictEqual(['mO /PATH/TO/MY/NODE:subtract=8']);
});

test('call a method - lw3 error', async () => {
  server.PATH.TO.MY.NODE.subtract = ((a: number, b: number) => {
    throw new Lw3Error(Lw3ErrorCodes.Lw3ErrorCodes_InvalidValue);
  }) as any;

  client.write('CALL /PATH/TO/MY/NODE:subtract(10,2)\n');
  await waitForAnEvent(client, 'frame', debug, 1);
  expect(receivedMessage).toStrictEqual(['mE /PATH/TO/MY/NODE:subtract %E004:Invalid value']);
});

test('call a method - generic error', async () => {
  server.PATH.TO.MY.NODE.subtract = ((a: number, b: number) => {
    throw new Error('something terrible has happened');
  }) as any;

  client.write('CALL /PATH/TO/MY/NODE:subtract(10,2)\n');
  await waitForAnEvent(client, 'frame', debug, 1);
  expect(receivedMessage).toStrictEqual(['mE /PATH/TO/MY/NODE:subtract=something terrible has happened %E010:Internal error']);
});
