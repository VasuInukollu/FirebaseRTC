mdc.ripple.MDCRipple.attachTo(document.querySelector('.mdc-button'));

const configuration = {
  iceServers: [
    {
      urls: [
        'stun:stun1.l.google.com:19302',
        'stun:stun2.l.google.com:19302',
      ],
    },
  ],
  iceCandidatePoolSize: 10,
};

let websocket = null;
let peerConnection = null;
let localStream = null;
let remoteStream = null;
let roomDialog = null;
let roomId = null;

async function init() {
  document.querySelector('#cameraBtn').addEventListener('click', openUserMedia);
  document.querySelector('#hangupBtn').addEventListener('click', hangUp);
  document.querySelector('#createBtn').addEventListener('click', createRoom);
  document.querySelector('#joinBtn').addEventListener('click', joinRoom);
  roomDialog = new mdc.dialog.MDCDialog(document.querySelector('#room-dialog'));

  websocket = new WebSocket("wss://" + window.location.hostname + (window.location.port ? ':' + window.location.port : ''));

  websocket.onmessage = async (event) => {
    const data = JSON.parse(event.data);

    switch (data.action) {
      case "roomInfo":
        await joinRoomByInfo(data.data);
        break;
      case "answer":
        if (!peerConnection.currentRemoteDescription) {
          console.log('Got remote description: ', data.data);
          const rtcSessionDescription = new RTCSessionDescription(data.data);
          await peerConnection.setRemoteDescription(rtcSessionDescription);
        }
        break
      case "calleeCandidate":
        console.log(`Got new remote ICE candidate: ${JSON.stringify(data.data)}`);
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.data));
        break
    }

  }

}

function uuid() {
  var chars = '0123456789abcdef'.split('');
  var uuid = [], rnd = Math.random, r;
  uuid[8] = uuid[13] = uuid[18] = uuid[23] = '-';
  uuid[14] = '4'; // version 4
  for (var i = 0; i < 36; i++) {
    if (!uuid[i]) {
      r = 0 | rnd() * 16;
      uuid[i] = chars[(i == 19) ? (r & 0x3) | 0x8 : r & 0xf];
    }
  }
  return uuid.join('');
}

function sendData(roomId, action, data) {
  websocket.send(JSON.stringify({ roomId: roomId, action: action, data: data }));
}


async function createRoom() {
  document.querySelector('#createBtn').disabled = true;
  document.querySelector('#joinBtn').disabled = true;

  roomId = uuid();
  sendData(roomId, 'createRoom', {});

  console.log('Create PeerConnection with configuration: ', configuration);
  peerConnection = new RTCPeerConnection(configuration);

  registerPeerConnectionListeners();

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  // Code for collecting ICE candidates below
  peerConnection.addEventListener('icecandidate', event => {
    if (!event.candidate) {
      console.log('Got final candidate!');
      return;
    }
    console.log('Got candidate: ', event.candidate);
    sendData(roomId, 'callerCandidate', event.candidate);
  });
  // Code for collecting ICE candidates above

  // Code for creating a room below
  const offer = await peerConnection.createOffer();
  await peerConnection.setLocalDescription(offer);
  console.log('Created offer:', offer);

  sendData(roomId, 'offer', {
    type: offer.type,
    sdp: offer.sdp,
  });

  console.log(`New room created with SDP offer. Room ID: ${roomId}`);
  document.querySelector(
    '#currentRoom').innerText = `Current room is ${roomId} - You are the caller!`;
  // Code for creating a room above

  peerConnection.addEventListener('track', event => {
    console.log('Got remote track:', event.streams[0]);
    event.streams[0].getTracks().forEach(track => {
      console.log('Add a track to the remoteStream:', track);
      remoteStream.addTrack(track);
    });
  });

}

function joinRoom() {
  document.querySelector('#createBtn').disabled = true;
  document.querySelector('#joinBtn').disabled = true;

  document.querySelector('#confirmJoinBtn').
    addEventListener('click', async () => {
      roomId = document.querySelector('#room-id').value;
      console.log('Join room: ', roomId);
      document.querySelector(
        '#currentRoom').innerText = `Current room is ${roomId} - You are the callee!`;
      findRoomById(roomId);
    }, { once: true });
  roomDialog.open();
}

function findRoomById(roomId) {
  sendData(roomId, 'findRoom', {});
}

async function joinRoomByInfo(room) {
  console.log('Got room:', room);

  console.log('Create PeerConnection with configuration: ', configuration);
  peerConnection = new RTCPeerConnection(configuration);
  registerPeerConnectionListeners();
  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  // Code for collecting ICE candidates below
  peerConnection.addEventListener('icecandidate', event => {
    if (!event.candidate) {
      console.log('Got final candidate!');
      return;
    }
    console.log('Got candidate: ', event.candidate);
    sendData(roomId, 'calleeCandidate', event.candidate);
  });
  // Code for collecting ICE candidates above

  peerConnection.addEventListener('track', event => {
    console.log('Got remote track:', event.streams[0]);
    event.streams[0].getTracks().forEach(track => {
      console.log('Add a track to the remoteStream:', track);
      remoteStream.addTrack(track);
    });
  });

  // Code for creating SDP answer below
  console.log('Got offer:', room.offer);
  await peerConnection.setRemoteDescription(new RTCSessionDescription(room.offer));
  const answer = await peerConnection.createAnswer();
  console.log('Created answer:', answer);
  await peerConnection.setLocalDescription(answer);

  sendData(roomId, 'answer', {
    type: answer.type,
    sdp: answer.sdp,
  });
  // Code for creating SDP answer above

  // Listening for remote ICE candidates below
  room.callerCandidates.forEach(async (candidate) => {
    console.log(`Got new remote ICE candidate: ${JSON.stringify(candidate)}`);
    await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
  });
  // Listening for remote ICE candidates above
}

async function openUserMedia(e) {
  const stream = await navigator.mediaDevices.getUserMedia(
    { video: true, audio: true });
  document.querySelector('#localVideo').srcObject = stream;
  localStream = stream;
  remoteStream = new MediaStream();
  document.querySelector('#remoteVideo').srcObject = remoteStream;

  console.log('Stream:', document.querySelector('#localVideo').srcObject);
  document.querySelector('#cameraBtn').disabled = true;
  document.querySelector('#joinBtn').disabled = false;
  document.querySelector('#createBtn').disabled = false;
  document.querySelector('#hangupBtn').disabled = false;
}

async function hangUp(e) {
  const tracks = document.querySelector('#localVideo').srcObject.getTracks();
  tracks.forEach(track => {
    track.stop();
  });

  if (remoteStream) {
    remoteStream.getTracks().forEach(track => track.stop());
  }

  if (peerConnection) {
    peerConnection.close();
  }

  document.querySelector('#localVideo').srcObject = null;
  document.querySelector('#remoteVideo').srcObject = null;
  document.querySelector('#cameraBtn').disabled = false;
  document.querySelector('#joinBtn').disabled = true;
  document.querySelector('#createBtn').disabled = true;
  document.querySelector('#hangupBtn').disabled = true;
  document.querySelector('#currentRoom').innerText = '';

  // Delete room on hangup
  if (roomId) {
    sendData(roomId, 'destroyRoom', {});
  }

  document.location.reload(true);
}

function registerPeerConnectionListeners() {
  peerConnection.addEventListener('icegatheringstatechange', () => {
    console.log(
      `ICE gathering state changed: ${peerConnection.iceGatheringState}`);
  });

  peerConnection.addEventListener('connectionstatechange', () => {
    console.log(`Connection state change: ${peerConnection.connectionState}`);
  });

  peerConnection.addEventListener('signalingstatechange', () => {
    console.log(`Signaling state change: ${peerConnection.signalingState}`);
  });

  peerConnection.addEventListener('iceconnectionstatechange ', () => {
    console.log(
      `ICE connection state change: ${peerConnection.iceConnectionState}`);
  });
}

init();
