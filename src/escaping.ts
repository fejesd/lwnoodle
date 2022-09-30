/**
 * Escape string according to lw3 protocol
 * @param value string to escape
 */
export function escape(value: string): string {
  //  \ { } # % ( ) \r \n \t
  // todo : more efficient way
  value = value
    .replace(/\\/g, '\\\\')
    .replace(/\t/g, '\\t')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/{/g, '\\{')
    .replace(/}/g, '\\}')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)')
    .replace(/#/g, '\\#')
    .replace(/%/g, '\\%');
  return value;
}

/**
 * Unescape string according to lw3 protocol
 * @param value string to escape
 */
export function unescape(value: string): string {
  value = value
    .replace(/\\\\/g, '\\')
    .replace(/\\t/g, '\t')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\{/g, '{')
    .replace(/\\}/g, '}')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\#/g, '#')
    .replace(/\\%/g, '%');
  return value;
}
