import { Lw3Client } from '../lw3client';
import { TcpServerConnection } from '../tcpserverconnection';
import Debug from 'debug';
import { sleep, waitForAnEvent } from './helpers';
import { TcpClientConnection } from '../tcpclientconnection';
const debug = Debug('Test');

Debug.enable('TcpServerConnection,Test,Lw3Client');

test('Escaping', () => {
  const testbenches = [
    ['árvíztűrő tükörfúrógép', 'árvíztűrő tükörfúrógép'],
    ['test\nelek\ntest\ttest\ttest', 'test\\nelek\\ntest\\ttest\\ttest'],
  ];
  for (const test of testbenches) {
    expect(Lw3Client.escape(test[0])).toBe(test[1]);
    expect(Lw3Client.unescape(test[1])).toBe(test[0]);
    expect(Lw3Client.unescape(Lw3Client.unescape(Lw3Client.escape(Lw3Client.escape(test[0]))))).toBe(test[0]);
  }
});

test('GET', async ()=> {
    const testbenches = [
        ['/TEST/NODE.property', 'pr /TEST/NODE.property=test\\nvalue', 'test\nvalue'],
        ['/TEST/NODE.property', 'pw /TEST/NODE.property=test\\tvalue', 'test\tvalue'],
        ['/TEST/NODE.property', 'pw /TEST/NODE.property=true', true],
        ['/TEST/NODE.property', 'pw /TEST/NODE.property=5', 5],
        ['/TEST/NODE.property', 'pw /TEST/NODE.property=5.42', 5.42],
        ['/TEST/NODE.property', 'pw /TEST/NODE.property=true;false;1;2;3;O1', [true,false,1,2,3,'O1']],
    ];
    const server = new TcpServerConnection(6107);
    await waitForAnEvent(server, 'listening', debug);
    const client = new Lw3Client(new TcpClientConnection());
    await waitForAnEvent(client, 'connect', debug);
    let testbenchId:number;
    server.on('frame', (id,data)=>{ 
        var parts = data.split('#');
        expect(parts[1]).toBe('GET '+testbenches[testbenchId][0]);
        server.write(1,'{'+parts[0]+'\n'+testbenches[testbenchId][1]+'\n}\n'); 
    });
    for (testbenchId = 0; testbenchId<testbenches.length; testbenchId++) {
        var test = await client.GET(testbenches[testbenchId][0] as string);
        expect(test).toStrictEqual(testbenches[testbenchId][2]);
    }
    client.close();
    server.close();
    await waitForAnEvent(server, 'close', debug);
});