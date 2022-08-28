import { Noodle } from '../index';
import { sleep, waitForAnEvent } from './helpers';
import { TcpServerConnection } from '../tcpserverconnection';
import Debug from 'debug';
const debug = Debug('Test');

Debug.enable('Noodle,Test,Lw3Client,TcpServerConnection');

let expectedMessage: string;
let mockedResponse: string;
let receivedMessage: string;
let server: TcpServerConnection;
let noodle: any;

beforeAll(async () => {
  server = new TcpServerConnection(6107);
  await waitForAnEvent(server, 'listening', debug);
  noodle = Noodle();
  await waitForAnEvent(noodle.lw3client, 'connect', debug);
  server.on('frame', (id, data) => {
    const parts = data.split('#');
    receivedMessage = parts[1];
    expect(parts[1]).toBe(expectedMessage);
    if (mockedResponse !== '') server.write(1, '{' + parts[0] + '\n' + mockedResponse + '\n}\n');
  });
});

afterAll(async () => {
  noodle.__close__();
  await waitForAnEvent(noodle.lw3client, 'close', debug);
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

test('Noodle GET basic property access', async () => {
  expectedMessage = 'GET /NODE/TEST.Property';
  mockedResponse = 'pw /NODE/TEST.Property=test\\tvalue';

  const result = await noodle.NODE.TEST.Property;

  expect(result).toBe('test\tvalue');
});

test('root node property access', async () => {
  expectedMessage = 'GET /.Property';
  mockedResponse = 'pw /.property=test\\tvalue';

  const result = await noodle.Property;

  expect(result).toBe('test\tvalue');
});

test('property type casting', async () => {
  expectedMessage = 'GET /NODE/TEST.TESTPROPERTY';
  mockedResponse = 'pw /NODE/TEST.TESTPROPERTY=test\\tvalue';

  const result = await noodle.NODE.TEST.TESTPROPERTY__prop__;

  expect(result).toBe('test\tvalue');
});

it('should throw an error on GET upon erroneous answer', async () => {
  expectedMessage = 'GET /NODE/TEST.Property';
  mockedResponse = 'pE %E001 Node not found';

  await expect(noodle.NODE.TEST.Property).rejects.toThrow(Error);
});

it('should throw an error on GET when no answer', async () => {
  expectedMessage = 'GET /NODE/TEST.Property';
  mockedResponse = '';

  await expect(noodle.NODE.TEST.Property).rejects.toThrow(Error);
});

test('property return value as a number if result is an integer', async () => {
  expectedMessage = 'GET /NODE/TEST.Property';
  mockedResponse = 'pw /NODE/TEST.Property=52';

  const result = await noodle.NODE.TEST.Property;
  expect(result).toBe(52);
  expect(typeof result).toBe('number');
});

test('property return value as a number if result is an float', async () => {
  expectedMessage = 'GET /NODE/TEST.Property';
  mockedResponse = 'pw /NODE/TEST.Property=52.34';

  const result = await noodle.NODE.TEST.Property;
  expect(result).toBe(52.34);
  expect(typeof result).toBe('number');
});

test('property return value as a boolean if result is "true"', async () => {
  expectedMessage = 'GET /NODE/TEST.Property';
  mockedResponse = 'pw /NODE/TEST.Property=true';

  const result = await noodle.NODE.TEST.Property;
  expect(result).toBe(true);
  expect(typeof result).toBe('boolean');
});

test('property return value as a boolean if result is "false"', async () => {
  expectedMessage = 'GET /NODE/TEST.Property';
  mockedResponse = 'pw /NODE/TEST.Property=false';

  const result = await noodle.NODE.TEST.Property;
  expect(result).toBe(false);
  expect(typeof result).toBe('boolean');
});

test('property return value as an array if result is a list', async () => {
  expectedMessage = 'GET /NODE/TEST.Property';
  mockedResponse = 'pw /NODE/TEST.Property=12;hello;false';

  const result = await noodle.NODE.TEST.Property;
  expect(result).toStrictEqual([12, 'hello', false]);
});


test('property set to a string', async () => {
  expectedMessage = 'SET /NODE/TEST.Property=hello\\tworld';
  mockedResponse = 'pw /NODE/TEST.Property=hello\\tworld';

  noodle.NODE.TEST.Property='hello\tworld';
  await noodle.__sync__();    
  expect(receivedMessage).toBe(expectedMessage);
});