export type PropPrimitive = string | number | boolean;
// This type cannot be implicity converted from a PropPrimitve (or string).
// This is achieved by adding { readonly __brand: unique symbol }
// However it is SAFE to explicity cast a PropPrimitive to this type
export type PropValue = (PropPrimitive | PropPrimitive[]) & { readonly __brand: unique symbol };

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

function convertPrimitive(value: string): PropPrimitive {
  if (value.indexOf(';') !== -1) {
    throw new Error(`The following value was epxected to not be a list: ${value}`);
  }
  const trimmedvalue = value.trim();
  let retvalue: PropPrimitive;
  if (!isNaN(Number(trimmedvalue)) && trimmedvalue.length) retvalue = Number(trimmedvalue);
  else if (value.toUpperCase() === 'FALSE') retvalue = false;
  else if (value.toUpperCase() === 'TRUE') retvalue = true;
  else retvalue = value;
  return retvalue;
}

/* Helper function, convert common values to appropriate JavaScript types. (integer / boolean / list) */
export function convertValue(value: string): PropValue {
  let retvalue: PropValue;
  if (value.indexOf(';') !== -1) {
    const splitValue = value.split(';');
    const last = splitValue.slice(-1)[0];
    if (last === '') {
      splitValue.pop();
    }
    const primitiveList: PropPrimitive[] = [];
    for (const element of splitValue) {
      primitiveList.push(convertPrimitive(element));
    }
    retvalue = primitiveList as PropValue;
  } else {
    retvalue = convertPrimitive(value) as PropValue;
  }
  return retvalue;
}
