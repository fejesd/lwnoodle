import { TcpClientConnection } from '../tcpclientconnection';
import { TcpServerConnection } from '../tcpserverconnection';
import { EventEmitter } from 'node:events';
import Debug from 'debug';

Debug.enable('TcpClientConnection,TcpServerConnection');

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Will wait for an eventName event on obj object. It will reject if timeout has been reached.
 * @param obj 
 * @param eventName 
 * @param timeout 
 * @returns 
 */
async function waitForAnEvent(obj:EventEmitter, eventName:string, count:number=1, timeout:number=1000):Promise<void> {
  return new Promise((resolve, reject)=>{
    const timer = setTimeout(()=>{ 
      obj.removeAllListeners(eventName);
      // tslint:disable-next-line:no-console
      console.log(`Timeout... no ${eventName} event was received`);
      reject();      
    }, timeout);
    obj.on(eventName, ()=>{
      if (--count==0) {         
        clearTimeout(timer);
        obj.removeAllListeners(eventName);
        resolve();
      }
    })    
  });
}

test('Single connection', async () => {
  const server = new TcpServerConnection(6107);  
  try {
    await waitForAnEvent(server, 'listening');
    const client = new TcpClientConnection('127.0.0.1', 6107);
    await waitForAnEvent(client, 'connect');
    expect(client.isConnected()).toBe(true);
    client.close();    
    await waitForAnEvent(client, 'close');    
  } finally {
    server.close();
    await waitForAnEvent(server, 'close');        
  }  
});

test('Multiple connection', async () => {
  const server = new TcpServerConnection(6107);  
  try {
    await waitForAnEvent(server, 'listening');
    const client1 = new TcpClientConnection('127.0.0.1', 6107);  
    const client2 = new TcpClientConnection('127.0.0.1', 6107);  
    const client3 = new TcpClientConnection('127.0.0.1', 6107);
    await waitForAnEvent(server, 'connect', 3);    
    expect(server.getConnectionCount()).toBe(3);

    client1.close();
    await waitForAnEvent(client1, 'close');  
    expect(server.getConnectionCount()).toBe(2);

    client3.close();
    await waitForAnEvent(client3, 'close');    
    expect(server.getConnectionCount()).toBe(1);

    client2.close();
    await waitForAnEvent(client2, 'close');    
    expect(server.getConnectionCount()).toBe(0);
  } finally {
    server.close();
    await waitForAnEvent(server, 'close');    
  }
});

test('Sending message in both ways', async () => {
  let msg: any[][] = [];
  const server = new TcpServerConnection(6107);
  try {
    await waitForAnEvent(server, 'listening');
    server.on('frame', (id, data) => {
      msg.push([id, data]);
    });  
    const client1 = new TcpClientConnection('127.0.0.1', 6107);
    await waitForAnEvent(client1, 'connect');
    client1.write('Hello world!\nTest');
    client1.write(' this\nuncompleted');
    await sleep(500);    
    expect(msg.length).toBe(2);
    expect(msg[0][1]).toBe('Hello world!');
    expect(msg[1][1]).toBe('Test this');
    msg = [];
    client1.on('frame', (data) => {
      msg.push([0, data]);
    });
    server.write(1, 'Hello!\nTada');
    server.write(1, '\nhey');    
    await sleep(500);
    expect(msg.length).toBe(2);
    expect(msg[0][1]).toBe('Hello!');
    expect(msg[1][1]).toBe('Tada');
    client1.close();
  } finally {
    server.close();
    await waitForAnEvent(server, 'close');
  }  
});
