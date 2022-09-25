![Automated tests](https://github.com/fejesd/lwnoodle/actions/workflows/node.js.yml/badge.svg) 
![TSLint](https://github.com/fejesd/lwnoodle/actions/workflows/lint.js.yml/badge.svg)
![code coverage lines](coverage/badge-lines.svg)
![code coverage functions](coverage/badge-functions.svg)
![code coverage statements](coverage/badge-statements.svg)
![code coverage branches](coverage/badge-branches.svg)


# Lightware 3 client for NodeJS

*Disclaimer: This is not an official repository, just my private hobby project for learning NodeJS. There are no guarantee that it will work as expected and there are no official support. Please use it on your own responsibility.*

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

Then just use it the instinctive way:

Getting properties:

```javascript
//Getting properties. Return values are casted to string, boolean, number or Array<string>

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
