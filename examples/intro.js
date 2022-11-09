const lwnoodle = require('./../lib');


var server = lwnoodle.noodleServer({'host':6107, 'port':'127.0.0.1'});

//some property
server.PartNumber = 983245;
server.MEDIA.XP.DestinationConnectionStatus = '1;2;3;4;5';

//some counting property
server.MANAGEMENT.UPTIME.Counter__man__='Counting since boot';
var a = 0;
setInterval(()=>{server.MANAGEMENT.UPTIME.Counter = a++;}, 1000);

//assign from json
server.MEDIA.PORTS.O1 = {
    STATUS: {
        Resolution: '1920x1080p60',
        Connected: true,        
    },
    SETTINGS: {
        EnableSomething: false
    }
}
server.MEDIA.PORTS.O1.SETTINGS.EnableSomething__rw__ = true;  //make it writeable
server.MEDIA.PORTS.O1.SETTINGS.on('EnableSomething',(path,prop,val)=>console.log('new setting:',val));

//some method example

server.MANAGEMENT.hello = () => { console.log('greetings'); return 'Hi'; }
server.MEDIA.XP.switchAll = (inp) => { server.MEDIA.XP.DestinationConnectionStatus=(inp+';').repeat(5); return 'ok'; }

console.log('running...');