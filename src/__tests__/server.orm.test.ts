import { noodleServer, NoodleServerObject, NoodleServerProxyHandler } from '../server';
import Debug from 'debug';
import { NoodleServer } from '../noodle';
import { obj2fun } from '../common';
const debug = Debug('Test');

Debug.enable('Test,NoodleServer');

let root: NoodleServer;

beforeEach(() => {
  debug('');
  debug('=======' + expect.getState().currentTestName + '=======');
  debug('');
  const clientObj: NoodleServerObject = new NoodleServerObject();
  root = new Proxy(obj2fun(clientObj), NoodleServerProxyHandler) as unknown as NoodleServer;
});

test('creating properties automatically', () => {
  root.ProductName = 'TestProduct' as any;
  expect(root.ProductName).toBe('TestProduct');

  root.ProductNumber = 987654321 as any;
  expect(root.ProductNumber).toBe(987654321);

  root.IsReady = true as any;
  expect(root.IsReady).toBe(true);

  root.IsDone = false as any;
  expect(root.IsDone).toBe(false);

  root.MyProperty = { value: 'sample', manual: '' } as any;
  expect(root.MyProperty).toBe('sample');
});

test('use casted properties', () => {
  root.productName__prop__ = 'TestProduct' as any;
  expect(root.productName).toBe('TestProduct');
  expect(root.productName__prop__).toBe('TestProduct');
});

test('creating nodes automatically', () => {
  root.MANAGEMENT.CPU.DATETIME.TimeZone = 2 as any;
  root.MANAGEMENT.CPU.DATETIME.Enable = true as any;
  root.MANAGEMENT.ROOM.ALFA.BETA.Setting = 'fortytwo' as any;

  expect(root.MANAGEMENT.CPU.DATETIME.TimeZone).toBe(2);
  expect(root.MANAGEMENT.CPU.DATETIME.Enable).toBe(true);
  expect(root.MANAGEMENT.ROOM.ALFA.BETA.Setting).toBe('fortytwo');
});

test('disable node autocreation with $ sign', () => {
  root.MANAGEMENT.CPU.DATETIME.TimeZone = 2 as any;
  root.MANAGEMENT.CPU.DATETIME.Enable = true as any;
  expect(() => (root.MANAGEMENT.ROOM.ALFA.$BETA.Setting = 'fortytwo' as any)).toThrow(TypeError);

  expect(root.MANAGEMENT.CPU.DATETIME.TimeZone).toBe(2);
  expect(root.MANAGEMENT.CPU.DATETIME.Enable).toBe(true);
  expect(() => root.MANAGEMENT.ROOM.ALFA.$BETA.Setting).toThrow(TypeError);
  expect(root.MANAGEMENT.ROOM.ALFA.BETA.Setting).toBe('');
  expect(root.MANAGEMENT.ROOM.ALFA.$BETA.Setting).toBe('');
});
