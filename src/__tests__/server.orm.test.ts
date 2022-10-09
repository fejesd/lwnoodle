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
  root = new Proxy(clientObj, NoodleServerProxyHandler) as unknown as NoodleServer;
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

test('delete nodes, properties, methods', () => {
  root.PATH.TO.NODE.SOMETHING.Prop = 1 as any;
  root.PATH.TO.NODE.SOMETHING.meth = (() => {
    return 1;
  }) as any;
  expect(root.PATH.TO.NODE.$SOMETHING.$Prop).toBe(1);
  delete root.PATH.TO.NODE.SOMETHING.Prop;
  expect(root.PATH.TO.NODE.$SOMETHING.$Prop).toBe(undefined);

  expect(root.PATH.TO.NODE.$SOMETHING.$meth()).toBe(1);
  delete root.PATH.TO.NODE.SOMETHING.meth;
  expect(root.PATH.TO.NODE.$SOMETHING.$meth).toBe(undefined);

  delete root.PATH.TO.NODE.SOMETHING;
  expect(root.PATH.TO.NODE.$SOMETHING).toBe(undefined);
});

test('Object.keys shall return subnodes, properties, methods', () => {
  root.PATH.TO.NODE.SOMETHING.Prop = 1 as any;
  root.PATH.TO.NODE.SOMETHING.Test = 2 as any;
  root.PATH.TO.NODE.SOMETHING.meth = (() => {
    return 1;
  }) as any;
  root.PATH.TO.NODE.SOMETHING.apply = (() => {
    return 2;
  }) as any;
  root.PATH.TO.NODE.SOMETHING.SUBNODE1.Ab = 1 as any;
  root.PATH.TO.NODE.SOMETHING.SUBNODE3.Ab = 2 as any;
  root.PATH.TO.NODE.SOMETHING.SUBNODE2.Ab = 3 as any;

  expect(Object.keys(root.PATH.TO.NODE.SOMETHING)).toStrictEqual(['SUBNODE1', 'SUBNODE2', 'SUBNODE3', 'Prop', 'Test', 'apply', 'meth']);
});

test('setting and getting property manuals', () => {
  root.PATH.TO.NODE.Prop1 = 'somevalue' as any;
  root.PATH.TO.NODE.Prop1__man__ = 'desc' as any;

  root.PATH.TO.NODE.Prop2__man__ = 'desc' as any;
  root.PATH.TO.NODE.Prop2 = 'somevalue' as any;

  root.PATH.TO.NODE.Prop3 = { value: 'somevalue', manual: 'desc' } as any;

  root.PATH.TO.NODE.prop4__prop__man__ = 'desc' as any;
  root.PATH.TO.NODE.prop4__prop = 'somevalue' as any;

  expect(Object.keys(root.PATH.TO.NODE)).toStrictEqual(['Prop1', 'Prop2', 'Prop3', 'prop4']);

  expect(root.PATH.TO.NODE.Prop1).toBe('somevalue');
  expect(root.PATH.TO.NODE.Prop1__man__).toBe('desc');

  expect(root.PATH.TO.NODE.Prop2).toBe('somevalue');
  expect(root.PATH.TO.NODE.Prop2__man__).toBe('desc');

  expect(root.PATH.TO.NODE.Prop3).toBe('somevalue');
  expect(root.PATH.TO.NODE.Prop3__man__).toBe('desc');

  expect(root.PATH.TO.NODE.prop4).toBe('somevalue');
  expect(root.PATH.TO.NODE.prop4__man__).toBe('desc');

  expect(root.PATH.TO.NODE.prop4__prop__).toBe('somevalue');
  expect(root.PATH.TO.NODE.prop4__prop__man__).toBe('desc');
});

test('setting and getting property rw flag', () => {
  root.PATH.TO.NODE.Prop1 = 'somevalue' as any;
  root.PATH.TO.NODE.Prop1__rw__ = false as any;

  root.PATH.TO.NODE.Prop2__rw__ = undefined as any;
  root.PATH.TO.NODE.Prop2 = 'somevalue' as any;

  root.PATH.TO.NODE.Prop3 = { value: 'somevalue', rw: false } as any;

  root.PATH.TO.NODE.prop4__prop__rw__ = 0 as any;
  root.PATH.TO.NODE.prop4__prop = 'somevalue' as any;

  expect(Object.keys(root.PATH.TO.NODE)).toStrictEqual(['Prop1', 'Prop2', 'Prop3', 'prop4']);

  expect(root.PATH.TO.NODE.Prop1).toBe('somevalue');
  expect(root.PATH.TO.NODE.Prop1__rw__).toBe(false);

  expect(root.PATH.TO.NODE.Prop2).toBe('somevalue');
  expect(root.PATH.TO.NODE.Prop2__rw__).toBe(false);

  expect(root.PATH.TO.NODE.Prop3).toBe('somevalue');
  expect(root.PATH.TO.NODE.Prop3__rw__).toBe(false);

  expect(root.PATH.TO.NODE.prop4).toBe('somevalue');
  expect(root.PATH.TO.NODE.prop4__rw__).toBe(false);

  expect(root.PATH.TO.NODE.prop4__prop__).toBe('somevalue');
  expect(root.PATH.TO.NODE.prop4__prop__rw__).toBe(false);
});

test('setting and getting method manuals', () => {
  root.PATH.TO.NODE.meth1 = (() => {
    return 42;
  }) as any;
  root.PATH.TO.NODE.meth1__man__ = 'desc' as any;

  root.PATH.TO.NODE.meth2__man__ = 'desc' as any;
  root.PATH.TO.NODE.meth2 = (() => {
    return 42;
  }) as any;

  root.PATH.TO.NODE.meth3 = {
    fun: () => {
      return 42;
    },
    manual: 'desc',
  } as any;

  root.PATH.TO.NODE.Meth4__method__man__ = 'desc' as any;
  root.PATH.TO.NODE.Meth4__method__ = (() => {
    return 42;
  }) as any;

  expect(Object.keys(root.PATH.TO.NODE)).toStrictEqual(['Meth4', 'meth1', 'meth2', 'meth3']);

  expect(root.PATH.TO.NODE.meth1()).toBe(42);
  expect(root.PATH.TO.NODE.meth1__man__).toBe('desc');

  expect(root.PATH.TO.NODE.meth2()).toBe(42);
  expect(root.PATH.TO.NODE.meth2__man__).toBe('desc');

  expect(root.PATH.TO.NODE.meth3()).toBe(42);
  expect(root.PATH.TO.NODE.meth3__man__).toBe('desc');

  expect(root.PATH.TO.NODE.Meth4()).toBe(42);
  expect(root.PATH.TO.NODE.Meth4__man__).toBe('desc');

  expect(root.PATH.TO.NODE.Meth4__method__()).toBe(42);
  expect(root.PATH.TO.NODE.Meth4__method__man__).toBe('desc');
});

test('node converting to JSON', () => {
  root.NODE.Alfa = 'Test' as any;
  root.NODE.Beta = 'Hello' as any;
  root.NODE.method = (() => {
    return 42;
  }) as any;
  root.NODE.ONE.Omega = 'Ohm' as any;
  root.NODE.TWO.Zeta = 'zeta' as any;

  expect(JSON.parse(JSON.stringify(root))).toStrictEqual({ NODE: { Alfa: 'Test', Beta: 'Hello', ONE: { Omega: 'Ohm' }, TWO: { Zeta: 'zeta' } } });
});

test('Creating node tree by JSON assignment', () => {
  root.PATH = {
    NODE: {
      Alfa: 'Test',
      Beta: 'Hello',
      ONE: { Omega: 'Ohm' },
      TWO: { Zeta: 'zeta' },
      testmethod: () => {
        return 42;
      },
    },
  } as any;

  expect(root.PATH.NODE.Alfa).toBe('Test');
  expect(root.PATH.NODE.Beta).toBe('Hello');
  expect(root.PATH.NODE.ONE.Omega).toBe('Ohm');
  expect(root.PATH.NODE.TWO.Zeta).toBe('zeta');
  expect(root.PATH.NODE.testmethod()).toBe(42);

  root.PATH.NODE = {
    ONE: { Theta: 'theta' },
    THREE: { Delta: 'delta' },
    testmethod: () => {
      return 43;
    },
  } as any;

  expect(root.PATH.NODE.ONE.Omega).toBe('Ohm');
  expect(root.PATH.NODE.ONE.Theta).toBe('theta');
  expect(root.PATH.NODE.TWO.Zeta).toBe('zeta');
  expect(root.PATH.NODE.THREE.Delta).toBe('delta');
  expect(root.PATH.NODE.testmethod()).toBe(43);
});

test('setJSON call will extend the current node with the json', () => {
  root.PartNumber = 12345 as any;
  root.TEST.PATH.Number = 42 as any;
  root.setJSON({
    ProductName: 'TestElek',
    NODE: { Alfa: 'Test', Beta: 'Hello', ONE: { Omega: 'Ohm' }, TWO: { Zeta: 'zeta' } },
    testmethod: () => {
      return 43;
    },
  });

  expect(root.PartNumber).toBe(12345);
  expect(root.TEST.PATH.Number).toBe(42);
  expect(root.ProductName).toBe('TestElek');
  expect(root.testmethod()).toBe(43);
  expect(root.NODE.Alfa).toBe('Test');
  expect(root.NODE.Beta).toBe('Hello');
  expect(root.NODE.ONE.Omega).toBe('Ohm');
  expect(root.NODE.TWO.Zeta).toBe('zeta');
});
