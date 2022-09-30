import { escape, unescape } from '../escaping';

test('escaping and unescaping', () => {
  //  \ { } # % ( ) \r \n \t
  const testbenches = [
    ['árvíztűrő tükörfúrógép', 'árvíztűrő tükörfúrógép'],
    ['test\nelek\ntest\ttest\ttest', 'test\\nelek\\ntest\\ttest\\ttest'],
    ['hello{}\\()', 'hello\\{\\}\\\\\\(\\)'],
    ['test#dfs%dfsd', 'test\\#dfs\\%dfsd'],
  ];
  for (const test of testbenches) {
    expect(escape(test[0])).toBe(test[1]);
    expect(unescape(test[1])).toBe(test[0]);
    expect(unescape(unescape(escape(escape(test[0]))))).toBe(test[0]);
  }
});
