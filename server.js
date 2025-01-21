const express = require('express');
const mqtt = require('mqtt');
const bodyParser = require('body-parser');
const http = require('http');
const WebSocket = require('ws');

const app = express();
const PORT = 3000;

// MQTT Configuration
const mqttOptions = {
  host: 'broker.hivemq.com',
  port: 1883,
};
const mqttClient = mqtt.connect(mqttOptions);

mqttClient.on('connect', () => {
  console.log('Connected to MQTT Broker');
  mqttClient.subscribe(topics, (err) => {
    if (err) {
      console.error('Failed to subscribe to topics:', err);
    } else {
      console.log('Subscribed to topics:', topics);
    }
  });
});

mqttClient.on('error', (err) => {
  console.error('MQTT Connection Error:', err);
});

mqttClient.on('offline', () => {
  console.error('MQTT client is offline');
});

mqttClient.on('reconnect', () => {
  console.log('Reconnecting to MQTT Broker...');
});

// Middleware
app.use(express.static('public'));
app.use(bodyParser.json());

// List of topics
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

// Create HTTP and WebSocket servers
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const clients = [];

wss.on('connection', (ws, req) => {
  clients.push(ws);
  console.log('New WebSocket connection established');

  ws.on('close', () => {
    const index = clients.indexOf(ws);
    if (index !== -1) clients.splice(index, 1);
    console.log('WebSocket connection closed');
  });
});

function broadcast(message) {
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(message));
    }
  });
}

// Handle MQTT messages
mqttClient.on('message', (topic, message) => {
  const state = message.toString();
  const relay = topic;
  const data = { relay, state, timestamp: Date.now() };

  console.log(`Received MQTT message: ${relay} - ${state}`);
  broadcast(data);
});

// Control light
app.post('/control', (req, res) => {
  const { relay, state } = req.body;

  if (!relay) {
    return res.status(400).send('Relay is required');
  }
  if (!state) {
    return res.status(400).send('State is required');
  }
  if (!topics.includes(relay)) {
    return res.status(400).send('Invalid relay topic');
  }

  mqttClient.publish(relay, state, (err) => {
    if (err) {
      console.error('MQTT Publish Error:', err);
      return res.status(500).send('Failed to control light');
    }
    console.log(`Published to MQTT: ${relay} - ${state}`);
    res.send('Light controlled successfully');
  });
});

// Start server
server.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
