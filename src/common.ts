/**
 *  Converts the given dictionary into a function, thus we can create apply proxy around it
 * you can use apply() on functions, that's why we should convert dictionaries to functions
 */
export function obj2fun(object: object): () => void {
  const func = () => {
    /* */
  };
  for (const prop in object) {
    if (object.hasOwnProperty(prop)) {
      func[prop as keyof typeof func] = object[prop as keyof object];
    }
  }
  return func;
}

/* Helper function, convert common values to appropriate JavaScript types. (integer / boolean / list) */
export function convertValue(value: string) {
  let retvalue: any;
  const trimmedvalue = value.trim();
  if (value.indexOf(';') !== -1) {
    retvalue = value.split(';');
    if (retvalue.slice(-1)[0] === '') retvalue.pop();
    for (let i = 0; i < retvalue.length; i++) retvalue[i] = convertValue(retvalue[i]);
  } else if (!isNaN(Number(trimmedvalue)) && trimmedvalue.length) retvalue = Number(trimmedvalue);
  else if (value.toUpperCase() === 'FALSE') retvalue = false;
  else if (value.toUpperCase() === 'TRUE') retvalue = true;
  else retvalue = value;
  return retvalue;
}
