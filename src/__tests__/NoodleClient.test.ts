import { NoodleClient } from '../index';
test('Defaults', () => {
  const client = NoodleClient();
  expect(client.lw3client.waitresponses).toBeFalsy();
  expect(client.name).toBe('default');
  client.__close__();
});
