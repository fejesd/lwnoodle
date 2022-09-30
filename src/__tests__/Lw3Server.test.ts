import { Lw3Server, Lw3ErrorCodes } from '../lw3server';
import { TcpClientConnection } from '../tcpclientconnection';
import Debug from 'debug';
import { sleep, waitForAnEvent, waitLinesRcv } from './helpers';
import { extendWith, isArguments } from 'lodash';
import { Lw3Client } from '../lw3client';
const debug = Debug('Test');

Debug.enable('TcpClientConnection,TcpServerConnection,Test,Lw3Server');

let server: Lw3Server;
let client: TcpClientConnection;
let receivedMessage: string[] = [];

beforeAll(async () => {
  server = new Lw3Server();
  await waitForAnEvent(server, 'listening', debug);
  client = new TcpClientConnection();
  await waitForAnEvent(server, 'connect', debug);
  if (!client.connected) await waitForAnEvent(client, 'connect', debug);
  client.on('frame', (data) => {
    receivedMessage.push(data);
  });
});

afterAll(async () => {
  client.close();
  await waitForAnEvent(server, 'close', debug);
  server.close();
  debug('wait server to close');
  await waitForAnEvent(server, 'serverclose', debug);
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
  debug('aaa');
  await waitForAnEvent(client, 'frame', debug, 3);
  debug('bbb');
  expect(receivedMessage).toStrictEqual(['{0001', '-E GETTER / %E001:Syntax error', '}']);
});
