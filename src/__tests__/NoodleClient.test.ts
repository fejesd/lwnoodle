import { NoodleClient } from '../index';
test('Defaults', () => {
  const client = NoodleClient();
  expect(client.host).toBe('127.0.0.1');
  expect(client.port).toBe(6107);
  expect(client.waitresponses).toBeFalsy();
  expect(client.name).toBe('default');
});
