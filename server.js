const express = require('express');
const mqtt = require('mqtt');
const bodyParser = require('body-parser');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const PORT = process.env.PORT || 3000; // Sử dụng port của Render hoặc 3000

// Biến lưu trữ trạng thái hiện tại của tất cả thiết bị (Cache)
// Điều này giúp Dashboard lấy lại trạng thái khi load lại trang
let deviceStates = {};

// ======= MQTT Configuration for HiveMQ Cloud ===========
const mqttOptions = {
  host: 'd246c46a2ebe40d2ae0c787f92bfdbab.s1.eu.hivemq.cloud',
  port: 8883,
  protocol: 'mqtts',
  username: 'hivemq.webclient.1742180699133',
  password: '#x1V7:H62pCZ%e&nGkgR',
  rejectUnauthorized: false, 
};

// ======= List of Topics ===========
const topics = [
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

// MQTT Client
const mqttClient = mqtt.connect(mqttOptions);

// ======= MQTT Event Handling ===========
mqttClient.on('connect', () => {
  console.log('✅ Connected to HiveMQ Cloud Broker');
  mqttClient.subscribe(topics, (err) => {
    if (!err) console.log('✅ Subscribed to all topics');
  });
});

// Xử lý tin nhắn MQTT đến
mqttClient.on('message', (topic, message) => {
  const state = message.toString();
  
  // Lưu trạng thái vào bộ nhớ đệm (Cache)
  deviceStates[topic] = state;

  const data = { relay: topic, state, timestamp: Date.now() };
  console.log(`📨 MQTT -> Cache: ${topic} - ${state}`);
  
  // Gửi cho tất cả Web đang mở
  broadcast(data);
});

// ======= Middleware ===========
app.use(express.static('public')); 
app.use(bodyParser.json());

// ======= HTTP & WebSocket Server ===========
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const clients = [];

wss.on('connection', (ws) => {
  clients.push(ws);
  console.log('🟢 New UI Client connected');

  // NGAY KHI LOAD TRANG: Gửi toàn bộ trạng thái đang lưu trong Cache cho Client này
  Object.keys(deviceStates).forEach((topic) => {
    ws.send(JSON.stringify({
      relay: topic,
      state: deviceStates[topic]
    }));
  });

  ws.on('close', () => {
    const index = clients.indexOf(ws);
    if (index !== -1) clients.splice(index, 1);
    console.log('🔴 UI Client disconnected');
  });
});

function broadcast(message) {
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// ======= REST API: Control Light ===========
app.post('/control', (req, res) => {
  const { relay, state } = req.body;

  if (!relay || !state || !topics.includes(relay)) {
    return res.status(400).send('❌ Invalid Request');
  }

  // Publish lệnh xuống MQTT
  mqttClient.publish(relay, state, { qos: 1, retain: true }, (err) => {
    if (err) {
      console.error('❌ MQTT Publish Error:', err);
      return res.status(500).send('❌ Failed');
    }
    console.log(`✅ Web Control: ${relay} - ${state}`);
    res.send('✅ OK');
  });
});

// ======= Start Server ===========
server.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
});
