const express = require('express');
const mqtt = require('mqtt');
const bodyParser = require('body-parser');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000;

// Bộ nhớ đệm lưu trạng thái
let deviceStates = {};  // Lưu ON/OFF của từng đèn
let nodeStatus = {};    // Lưu ONLINE/OFFLINE của từng Node

// ======= MQTT Configuration ===========
const mqttOptions = {
  host: 'd246c46a2ebe40d2ae0c787f92bfdbab.s1.eu.hivemq.cloud',
  port: 8883,
  protocol: 'mqtts',
  username: 'hivemq.webclient.1742180699133',
  password: '#x1V7:H62pCZ%e&nGkgR',
  rejectUnauthorized: false, 
};

// ======= Topics Configuration ===========
const lightTopics = [
  'hoanghoahau/smartlight/node1/porch',
  'hoanghoahau/smartlight/node1/living_room1',
  'hoanghoahau/smartlight/node2/living_room2',
  'hoanghoahau/smartlight/node2/indoor_street',
  'hoanghoahau/smartlight/node2/room1',
  'hoanghoahau/smartlight/node3/room2',
  'hoanghoahau/smartlight/node3/room3',
  'hoanghoahau/smartlight/node3/dining_room',
  'hoanghoahau/smartlight/node4/kitchen',
  'hoanghoahau/smartlight/node4/bath',
  'hoanghoahau/smartlight/node4/toilet',
  'hoanghoahau/smartlight/node4/washing_machine',
];

const statusTopics = [
  'hoanghoahau/smartlight/node1/status',
  'hoanghoahau/smartlight/node2/status',
  'hoanghoahau/smartlight/node3/status',
  'hoanghoahau/smartlight/node4/status',
];

const mqttClient = mqtt.connect(mqttOptions);

mqttClient.on('connect', () => {
  console.log('✅ Connected to HiveMQ Cloud Broker');
  mqttClient.subscribe([...lightTopics, ...statusTopics], (err) => {
    if (!err) console.log('✅ Subscribed to all light and status topics');
  });
});

// ======= MQTT Message Handling ===========
mqttClient.on('message', (topic, message) => {
  const payload = message.toString();

  if (topic.endsWith('/status')) {
    const nodeName = topic.split('/')[2];
    nodeStatus[nodeName] = payload;
    console.log(`📡 Node Connectivity: ${nodeName} is ${payload}`);
    broadcast({ type: 'node_connectivity', node: nodeName, status: payload });
    return;
  }

  deviceStates[topic] = payload;
  const data = { relay: topic, state: payload, timestamp: Date.now() };
  console.log(`📨 MQTT Update: ${topic} - ${payload}`);
  broadcast(data);
});

// ======= Server & WebSocket Setup ===========
app.use(express.static('public')); 
app.use(bodyParser.json());

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const clients = [];

wss.on('connection', (ws) => {
  clients.push(ws);
  console.log('🟢 Client connected');

  Object.keys(nodeStatus).forEach((node) => {
    ws.send(JSON.stringify({ type: 'node_connectivity', node: node, status: nodeStatus[node] }));
  });

  Object.keys(deviceStates).forEach((topic) => {
    ws.send(JSON.stringify({ relay: topic, state: deviceStates[topic] }));
  });

  ws.on('close', () => {
    const index = clients.indexOf(ws);
    if (index !== -1) clients.splice(index, 1);
  });
});

function broadcast(message) {
  const json = JSON.stringify(message);
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(json);
  });
}

// ======= API: Điều khiển 1 thiết bị ===========
app.post('/control', (req, res) => {
  const { relay, state } = req.body;
  if (!relay || !state || !lightTopics.includes(relay)) {
    return res.status(400).send('❌ Invalid Request');
  }

  mqttClient.publish(relay, state, { qos: 1, retain: true }, (err) => {
    if (err) return res.status(500).send('❌ Error');
    res.send('✅ OK');
  });
});

// ======= API: ĐIỀU KHIỂN TẤT CẢ (MỚI THÊM) ===========
app.post('/control-all', (req, res) => {
  const { state } = req.body; // Nhận 'ON' hoặc 'OFF'

  if (state !== 'ON' && state !== 'OFF') {
    return res.status(400).send('❌ Invalid state');
  }

  console.log(`📢 LỆNH TỔNG: Đang ${state === 'ON' ? 'BẬT' : 'TẮT'} tất cả thiết bị...`);

  // Duyệt qua mảng tất cả các topic đèn để gửi lệnh đồng loạt
  lightTopics.forEach((topic) => {
    mqttClient.publish(topic, state, { qos: 1, retain: true }, (err) => {
      if (err) console.error(`❌ Lỗi gửi lệnh tới ${topic}:`, err);
    });
  });

  res.send(`✅ Đã gửi lệnh ${state} tới toàn bộ hệ thống`);
});

server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
