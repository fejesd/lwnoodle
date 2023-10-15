const lwnoodle = require('./../lib');

//init server
var client = lwnoodle.noodleClient([{'port':6107, 'host':'127.0.0.1', type:'tcp'}, {'port':6108, 'host':'127.0.0.1', type:'ws'}]);

(async () =>{

    await client.__connect__(); //wait while the connection estabilishes

    console.log('Partnumber: ', await client.PartNumber);

    client.DEVICES.INPUT.SETTINGS.EnableSomething = 'test';
    await client.__sync__();    //optional, just if you need to wait while the previous operation finishes in the background

    client.MANAGEMENT.UPTIME.on('Counter', (path, property, value)=>{console.log(value);});

    client.MANAGEMENT.RESOURCES.on((path, property, value)=>{/* do something */});

    client.MANAGEMENT.RESOURCES.once((path, property, value)=>{/* will fire only once */});

    await client.MEDIA.PORTS.O1.STATUS.waitFor('Connected=false');  //wait for a specific value
})();