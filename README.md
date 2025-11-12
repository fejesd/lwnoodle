[![License](https://img.shields.io/badge/License-BSD_3--Clause-blue.svg)](https://opensource.org/licenses/BSD-3-Clause)
![Automated tests](https://github.com/fejesd/lwnoodle/actions/workflows/node.js.yml/badge.svg) 
![TSLint](https://github.com/fejesd/lwnoodle/actions/workflows/lint.js.yml/badge.svg)
![code coverage lines](coverage/badge-lines.svg)
![code coverage functions](coverage/badge-functions.svg)
![code coverage statements](coverage/badge-statements.svg)
![code coverage branches](coverage/badge-branches.svg)

# LwNoodle

LwNoodle is a server-client architecture based library where the server represents different status, settings and callable functions in a tree-organized structure and arbitrary number of clients can read / modify / call these items. Instead of synchronizing the whole tree, LwNoodle clients read only the requested information. If the client is interested of a change of some values, listeners can be added instead of polling values.
LwNoodle provide a nice dynamic object-relational-model syntax, while supporting typescript enables nice code-completion in your favorite IDE. 

## Example

Install the module from npm:

```bash
$ npm install lwnoodle
```

Server side:

```javascript
const lwnoodle = require('lwnoodle');

const server = lwnoodle.noodleServer({host:'127.0.0.1'});  

server.APPLICATION.Name = 'My Application';
server.LED.setRGB = (r,g,b) => { /* do something with r,g,b values */}
server.AUDIO.SoundLevel = 50;
server.AUDIO.on('SoundLevel', (path, prop, value)=>{ /* do something with the new value when it has changed*/})
setInterval(()=>{ server.APPLICATION.STATUS.Time = Date.now(); }, 1000);    // update APPLICATION.STATUS.Time in every second
```

And on client side:

```javascript
const lwnoodle = require('lwnoodle');

const noodle = lwnoodle.noodleClient('192.168.0.1');  

await noodle.__connect__();  // you might want to wait while the connection created. You need to make an await

console.log(await noodle.APPLICATION.Name); // 'My Application'
noodle.LED.setRGB(10,20,30); // call the function on the server
noodle.AUDIO.SoundLevel = 50;   // Update sound level. Server-side callback listener will be called
noodle.APPLICATION.STATUS.on('Time', (path, prop, value)=>{ console.log(value); }); // will print the new values of timestamp
```

# Features

* Tree like structure, freely extendable by custom nodes and leafs. Leafs are properties and methods.
* Properties can be read-only or readable/writable for the clients
* Methods can have arbitrary number of parameters
* Data types for properties can be strings, numbers, boolean or lists
* Arbitrary number of clients can connect
* A client can listen for arbitrary number of nodes / properties* 
* All methods / properties can have optionally a description (manual), which can be queried by the clients. 
* Symbolic links can be created within the tree
* Supports raw TCP socket connection and WebSocket (incl. secure websockets)
* Typescript support

## Protocol

By default, LW3 protocol is used for client-server communication, so it can be used to communicate with devices / softwares supporting LW3 protocol. In the future, other protocols might be added. 

More about LW3 Protocol: https://lightware.com/pub/media/lightware/filedownloader/file/White-Paper/Lightware_s_Open_API_Environment_v3.pdf

*DISCLAIMER: This project is not officially supported by Lightware. There are no guarantee that it will work in your production environment*

### Extended commands

In addition to standard LW3 GET variants, the server supports an aggregated command:

```
GETALL /PATH/TO/NODE
```

This returns in a single response block the combined output of:

```
GET /PATH/TO/NODE        (lists subnodes as n- lines)
GET /PATH/TO/NODE.*      (lists properties and methods)
```

If the node doesn't exist, a single error line is returned. This is useful to reduce round-trips when a client needs the full snapshot of a node hierarchy and its members. Client side helper may be added in the future; currently you can issue the raw command over the connection.

# Client reference

noodleClient will create a client connection:

```javascript

const noodle = noodleClient('192.168.0.10');        

const noodle = noodleClient({host: '192.168.0.10', port: '1010'});        

const noodle = noodleClient({host: '192.168.0.10', waitresponses:true});  // will wait response before sending the next request to the server. Used for debugging.

```

## Getting / setting properties

```javascript
//Getting properties. Return values are casted to string, boolean, number or Array<string> based on the value

console.log('Part number is ',await noodle.PartNumber);

if (await noodle.MEDIA.GPIO.P7.InputState) {
    :
}
```

Setting properties:

```javascript
noodle.MEDIA.GPIO.P1.State = 'High';

//setting is done in async manner in the background. If you need to wait while it completes, please use:

await noodle.__sync__();
```

## Methods

Call methods:

```javascript
const result = await noodle.MEDIA.GPIO.P1.toggle();  

await noodle.MEDIA.XP.switch('I1','O1);

```

You can watch for changes:

```javascript
// Add listener functions

noodle.MEDIA.PORTS.I1.on('SignalPresent', (path,property,value)=>{
    // will be called when 'SignalPresent' property has been changed
});

noodle.MEDIA.PORTS.I1.on('SignalPresent=true', (path,property,value)=>{
    // will be called when 'SignalPresent' property has been changed to true
});

noodle.MEDIA.PORTS.I1.on('*', (path,property,value)=>{
    // will called on any changes on MEDIA.PORTS.I1
});

noodle.MEDIA.PORTS.I1.on((path,property,value)=>{
    // same as above, you can just omit the first parameter
});

```

Or just add a one time listener:

```javascript

noodle.MEDIA.PORTS.I1.once('SignalPresent', (path,property,value)=>{
    // will be called only once
});

```

You can wait for an event with waitFor

```javascript
await noodle.MEDIA.PORTS.I1.waitFor('SignalPresent=true');
```

## Synchronize a node to the client

When you request for a property, it needs to be async as it will trigger communication between client and server. Sometimes you need a faster, real-time response.
By creating live object, you will have a local copy of the node. Please note, that subnodes will be not synchronized.

```javascript
const mynode = lwnoodle.live(noodle.APPLICATION.STATUS);

// then use it anytime later

console.log(mynode.Time); //Time property will hold the actual value, kept updated automatically

// also you can get anytime a copy of the actual snapshot of the node:

const snapshot = mynode.getSnapshot();

console.log(snapshot.Time); //This is a regular static object, Time will not be updated in the background

```

```

```

# Server reference

noodleServer will create a server object which starts listening immediately:

```javascript

const server = noodleServer();          // default port number is 6107

const server = noodleServer(6107);      // port number

const server = noodleServer({port: 6107}); // port number

const server = noodleServer({port: 6107, type:'tcp'}); // same as above

const server = noodleServer({port: 6107, type:'ws'}); // use websocket instead of raw TCP socket

const server = noodleServer([{port: 6107},{port: 6108, type:'ws'}]); // use port 6107 for TCP and 6108 for websocket, use two server backend at same time.

const server = noodleServer({port: 6107, type:'wss', key: key_in_pem_format, cert: cert_in_pem_format}); 
// use port 6107 for secure websocket, key and cert has to be in PEM format
// of course, this kind of server can be used with other types, like raw TCP socket clients as well

```


## Defining nodes, properties, methods

Just define them:

```javascript

server.PATH.TO.MY.NODE.MyProperty = 'something';

server.PATH.TO.MY.NODE.myMethod = (a,b) => { return a+b; };

```

Methods can have arbitrary number of parameters. The return value will be sent back to the client.

You can define the methods and properties via a json:

```javascript

server.PATH.TO.MY.NODE.MyProperty = {value:'something', manual:'this is my property', rw: false};

server.PATH.TO.MY.NODE.myMethod = {func:myFunction, manual:'this is my property'};

```

Or you can modify read-write flag / description this way:

```javascript
server.PATH.TO.MY.NODE.MyProperty = 'something';
server.PATH.TO.MY.NODE.MyProperty__rw__ = false;
server.PATH.TO.MY.NODE.MyProperty__manual_ = 'this is my property';
```

When use the __rw__ after the property name, then you can set the read-write flag. When you use __manual__ after the property name, then you can set the description.

## Callbacks

You can set up callback listeners, which are called when the property is modified either by server or client:

```javascript

server.PATH.TO.MY.NODE.on('MyProperty', (path, property, value)=>{ /* */});
server.PATH.TO.MY.NODE.on('MyProperty=watchedValue', (path, property, value)=>{ /* */});
server.PATH.TO.MY.NODE.on('*', (path, property, value)=>{ /* */});  // will trigger on any changes
server.PATH.TO.MY.NODE.on((path, property, value)=>{ /* */});  // same as above

When calling once, the callback will be removed after the first call:

server.PATH.TO.MY.NODE.once('MyProperty', (path, property, value)=>{ /* */});  // will trigger once

If you call waitFor, it will wait for a change and return the new value. It is an async function, so you need to use await. This is useful for waiting for a change in a property:

await server.PATH.TO.MY.NODE.waitFor('MyProperty=watchedValue');    // wait for a change

```

## JSON conversions

Getting / modifying a single property might be inefficient as lots of magic stuff is involved in the background. If you need to read / write multiple properties, it is better to convert it to/from JSON.

```javascript

server.MY.SETTINGS = {
    Led1: True,
    Led2: False,
    Volume: 12,    
    LCD: {
        Brightness: 50,
        Title: 'Hello'
    }
}

server.MY.SETTINGS.toJSON()    // will return the same thing

```

## Creating symbolic links

You can create any number of symbolic links within the tree. Example:

```javascript
server.DEVICES.DEV1.Name = 'Some important device';

server.BUILDINGS.MAIN.ROOM1.DISPLAY = server.DEVICES.DEV1;  

// server.BUILDINGS.MAIN.ROOM1.DISPLAY.Name and server.DEVICES.DEV1.Name refers to the same object.  
```


# Naming conventions

The library relies on name conventions: nodes shall be UPPERCASE, Property names shall be CamelCase, methods are lowerCamelCase. 

Also you can force casting if needed:

```javascript
console.log(noodle.DATE.time__property__)           //by adding __property__, this will behave as a property
noodle.DATE.Apply__method__();                      //cast to method
noodle.MANAGEMENT.Settings__node__.Enabled=true;    //cast to node
```

# Use with typescript

Type definition is included in the package, so you will have nice code completion with your IDE. 

Because of the tricks involved about ORM and ES6 Proxies, when using tpyescript a casting to any is needed while setting a property:

```typescript app.ts

noodle.PATH.TO.MY.NODE.PropertyName = 'something';    // will raise a compilation-time error

//They will work as expected:

noodle.PATH.TO.MY.NODE.PropertyName = 'something' as any;  
noodle.PATH.TO.MY.NODE.PropertyName = 42 as any;
noodle.PATH.TO.MY.NODE.PropertyName = true as any;

```

