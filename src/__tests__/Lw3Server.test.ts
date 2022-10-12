import { Lw3Server, Lw3ErrorCodes } from '../lw3server';
import { TcpClientConnection } from '../tcpclientconnection';
import Debug from 'debug';
import { sleep, waitForAnEvent, waitLinesRcv } from './helpers';
import { extendWith, isArguments } from 'lodash';
import { Lw3Client } from '../lw3client';
import { noodleServer } from '../server';
import { NoodleServer } from '../noodle';
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

test('get subnodes', async () => {
  server.PATH.TO.MY.NODE.TESTB.Ab = 2 as any;
  server.PATH.TO.MY.NODE.TESTA.Ab = 1 as any;
  server.PATH.TO.MY.NODE.TESTC.Ab = 3 as any;
  server.PATH.TO.MY.NODE.TESTD.Ab = 4 as any;

  client.write('0001#GET /PATH/TO/MY/NODE\n');
  await waitForAnEvent(client, 'frame', debug, 6);
  expect(receivedMessage).toStrictEqual(['{0001', 'n- /PATH/TO/MY/NODE/TESTA', 'n- /PATH/TO/MY/NODE/TESTB', 'n- /PATH/TO/MY/NODE/TESTC', 'n- /PATH/TO/MY/NODE/TESTD', '}']);
});

test('get a single property', async () => {
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
