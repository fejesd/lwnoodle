import { Noodle } from '../index';
import { sleep, waitForAnEvent } from './helpers';
import { TcpServerConnection } from '../tcpserverconnection';
import Debug from 'debug';
const debug = Debug('Test');

Debug.enable('Node,Test,Lw3Client,TcpServerConnection');

beforeEach(() => {
  debug('');
  debug('=======' + expect.getState().currentTestName + '=======');
  debug('');
});

afterEach(async () => {
  await sleep(100); // jest fails exiting sometimes without this, as the fd for server socket needs some time to release. Todo: find a better workaround.
});

test('Defaults', () => {
  const noodle = Noodle();
  expect(noodle.lw3client.waitresponses).toBeFalsy();
  expect(noodle.name).toBe('default');
  noodle.__close__();
});

test('Noodle GET', async () => {
  const server = new TcpServerConnection(6107);
  await waitForAnEvent(server, 'listening', debug);
  const noodle = Noodle();
  await waitForAnEvent(noodle.lw3client, 'connect', debug);
  let expectedMessage: string;
  let mockedResponse: string;
  let result;

  server.on('frame', (id, data) => {
    const parts = data.split('#');
    expect(parts[1]).toBe(expectedMessage);
    server.write(1, '{' + parts[0] + '\n' + mockedResponse + '\n}\n');
  });

  //
  // Test basic property access
  //

  expectedMessage = 'GET /NODE/TEST.Property';
  mockedResponse = 'pw /NODE/TEST.property=test\\tvalue';

  result = await noodle.NODE.TEST.Property;

  expect(result).toBe('test\tvalue');

  //
  // Test root node property access
  //

  expectedMessage = 'GET /.Property';
  mockedResponse = 'pw /.property=test\\tvalue';

  result = await noodle.Property;

  expect(result).toBe('test\tvalue');

  //
  // Test type casting
  //

  expectedMessage = 'GET /NODE/TEST.TESTPROPERTY';
  mockedResponse = 'pw /NODE/TEST.TESTPROPERTY=test\\tvalue';

  result = await noodle.NODE.TEST.TESTPROPERTY__prop__;

  expect(result).toBe('test\tvalue');

  //
  // Test error throwing
  //

  expectedMessage = 'GET /NODE/TEST.Property';
  mockedResponse = 'pE %E001 Node not found';

  await expect(noodle.NODE.TEST.Property).rejects.toThrow(Error);

  noodle.__close__();
  server.close();
  await waitForAnEvent(server, 'close', debug);
});
