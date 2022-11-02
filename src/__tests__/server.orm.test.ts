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

//
// nodes
//

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

//
// properties
//

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

//
// methods
//

test('using methods', async () => {
  const fun = (a: number, b: number) => {
    return a + b;
  };
  root.PATH.TO.NODE.add = fun as any;

  expect(typeof root.PATH.TO.NODE.add).toBe('function');
  expect(await root.PATH.TO.NODE.add(1, 2)).toBe(3);

  root.PATH.TO.NODE.add = ((a: number, b: number) => {
    return 2 * a + 2 * b;
  }) as any;
  expect(await root.PATH.TO.NODE.add(1, 2)).toBe(6);

  root.PATH.TO.NODE.add = {
    fun: async (a: number, b: number) => {
      return 3 * a + 3 * b;
    },
  } as any;
  expect(await root.PATH.TO.NODE.add(1, 2)).toBe(9);

  root.PATH.TO.NODE.subtr = {
    fun: (a: number, b: number) => {
      return a - b;
    },
  } as any;
  expect(await root.PATH.TO.NODE.subtr(3, 1)).toBe(2);
});

//
// delete, Object.keys
//

test('delete nodes, properties, methods', async () => {
  root.PATH.TO.NODE.SOMETHING.Prop = 1 as any;
  root.PATH.TO.NODE.SOMETHING.meth = (() => {
    return 1;
  }) as any;
  expect(root.PATH.TO.NODE.$SOMETHING.$Prop).toBe(1);
  delete root.PATH.TO.NODE.SOMETHING.Prop;
  expect(root.PATH.TO.NODE.$SOMETHING.$Prop).toBe(undefined);

  expect(await root.PATH.TO.NODE.$SOMETHING.$meth()).toBe(1);
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

//
// manuals
//

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

test('setting and getting method manuals', async () => {
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

  expect(await root.PATH.TO.NODE.meth1()).toBe(42);
  expect(root.PATH.TO.NODE.meth1__man__).toBe('desc');

  expect(await root.PATH.TO.NODE.meth2()).toBe(42);
  expect(root.PATH.TO.NODE.meth2__man__).toBe('desc');

  expect(await root.PATH.TO.NODE.meth3()).toBe(42);
  expect(root.PATH.TO.NODE.meth3__man__).toBe('desc');

  expect(await root.PATH.TO.NODE.Meth4()).toBe(42);
  expect(root.PATH.TO.NODE.Meth4__man__).toBe('desc');

  expect(await root.PATH.TO.NODE.Meth4__method__()).toBe(42);
  expect(root.PATH.TO.NODE.Meth4__method__man__).toBe('desc');
});

//
// rw flag
//

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

//
// JSON conversion
//

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

test('Creating node tree by JSON assignment', async () => {
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
  expect(await root.PATH.NODE.testmethod()).toBe(42);

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
  expect(await root.PATH.NODE.testmethod()).toBe(43);
});

test('fromJSON call will extend the current node with the json', async () => {
  root.PartNumber = 12345 as any;
  root.TEST.PATH.Number = 42 as any;
  root.fromJSON({
    ProductName: 'TestElek',
    NODE: { Alfa: 'Test', Beta: 'Hello', ONE: { Omega: 'Ohm' }, TWO: { Zeta: 'zeta' } },
    testmethod: () => {
      return 43;
    },
  });

  expect(root.PartNumber).toBe(12345);
  expect(root.TEST.PATH.Number).toBe(42);
  expect(root.ProductName).toBe('TestElek');
  expect(await root.testmethod()).toBe(43);
  expect(root.NODE.Alfa).toBe('Test');
  expect(root.NODE.Beta).toBe('Hello');
  expect(root.NODE.ONE.Omega).toBe('Ohm');
  expect(root.NODE.TWO.Zeta).toBe('zeta');
});

//
// internal accessors
//

test('get all subnodes by __nodes__() call', () => {
  root.A.Test = 1 as any;
  root.C.Test = 3 as any;
  root.B.Test = 2 as any;
  expect(root.__nodes__()).toStrictEqual(['A', 'B', 'C']);
});

test('get all methods by __methods__() call', () => {
  root.atest = (() => {
    return 1;
  }) as any;
  root.ctest = (() => {
    return 2;
  }) as any;
  root.btest = (() => {
    return 3;
  }) as any;
  expect(root.__methods__()).toStrictEqual(['atest', 'btest', 'ctest']);
});

test('get all properties by __properties__() call', () => {
  root.Atest = 'A' as any;
  root.Ctest = 42 as any;
  root.Btest = true as any;
  expect(Object.keys(root.__properties__()).sort()).toStrictEqual(['Atest', 'Btest', 'Ctest']);
});

//
// on()
//

test('on() should call the callback when needed', async () => {
  root.PATH.TO.MY.NODE.Ab = 1 as any;
  root.PATH.TO.MY.NODE.Ac = 1 as any;
  root.PATH.TO.MY.NODE.SUBNODE.Ab = 1 as any;
  root.PATH.TO.ANOTHER.NODE.Ab = 1 as any;

  const cb1 = jest.fn();
  const id1 = await root.PATH.TO.MY.NODE.on(cb1);

  root.PATH.TO.MY.NODE.SUBNODE.Ab = 1 as any;
  root.PATH.TO.MY.NODE.Ab = 2 as any;
  root.PATH.TO.MY.NODE.New = 1 as any;
  root.PATH.TO.ANOTHER.NODE.Ab = 2 as any;

  expect(cb1.mock.calls.length).toBe(2);
  expect(cb1.mock.calls[0][0]).toBe('/PATH/TO/MY/NODE');
  expect(cb1.mock.calls[0][1]).toBe('Ab');
  expect(cb1.mock.calls[0][2]).toBe(2);
  expect(cb1.mock.calls[1][0]).toBe('/PATH/TO/MY/NODE');
  expect(cb1.mock.calls[1][1]).toBe('New');
  expect(cb1.mock.calls[1][2]).toBe(1);

  root.PATH.TO.ANOTHER.NODE.removeListener(id1);
});

test('on() should call the callback too on changes when values are updated from JOSN', async () => {
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

  const cb1 = jest.fn();
  const id1 = await root.PATH.NODE.on(cb1);
  const id2 = await root.PATH.NODE.ONE.on(cb1);
  const id3 = await root.PATH.NODE.TWO.on(cb1);

  root.PATH = {
    NODE: {
      Alfa: 'Test',
      Beta: 'Bello',
      ONE: { Omega: 'Ohm' },
      TWO: { Zeta: 'zeta' },
    },
  } as any;

  expect(cb1.mock.calls.length).toBe(1);
  expect(cb1.mock.calls[0][0]).toBe('/PATH/NODE');
  expect(cb1.mock.calls[0][1]).toBe('Beta');
  expect(cb1.mock.calls[0][2]).toBe('Bello');

  root.PATH = {
    NODE: {
      New: 'Hey',
    },
  } as any;

  expect(cb1.mock.calls.length).toBe(2);
  expect(cb1.mock.calls[1][0]).toBe('/PATH/NODE');
  expect(cb1.mock.calls[1][1]).toBe('New');
  expect(cb1.mock.calls[1][2]).toBe('Hey');

  root.PATH.NODE.off(cb1);
  root.PATH.NODE.ONE.off(cb1);
  root.PATH.NODE.TWO.off(cb1);
});

test('on() should filter the property when needed', async () => {
  root.PATH.TO.MY.NODE.Something = 1 as any;
  root.PATH.TO.MY.NODE.Interested = 1 as any;

  const cb1 = jest.fn();
  const id1 = await root.PATH.TO.MY.NODE.on('Interested', cb1);

  root.PATH.TO.MY.NODE.Something = 2 as any;
  root.PATH.TO.MY.NODE.Interested = 2 as any;

  expect(cb1.mock.calls.length).toBe(1);
  expect(cb1.mock.calls[0][0]).toBe('/PATH/TO/MY/NODE');
  expect(cb1.mock.calls[0][1]).toBe('Interested');
  expect(cb1.mock.calls[0][2]).toBe(2);

  root.PATH.TO.ANOTHER.NODE.removeListener(id1);
});

test('on() should filter the property and value when needed', async () => {
  root.PATH.TO.MY.NODE.Something = 1 as any;
  root.PATH.TO.MY.NODE.Interested = 1 as any;

  const cb1 = jest.fn();
  const id1 = await root.PATH.TO.MY.NODE.on('Interested=3', cb1);

  root.PATH.TO.MY.NODE.Something = 2 as any;
  root.PATH.TO.MY.NODE.Interested = 2 as any;
  root.PATH.TO.MY.NODE.Interested = 3 as any;

  expect(cb1.mock.calls.length).toBe(1);
  expect(cb1.mock.calls[0][0]).toBe('/PATH/TO/MY/NODE');
  expect(cb1.mock.calls[0][1]).toBe('Interested');
  expect(cb1.mock.calls[0][2]).toBe(3);

  root.PATH.TO.ANOTHER.NODE.removeListener(id1);
});

test('removeListener should remove the callback', async () => {
  root.PATH.TO.MY.NODE.Ab = 1 as any;

  const cb1 = jest.fn();
  const cb2 = jest.fn();
  const id1 = await root.PATH.TO.MY.NODE.on(cb1);
  const id2 = await root.PATH.TO.ANOTHER.NODE.on(cb1);

  root.PATH.TO.MY.NODE.Ab = 2 as any;

  root.PATH.TO.ANOTHER.NODE.removeListener(id1);

  root.PATH.TO.MY.NODE.Ab = 3 as any;

  root.PATH.TO.ANOTHER.NODE.removeListener(id2);

  expect(cb1.mock.calls.length).toBe(2);
  expect(cb1.mock.calls[0][0]).toBe('/PATH/TO/MY/NODE');
  expect(cb1.mock.calls[0][1]).toBe('Ab');
  expect(cb1.mock.calls[0][2]).toBe(2);
});

test('once should call the callback only once', async () => {
  root.PATH.TO.MY.NODE.Something = 1 as any;
  root.PATH.TO.MY.NODE.Interested = 1 as any;

  const cb1 = jest.fn();
  const id1 = await root.PATH.TO.MY.NODE.once('Interested=3', cb1);

  root.PATH.TO.MY.NODE.Something = 2 as any;
  root.PATH.TO.MY.NODE.Interested = 2 as any;
  root.PATH.TO.MY.NODE.Interested = 3 as any;
});

test('waitFor should fullfill when the requested change occurs', async () => {
  root.PATH.TO.MY.NODE.Something = 1 as any;
  root.PATH.TO.MY.NODE.Interested = 1 as any;
  setTimeout(() => {
    root.PATH.TO.MY.NODE.Interested = 2 as any;
  }, 100);
  setTimeout(() => {
    root.PATH.TO.MY.NODE.Interested = 3 as any;
  }, 150);

  await root.PATH.TO.MY.NODE.waitFor('Interested=3');

  expect(root.PATH.TO.MY.NODE.Interested).toBe(3);
});
