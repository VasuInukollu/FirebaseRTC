const static = require('node-static');
const fs = require('fs');
const https = require("https")
const http = require("http")
const Socket = require("websocket").server


var file = new (static.Server)('./public');

const options = {
    key: fs.readFileSync('./cert/key.pem'),
    cert: fs.readFileSync('./cert/cert.pem'),
};

var server = https.createServer(options, (req, res) => {
    file.serve(req, res);
});

server.listen(443, () => {
    console.log("Listening on port ...", server._connectionKey)
});

// http.createServer((req, res) => {
//     file.serve(req, res);
// }).listen(80, () => {
//     console.log("Listening on port ...", server._connectionKey)
// });


const websocket = new Socket({ httpServer: server });

let rooms = [];

websocket.on('request', (req) => {

    const connection = req.accept();

    connection.on('message', (message) => {
        const data = JSON.parse(message.utf8Data);
        // console.log(data);
        const room = findRoom(data.roomId);

        switch (data.action) {
            case "createRoom":
                if (room != null) {
                    return;
                }

                const newRoom = {
                    owner: connection,
                    roomId: data.roomId,
                    info: {
                        id: data.roomId
                    }
                };

                rooms.push(newRoom);
                console.log('room added:' + data.roomId);
                break
            case "callerCandidate":
                if (room.info.callerCandidates == null) room.info.callerCandidates = [];
                room.info.callerCandidates.push(data.data);
                console.log('caller candidate added:' + data.roomId);
                break;
            case "offer":
                room.info.offer = data.data;
                console.log('offer:' + data.roomId);
                break;
            case "findRoom":
                returnData(connection, 'roomInfo', room.info);
                console.log('found room:' + data.roomId);
                break;
            case "calleeCandidate":
                if (room.info.calleeCandidates == null) room.info.calleeCandidates = [];
                room.info.calleeCandidates.push(data.data);
                console.log('callee candidate added:' + data.roomId);
                returnData(room.owner, 'calleeCandidate', data.data);
                break;
            case "answer":
                room.info.answer = data.data;
                console.log('answer:' + data.roomId);
                returnData(room.owner, 'answer', data.data);
                break;
            case "destroyRoom":
                rooms.forEach(r => {
                    if (r.roomId == data.roomId) {
                        rooms.splice(rooms.indexOf(r), 1);
                        console.log('room removed:' + r.roomId);
                        return;
                    }
                });
                break;
        }
    });

    connection.on('close', (reason, description) => {
        rooms.forEach(r => {
            if (r.owner == connection) {
                rooms.splice(rooms.indexOf(r), 1);
                console.log('room removed:' + r.roomId);
                return;
            }
        });
    });
});

function findRoom(roomId) {
    for (let i = 0; i < rooms.length; i++) {
        if (rooms[i].roomId == roomId)
            return rooms[i];
    }
}

function returnData(connection, action, data) {
    connection.send(JSON.stringify({ action: action, data: data }));
}
