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

  expect(root.NotExists).toBe('');

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

test('change property values', () => {
  root.ProductName = 'TestProduct' as any;
  expect(root.ProductName).toBe('TestProduct');

  root.ProductName = 'New' as any;
  expect(root.ProductName).toBe('New');

  root.ProductName = 42 as any;
  expect(root.ProductName).toBe(42);

  root.ProductName__prop__ = 43 as any;
  expect(root.ProductName).toBe(43);

  root.ProductName__prop__ = true as any;
  expect(root.ProductName).toBe(true);

  root.ProductName__prop__ = { value: 'something', manual: '123', rw: false } as any;
  expect(root.ProductName).toBe('something');
});

test('use property setters', () => {
  root.ProductName = {
    setter(value: any) {
      this.value = 'test' + value;
    },
  } as any;

  root.ProductName = 'Product' as any;
  expect(root.ProductName).toBe('testProduct');

  root.ProductName = 'something' as any;
  expect(root.ProductName).toBe('testsomething');

  root.ProductName = { value: 'test' } as any; // is this behaviour okay?
  expect(root.ProductName).toBe('test');
});

test('use property getters', () => {
  root.ProductName = {
    getter() {
      return 'test' + this.value;
    },
  } as any;

  root.ProductName = 'Product' as any;
  expect(root.ProductName).toBe('testProduct');

  root.ProductName = 'something' as any;
  expect(root.ProductName).toBe('testsomething');

  root.ProductName = { value: 'test' } as any;
  expect(root.ProductName__prop__).toBe('testtest');
});

test('using methods', () => {
  const fun = (a: number, b: number) => {
    return a + b;
  };
  root.PATH.TO.NODE.add = fun as any;

  expect(root.PATH.TO.NODE.add).toBe(fun);
  expect(root.PATH.TO.NODE.add(1, 2)).toBe(3);

  root.PATH.TO.NODE.add = ((a: number, b: number) => {
    return 2 * a + 2 * b;
  }) as any;
  expect(root.PATH.TO.NODE.add(1, 2)).toBe(6);

  root.PATH.TO.NODE.add = {
    fun: (a: number, b: number) => {
      return 3 * a + 3 * b;
    },
  } as any;
  expect(root.PATH.TO.NODE.add(1, 2)).toBe(9);

  root.PATH.TO.NODE.subtr = {
    fun: (a: number, b: number) => {
      return a - b;
    },
  } as any;
  expect(root.PATH.TO.NODE.subtr(3, 1)).toBe(2);
});
