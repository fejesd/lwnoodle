import { NoodleClient, noodleClient, live } from '../index';
import { sleep, waitForAnEvent, waitLinesRcv } from './helpers';
import { TcpServerConnection } from '../tcpserverconnection';
import Debug from 'debug';
const debug = Debug('Test');

Debug.enable('Noodle,Test,LwClient,TcpServerConnection');

let expectedMessage: string;
let mockedResponse: string;
let receivedMessage: string;
let server: TcpServerConnection;
let noodle: NoodleClient;

beforeAll(async () => {
  server = new TcpServerConnection(6107);
  await waitForAnEvent(server, 'listening', debug);
  server.on('frame', (server, id, data) => {
    const parts = data.split('#');
    receivedMessage = parts[1];
    expect(parts[1]).toBe(expectedMessage);
    if (mockedResponse !== '') server.write('', '{' + parts[0] + '\n' + mockedResponse + '\n}\n');
  });
  noodle = noodleClient();
  await noodle.__connect__();
});

afterAll(async () => {
  noodle.__close__();
  await waitForAnEvent(noodle.lwclient, 'close', debug);
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

//
// get
//

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

test('property return value as a string if it is not just a number', async () => {
  expectedMessage = 'GET /NODE/TEST.Property';
  mockedResponse = 'pw /NODE/TEST.Property=1920x1080';

  const result = await noodle.NODE.TEST.Property;
  expect(result).toBe('1920x1080');
  expect(typeof result).toBe('string');
});

test('property return value as a string if it is empty', async () => {
  expectedMessage = 'GET /NODE/TEST.Property';
  mockedResponse = 'pw /NODE/TEST.Property=';

  const result = await noodle.NODE.TEST.Property;
  expect(result).toBe('');
  expect(typeof result).toBe('string');
});

test('property return value as a string if it containst only spaces', async () => {
  expectedMessage = 'GET /NODE/TEST.Property';
  mockedResponse = 'pw /NODE/TEST.Property=  ';

  const result = await noodle.NODE.TEST.Property;
  expect(result).toBe('  ');
  expect(typeof result).toBe('string');
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

//
// set
//

test('property set to a string', async () => {
  expectedMessage = 'SET /NODE/TEST.Property=hello\\tworld';
  mockedResponse = 'pw /NODE/TEST.Property=hello\\tworld';

  noodle.NODE.TEST.Property = 'hello\tworld' as any;
  await noodle.__sync__();
  expect(receivedMessage).toBe(expectedMessage);
});

test('sync should fail when no response is get for SET', async () => {
  expectedMessage = 'SET /NODE/TEST.Property=hello\\tworld';
  mockedResponse = '';
  noodle.NODE.TEST.Property = 'hello\tworld' as any;
  try {
    await noodle.__sync__();
    throw new Error('no exception');
  } catch (errormsg) {
    debug(errormsg);
  }
  expect(receivedMessage).toBe(expectedMessage);
});

//
// method call
//

test('method call should return with the answer', async () => {
  expectedMessage = 'CALL /PATH/TO/TEST/NODE:test(true,false)';
  mockedResponse = 'mO /PATH/TO/TEST/NODE:test=answer';

  const answer = await noodle.PATH.TO.TEST.NODE.test(true, false);
  expect(receivedMessage).toBe(expectedMessage);
  expect(answer).toBe('answer');
});

test('method call should return empty string when there is no return value', async () => {
  expectedMessage = 'CALL /PATH/TO/TEST/NODE:test(1,2,3)';
  mockedResponse = 'mO /PATH/TO/TEST/NODE:test';

  const answer = await noodle.PATH.TO.TEST.NODE.test(1, 2, 3);
  expect(receivedMessage).toBe(expectedMessage);
  expect(answer).toBe('');
});

test('method call should raise an exception when error has returned', async () => {
  expectedMessage = 'CALL /PATH/TO/TEST/NODE:test(true,false)';
  mockedResponse = 'mE /PATH/TO/TEST/NODE:test=answer';
  await expect(noodle.PATH.TO.TEST.NODE.test(true, false)).rejects.toEqual(Error('answer'));
  expect(receivedMessage).toBe(expectedMessage);
});

test('method call should raise an exception when junk returned', async () => {
  expectedMessage = 'CALL /PATH/TO/TEST/NODE:test(true,false)';
  mockedResponse = 'junk';
  await expect(noodle.PATH.TO.TEST.NODE.test(true, false)).rejects.toBeDefined();
  expect(receivedMessage).toBe(expectedMessage);
});

//
// on()
//

test('on() should call the callback when needed', async () => {
  expectedMessage = 'OPEN /PATH/TO/TEST/NODE';
  mockedResponse = 'o- /PATH/TO/TEST/NODE';

  const cb1 = jest.fn();
  const id1 = await noodle.PATH.TO.TEST.NODE.on(cb1);
  expect(receivedMessage).toBe(expectedMessage);

  server.write('', 'CHG /TEST/A.test1=somevalue\r\n');
  server.write('', 'CHG /PATH/TO/TEST/NODE.SignalPresent=false\r\n');
  server.write('', 'CHG /TEST/A.SignalPresent=true\r\n');
  server.write('', 'CHG /TEST/A.SignalPresent2=2\r\n');
  server.write('', 'CHG /PATH/TO/TEST/NODE.SignalPresent=true\r\n');
  await waitLinesRcv(noodle.lwclient.connection, 5);

  expect(cb1.mock.calls.length).toBe(2);
  expect(cb1.mock.calls[0][0]).toBe('/PATH/TO/TEST/NODE');
  expect(cb1.mock.calls[0][1]).toBe('SignalPresent');
  expect(cb1.mock.calls[0][2]).toBe(false);
  expect(cb1.mock.calls[1][0]).toBe('/PATH/TO/TEST/NODE');
  expect(cb1.mock.calls[1][1]).toBe('SignalPresent');
  expect(cb1.mock.calls[1][2]).toBe(true);

  expectedMessage = 'CLOSE /PATH/TO/TEST/NODE';
  mockedResponse = 'c- /PATH/TO/TEST/NODE';
  await noodle.PATH.TO.TEST.NODE.removeListener(id1);
  expect(receivedMessage).toBe(expectedMessage);
});

test('on() should call the callback only with the specified property', async () => {
  expectedMessage = 'OPEN /PATH/TO/TEST/NODE';
  mockedResponse = 'o- /PATH/TO/TEST/NODE';

  const cb1 = jest.fn();
  const id1 = await noodle.PATH.TO.TEST.NODE.on('SignalPresent', cb1);
  expect(receivedMessage).toBe(expectedMessage);

  server.write('', 'CHG /PATH/TO/TEST/NODE.Connected=false\r\n');
  server.write('', 'CHG /PATH/TO/TEST/NODE.SignalPresent=false\r\n');
  server.write('', 'CHG /TEST/A.SignalPresent=true\r\n');
  server.write('', 'CHG /PATH/TO/TEST/NODE.Something=false\r\n');
  server.write('', 'CHG /PATH/TO/TEST/NODE.SignalPresent=true\r\n');
  await waitLinesRcv(noodle.lwclient.connection, 5);

  expect(cb1.mock.calls.length).toBe(2);
  expect(cb1.mock.calls[0][0]).toBe('/PATH/TO/TEST/NODE');
  expect(cb1.mock.calls[0][1]).toBe('SignalPresent');
  expect(cb1.mock.calls[0][2]).toBe(false);
  expect(cb1.mock.calls[1][0]).toBe('/PATH/TO/TEST/NODE');
  expect(cb1.mock.calls[1][1]).toBe('SignalPresent');
  expect(cb1.mock.calls[1][2]).toBe(true);

  expectedMessage = 'CLOSE /PATH/TO/TEST/NODE';
  mockedResponse = 'c- /PATH/TO/TEST/NODE';
  await noodle.PATH.TO.TEST.NODE.removeListener(id1);
  expect(receivedMessage).toBe(expectedMessage);
});

test('on() should call the callback only with the specified property and value', async () => {
  expectedMessage = 'OPEN /PATH/TO/TEST/NODE';
  mockedResponse = 'o- /PATH/TO/TEST/NODE';

  const cb1 = jest.fn();
  const id1 = await noodle.PATH.TO.TEST.NODE.on('SignalPresent=false', cb1);
  expect(receivedMessage).toBe(expectedMessage);

  server.write('', 'CHG /PATH/TO/TEST/NODE.Connected=false\r\n');
  server.write('', 'CHG /PATH/TO/TEST/NODE.SignalPresent=false\r\n');
  server.write('', 'CHG /TEST/A.SignalPresent=true\r\n');
  server.write('', 'CHG /PATH/TO/TEST/NODE.Something=false\r\n');
  server.write('', 'CHG /PATH/TO/TEST/NODE.SignalPresent=true\r\n');
  await waitLinesRcv(noodle.lwclient.connection, 5);

  expect(cb1.mock.calls.length).toBe(1);
  expect(cb1.mock.calls[0][0]).toBe('/PATH/TO/TEST/NODE');
  expect(cb1.mock.calls[0][1]).toBe('SignalPresent');
  expect(cb1.mock.calls[0][2]).toBe(false);

  expectedMessage = 'CLOSE /PATH/TO/TEST/NODE';
  mockedResponse = 'c- /PATH/TO/TEST/NODE';
  await noodle.PATH.TO.TEST.NODE.removeListener(id1);
  expect(receivedMessage).toBe(expectedMessage);
});

//
// once
//

test('once should call the callback only once', async () => {
  expectedMessage = 'OPEN /PATH/TO/TEST/NODE';
  mockedResponse = 'o- /PATH/TO/TEST/NODE';

  const cb1 = jest.fn();
  const id1 = await noodle.PATH.TO.TEST.NODE.once('SignalPresent=false', cb1);
  expect(receivedMessage).toBe(expectedMessage);

  expectedMessage = 'CLOSE /PATH/TO/TEST/NODE';
  mockedResponse = 'c- /PATH/TO/TEST/NODE';

  server.write('', 'CHG /PATH/TO/TEST/NODE.Connected=false\r\n');
  server.write('', 'CHG /PATH/TO/TEST/NODE.SignalPresent=false\r\n');
  server.write('', 'CHG /PATH/TO/TEST/NODE.SignalPresent=true\r\n');
  await waitLinesRcv(noodle.lwclient.connection, 3);

  expect(cb1.mock.calls.length).toBe(1);
  expect(cb1.mock.calls[0][0]).toBe('/PATH/TO/TEST/NODE');
  expect(cb1.mock.calls[0][1]).toBe('SignalPresent');
  expect(cb1.mock.calls[0][2]).toBe(false);
  await waitLinesRcv(noodle.lwclient.connection, 3);
  expect(receivedMessage).toBe(expectedMessage);
  expect(noodle.lwclient['subscribers'].length).toBe(0);
});

test('multiple once on same node', async () => {
  expectedMessage = 'OPEN /PATH/TO/TEST/NODE';
  mockedResponse = 'o- /PATH/TO/TEST/NODE';

  const cb1 = jest.fn();
  const cb2 = jest.fn();
  await noodle.PATH.TO.TEST.NODE.once('SignalPresent=false', cb1);
  await noodle.PATH.TO.TEST.NODE.once('SignalPresent=true', cb2);
  expect(receivedMessage).toBe(expectedMessage);

  expectedMessage = 'CLOSE /PATH/TO/TEST/NODE';
  mockedResponse = 'c- /PATH/TO/TEST/NODE';

  server.write('', 'CHG /PATH/TO/TEST/NODE.Connected=false\r\n');
  server.write('', 'CHG /PATH/TO/TEST/NODE.SignalPresent=false\r\n');
  server.write('', 'CHG /PATH/TO/TEST/NODE.SignalPresent=true\r\n');
  await waitLinesRcv(noodle.lwclient.connection, 3);
  expect(cb1.mock.calls.length).toBe(1);
  expect(cb1.mock.calls[0][0]).toBe('/PATH/TO/TEST/NODE');
  expect(cb1.mock.calls[0][1]).toBe('SignalPresent');
  expect(cb1.mock.calls[0][2]).toBe(false);
  expect(cb2.mock.calls.length).toBe(1);
  expect(cb2.mock.calls[0][0]).toBe('/PATH/TO/TEST/NODE');
  expect(cb2.mock.calls[0][1]).toBe('SignalPresent');
  expect(cb2.mock.calls[0][2]).toBe(true);

  await waitLinesRcv(noodle.lwclient.connection, 3);
  expect(receivedMessage).toBe(expectedMessage);
  expect(noodle.lwclient['subscribers'].length).toBe(0);
});

test('waitFor usage', async () => {
  expectedMessage = 'OPEN /PATH/TO/TEST/NODE';
  mockedResponse = 'o- /PATH/TO/TEST/NODE';
  const cb1 = jest.fn();
  let a = 0;
  setTimeout(() => {
    a++;
    server.write('', 'CHG /PATH/TO/TEST/NODE.SignalPresent=true\r\n');
  }, 1000);

  const res = await noodle.PATH.TO.TEST.NODE.waitFor('SignalPresent');

  expect(res).toBe(true);
  expect(a).toBe(1);

  expectedMessage = 'CLOSE /PATH/TO/TEST/NODE';
  mockedResponse = 'c- /PATH/TO/TEST/NODE';

  await waitLinesRcv(noodle.lwclient.connection, 3);
  expect(receivedMessage).toBe(expectedMessage);
  expect(noodle.lwclient['subscribers'].length).toBe(0);
});

//
// live
//

test('live should return immediately', async () => {
  expectedMessage = 'OPEN /PATH/TO/TEST/NODE';
  mockedResponse = 'o- /PATH/TO/TEST/NODE';
  server.once('frame', (data) => {
    expectedMessage = 'GET /PATH/TO/TEST/NODE.*';
    mockedResponse = 'pr /PATH/TO/TEST/NODE.Test=ablak\npr /PATH/TO/TEST/NODE.Hello=hello\\nworld\npr /PATH/TO/TEST/NODE.Counter=12';
  });

  const testnode: any = await live(noodle.PATH.TO.TEST.NODE);

  expect(testnode.Test).toBe('ablak');
  expect(testnode.Hello).toBe('hello\nworld');
  expect(testnode.Counter).toBe(12);
  expect(testnode.Foo).toBe(undefined);

  // send some update
  server.write('', 'CHG /TEST/A.test1=somevalue\r\n');
  server.write('', 'CHG /PATH/TO/TEST/NODE.Counter=13\r\n');
  server.write('', 'CHG /PATH/TO/TEST/NODE.SignalPresent=true\r\n');
  await waitLinesRcv(noodle.lwclient.connection, 3);

  expect(testnode.Counter).toBe(13);
  expect(testnode.SignalPresent).toBe(true);
});

test('live getSnapshot() method should return with a json object', async () => {
  expectedMessage = 'OPEN /PATH/TO/TEST/NODE2';
  mockedResponse = 'o- /PATH/TO/TEST/NODE2';
  server.once('frame', (data) => {
    expectedMessage = 'GET /PATH/TO/TEST/NODE2.*';
    mockedResponse = 'pr /PATH/TO/TEST/NODE2.Test=ablak\npr /PATH/TO/TEST/NODE2.Hello=hello\\nworld\npr /PATH/TO/TEST/NODE2.Counter=12';
  });

  const liveobj: any = await live(noodle.PATH.TO.TEST.NODE2);
  const snapshot = liveobj.getSnapshot();

  //check snapshot type, should be a serializable json object
  expect(typeof snapshot).toBe('object');
  expect(snapshot.Test).toBe('ablak');
  expect(snapshot.Hello).toBe('hello\nworld');
  expect(snapshot.Counter).toBe(12);
  expect(snapshot.Foo).toBe(undefined);

  // send some update
  server.write('', 'CHG /TEST/A.test1=somevalue\r\n');
  server.write('', 'CHG /PATH/TO/TEST/NODE2.Counter=13\r\n');
  server.write('', 'CHG /PATH/TO/TEST/NODE2.SignalPresent=true\r\n');
  await waitLinesRcv(noodle.lwclient.connection, 3);

  //snapshot should not change
  expect(snapshot.Counter).toBe(12);
  expect(snapshot.SignalPresent).toBe(undefined);
});
