const express = require('express');
const mqtt = require('mqtt');
const bodyParser = require('body-parser');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

// Bộ nhớ đệm lưu trạng thái
let deviceStates = {};  
let nodeStatus = {};    

// ======= MQTT Configuration ===========
const mqttOptions = {
    host: 'd246c46a2ebe40d2ae0c787f92bfdbab.s1.eu.hivemq.cloud',
    port: 8883,
    protocol: 'mqtts',
    username: 'hivemq.webclient.1742180699133',
    password: '#x1V7:H62pCZ%e&nGkgR',
    rejectUnauthorized: false,
    keepalive: 10 // Phát hiện mất kết nối nhanh hơn
};

const lightTopics = [
    'hoanghoahau/smartlight/node1/porch', 'hoanghoahau/smartlight/node1/living_room1',
    'hoanghoahau/smartlight/node2/living_room2', 'hoanghoahau/smartlight/node2/indoor_street',
    'hoanghoahau/smartlight/node2/room1', 'hoanghoahau/smartlight/node3/room2',
    'hoanghoahau/smartlight/node3/room3', 'hoanghoahau/smartlight/node3/dining_room',
    'hoanghoahau/smartlight/node4/kitchen', 'hoanghoahau/smartlight/node4/bath',
    'hoanghoahau/smartlight/node4/toilet', 'hoanghoahau/smartlight/node4/washing_machine'
];

const statusTopics = [
    'hoanghoahau/smartlight/node1/status', 'hoanghoahau/smartlight/node2/status',
    'hoanghoahau/smartlight/node3/status', 'hoanghoahau/smartlight/node4/status'
];

const mqttClient = mqtt.connect(mqttOptions);

mqttClient.on('connect', () => {
    console.log('✅ Connected to HiveMQ');
    mqttClient.subscribe([...lightTopics, ...statusTopics]);
});

mqttClient.on('message', (topic, message) => {
    const payload = message.toString();

    if (topic.endsWith('/status')) {
        const nodeName = topic.split('/')[2];
        nodeStatus[nodeName] = payload;
        broadcast({ type: 'node_connectivity', node: nodeName, status: payload });
        return;
    }

    deviceStates[topic] = payload;
    broadcast({ relay: topic, state: payload });
});

// ======= Server & WebSocket ===========
app.use(express.static('public')); 
app.use(bodyParser.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const clients = [];

wss.on('connection', (ws) => {
    clients.push(ws);
    // Gửi trạng thái hiện tại cho client mới
    Object.keys(nodeStatus).forEach(n => ws.send(JSON.stringify({ type: 'node_connectivity', node: n, status: nodeStatus[n] })));
    Object.keys(deviceStates).forEach(t => ws.send(JSON.stringify({ relay: t, state: deviceStates[t] })));
    
    ws.on('close', () => clients.splice(clients.indexOf(ws), 1));
});

function broadcast(msg) {
    const json = JSON.stringify(msg);
    clients.forEach(c => c.readyState === WebSocket.OPEN && c.send(json));
}

// ======= API Endpoints ===========
app.post('/control', (req, res) => {
    const { relay, state } = req.body;
    mqttClient.publish(relay, state, { qos: 1, retain: true });
    res.send('OK');
});

app.post('/control-all', (req, res) => {
    const { state } = req.body;
    lightTopics.forEach(t => mqttClient.publish(t, state, { qos: 1, retain: true }));
    res.send('OK');
});

server.listen(PORT, () => console.log(`🚀 Server on port ${PORT}`));
