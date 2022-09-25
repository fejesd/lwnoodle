[![License](https://img.shields.io/badge/License-BSD_3--Clause-blue.svg)](https://opensource.org/licenses/BSD-3-Clause)
![Automated tests](https://github.com/fejesd/lwnoodle/actions/workflows/node.js.yml/badge.svg) 
![TSLint](https://github.com/fejesd/lwnoodle/actions/workflows/lint.js.yml/badge.svg)
![code coverage lines](coverage/badge-lines.svg)
![code coverage functions](coverage/badge-functions.svg)
![code coverage statements](coverage/badge-statements.svg)
![code coverage branches](coverage/badge-branches.svg)


# LW3 client for Node

*DISCLAIMER: This is not an official repository, just a hobby project to learn Node. There are no guarantees that it will work as expected and as there is no official support. please use it on your own responsibility.*

More about LW3 Protocol: https://lightware.com/pub/media/lightware/filedownloader/file/White-Paper/Lightware_s_Open_API_Environment_v3.pdf

## Basic usage

Install the module from npm:

```bash
$ npm install lwnoodle
```

Create your first noodle client:

```javascript
const lwnoodle = require('lwnoodle');

:
const noodle = lwnoodle.NoodleClient('192.168.0.1');  

// you might want to wait while the connection created. You need to make an await:

await noodle.__connect__();
```

This library uses ES6 proxies to mimic the structure of the LW3 protocol. Just use it the instinctive way:

Getting properties:

```javascript
//Getting properties. Return values are casted to string, boolean, number or Array<string> based on the value

console.log('Part number is ',await noodle.PartNumber);

if (await noodle.MEDIA.GPIO.P7.InputState) {
    :
}
```

Setting properties:
```javascript
noodle.MEDIA.GPIO.P1.state = 'High';

//setting is done in async way in the background. If you need to wait while it completes, please use:

await noodle.__sync__();
```

Call methods:

```javascript
const result = await noodle.MEDIA.GPIO.P1.toggle();  

await noodle.MEDIA.XP.switch('I1','O1);

```

You can watch for changes:

```javascript
// Add listener functions

noodle.MEDIA.PORTS.I1.addListener((path,property,value)=>{
    :
});

noodle.MEDIA.PORTS.I1.addListener('SignalPresent', (path,property,value)=>{
    :
});

noodle.MEDIA.PORTS.I1.addListener('SignalPresent=true', (path,property,value)=>{
    :
});

// or just add a one time listener

noodle.MEDIA.PORTS.I1.once('SignalPresent', (path,property,value)=>{
    :
});

// wait for an event

await noodle.MEDIA.PORTS.I1.waitFor('SignalPresent=true');

```

You can create a local synchronized copy of a node which can be used without avait

```javascript
const mynode = lwnoodle.live(noodle.MANAGEMENT.DATETIME);

console.log(mynode.DateTime); //DateTime property will hold the actual value, kept updated automatically

```

## Naming conventions

The library relies on name conventions, that Property names shall be CamelCase, nodes shall be UPPERCASE, methods shall be lowercase. You can force casting:

```javascript
console.log(noodle.DATE.time__property__)           //by adding __property__, this will behave as a property
noodle.DATE.Apply__method__();                      //cast to method
noodle.MANAGEMENT.Settings__node__.Enabled=true;    //cast to node
```

## Use with typescript

Type definition is included in the package, so you will have nice code completion with your IDE. 

Because of the tricks involved about ORM and ES6 Proxies, when using tpyescript a casting to any is needed while setting a property:

```typescript app.ts

noodle.PATH.TO.MY.NODE.PropertyName = 'something';    // will raise a compilation-time error

//They will work as expected:

noodle.PATH.TO.MY.NODE.PropertyName = 'something' as any;  
noodle.PATH.TO.MY.NODE.PropertyName = 42 as any;
noodle.PATH.TO.MY.NODE.PropertyName = true as any;

```

