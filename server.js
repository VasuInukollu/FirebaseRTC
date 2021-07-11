const static = require('node-static');
const fs = require('fs');
const https = require("https")
const Socket = require("websocket").server


var file = new (static.Server)('../public');

const options = {
    key: fs.readFileSync('./cert/key.pem'),
    cert: fs.readFileSync('./cert/cert.pem'),
};

const server = https.createServer(options, (req, res) => {
    file.serve(req, res);
})

server.listen(443, () => {
    console.log("Listening on port ...", server._connectionKey)
})

const webSocketa = new Socket({ httpServer: server })

let users = []

webSocketa.on('request', (req) => {

    const connection = req.accept()

    connection.on('message', (message) => {
        const data = JSON.parse(message.utf8Data)
        console.log(data);

        const user = findUser(data.username)

        switch (data.type) {
            case "store_user":

                if (user != null) {
                    return
                }

                const newUser = {
                    conn: connection,
                    username: data.username
                }

                users.push(newUser)
                console.log('agent added:' + data.username)
                break
            case "store_offer":
                if (user == null)
                    return
                user.offer = data.offer
                break

            case "store_candidate":
                if (user == null) {
                    return
                }
                if (user.candidates == null)
                    user.candidates = []

                user.candidates.push(data.candidate)
                break
            case "send_answer":
                if (user == null) {
                    return
                }

                sendData({
                    type: "answer",
                    answer: data.answer
                }, user.conn)
                break
            case "send_candidate":
                if (user == null) {
                    return
                }

                sendData({
                    type: "candidate",
                    candidate: data.candidate
                }, user.conn)
                break
            case "join_call":
                if (user == null) {
                    return
                }

                sendData({
                    type: "offer",
                    offer: user.offer
                }, connection)

                user.candidates.forEach(candidate => {
                    sendData({
                        type: "candidate",
                        candidate: candidate
                    }, connection)
                })

                break
        }
    })

    connection.on('close', (reason, description) => {
        users.forEach(user => {
            if (user.conn == connection) {
                users.splice(users.indexOf(user), 1)
                console.log('agent removed:' + user.username)
                return
            }
        })
    })
})

function sendData(data, conn) {
    conn.send(JSON.stringify(data))
}

function findUser(username) {
    for (let i = 0; i < users.length; i++) {
        if (users[i].username == username)
            return users[i]
    }
}
