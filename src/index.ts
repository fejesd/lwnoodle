interface NoodleClientParameters {
  /** Ip address or host. Default is 127.0.0.1 */
  host?: string;
  /** TCP port. Default is 6107 */
  port?: number;
  /** Optional name for this client */
  name?: string;
  /** Should we wait the responses, before send a new command. Default is false */
  waitresponses?: boolean;
}

interface NoodleClientObject {
  /** Ip address or host. */
  host: string;
  /** TCP port. */
  port: number;
  /** name for this client */
  name: string;
  /** Should we wait the responses, before send a new command */
  waitresponses: boolean;
  path: Array<string>;
}

export const NoodleClient = (options: NoodleClientParameters = {}) => {
  var clientObj: NoodleClientObject = {
    host: options.host || '127.0.0.1',
    port: options.port || 6107,
    name: options.name || 'default',
    waitresponses: options.waitresponses || false,
    path: [],
  };
  return new Proxy(clientObj, {
    apply: async function (target: NoodleClientObject, ctx, args) {},

    get: function (target: NoodleClientObject, key: string): any {
      if (key in target) return target[key as keyof typeof target]; // make target fields accessible. Is this needed?
    },

    set: function (target: NoodleClientObject, key: string, value: string): boolean {
      return true;
    },
  });
};
