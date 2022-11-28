const lwnoodle = require('./../lib');

//init server
var server = lwnoodle.noodleServer({'port':6107, 'host':'127.0.0.1'});

//some static property
server.PartNumber = 983245;
server.MEDIA.XP.DestinationConnectionStatus = '1;2;3;4;5';
server.MANAGEMENT.VERSIONS = process.versions;

//some changing property
server.MANAGEMENT.UPTIME.Counter__man__='Counting since boot';
var a = 0;
setInterval(()=>{server.MANAGEMENT.UPTIME.Counter = a++;}, 1000);
setInterval(()=>{server.MANAGEMENT.MEMORY = process.memoryUsage()}, 1000);
setInterval(()=>{server.MANAGEMENT.RESOURCES = process.resourceUsage()}, 1000);
setInterval(()=>{server.MANAGEMENT.RESOURCES.CPU = process.cpuUsage()}, 1000);

//assign multiple property from json
server.MEDIA.PORTS.O1 = {
    STATUS: {
        Resolution: '1920x1080p60',
        Connected: true,        
    },
    SETTINGS: {
        EnableSomething: false
    }
}
server.MEDIA.PORTS.O1.SETTINGS.EnableSomething__rw__ = true;  //make a property writeable
server.MEDIA.PORTS.O1.SETTINGS.on('EnableSomething',(path,prop,val)=>console.log('new setting:',val)); // callback when changed

//some method example
server.MANAGEMENT.hello = () => { console.log('greetings'); return 'Hi'; }
server.MEDIA.XP.switchAll = (inp) => { server.MEDIA.XP.DestinationConnectionStatus=(inp+';').repeat(5); return 'ok'; }

//symlink
server.DEVICES.COUNTER = server.MANAGEMENT.UPTIME
server.DEVICES.INPUT = server.MEDIA.PORTS.O1

console.log('running...');