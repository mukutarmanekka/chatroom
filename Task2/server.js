const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    maxHttpBufferSize: 1e8 
});

app.use(express.static('public'));

const DATA_DIR = path.join(__dirname, 'data');
const MESSAGES_FILE = path.join(DATA_DIR, 'messages.json');
const MAX_MESSAGES = 100;

let messages = [];

if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR);
}

if (fs.existsSync(MESSAGES_FILE)) {
    try {
        const data = fs.readFileSync(MESSAGES_FILE, 'utf8');
        messages = JSON.parse(data);
        console.log(`Loaded ${messages.length} messages from history.`);
    } catch (err) {
        console.error("Error reading messages.json:", err);
    }
}

function broadcastMessage(data) {
    messages.push(data);
    if (messages.length > MAX_MESSAGES) {
        messages = messages.slice(messages.length - MAX_MESSAGES);
    }
    try {
        fs.writeFileSync(MESSAGES_FILE, JSON.stringify(messages, null, 2));
    } catch (err) {
        console.error("Error saving messages.json:", err);
    }
    io.emit('chat_message', data);
}

let botModeActive = false;
let botActivatorSocketId = null;

const BOT_DELAY = 500;


function getBotReply(message) {
    if (!message) return null;
    const msg = message.toLowerCase();
    if (msg.includes('hello') || msg.includes('hi ') || msg === 'hi' || msg.includes('hey')) {
        return "Hello there! I'm the local chat bot.";
    } else if (msg.includes('help')) {
        return "I can answer simple questions about time, status, my name, or just say hello/goodbye.";
    } else if (msg.includes('name')) {
        return "I don't have a specific name, but you can call me Bot.";
    } else if (msg.includes('status')) {
        return "All systems are running perfectly on the local network!";
    } else if (msg.includes('time')) {
        return `The current server time is ${new Date().toLocaleTimeString()}`;
    } else if (msg.includes('bye') || msg.includes('goodbye')) {
        return "Goodbye! Have a great day.";
    } else {
        return "I'm not exactly sure what you mean. Try saying 'help' for some ideas.";
    }
}

io.on('connection', (socket) => {
    console.log(`User connected: ${socket.id}`);

    socket.emit('chat_history', messages);

    socket.emit('bot_status', {
        isActive: botModeActive,
        isActivator: botActivatorSocketId === socket.id
    });

    socket.on('chat_message', async (msgData) => {
        const { text, username, image, audio } = msgData;

        if (text === '/bot') {
            botModeActive = true;
            botActivatorSocketId = socket.id;
            
            io.emit('bot_status', { isActive: true, activatorId: botActivatorSocketId });
            broadcastMessage({ text: "🤖 Bot mode ACTIVATED. Only the activator can send messages.", username: "System", type: "system" });
            return;
        } else if (text === '/human' || text === '/bot off') {
            botModeActive = false;
            botActivatorSocketId = null;
            
            io.emit('bot_status', { isActive: false, activatorId: null });
            broadcastMessage({ text: "🤖 Bot mode DEACTIVATED. Everyone can chat now.", username: "System", type: "system" });
            return;
        }

        if (botModeActive && socket.id !== botActivatorSocketId) {
            socket.emit('chat_message', { text: "⚠️ You cannot send messages right now; bot mode is active and locked by another user.", username: "System", type: "system" });
            return;
        }

        let processedData = { text, username, type: "user", sid: socket.id };
        if (audio) {
            processedData.audio = audio;
        }

        if (image) {
            try {
                const matches = image.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
                if (matches && matches.length === 3) {
                    const mimeType = matches[1];
                    const buffer = Buffer.from(matches[2], 'base64');
                    const originalSize = buffer.length;


                    const compressedBuffer = await sharp(buffer)
                        .resize({ width: 400, withoutEnlargement: true })
                        .jpeg({ quality: 30 })
                        .toBuffer();
                    
                    const compressedSize = compressedBuffer.length;
                    
                    const formatBytes = (bytes) => {
                        if (bytes === 0) return '0 Bytes';
                        const k = 1024;
                        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
                        const i = Math.floor(Math.log(bytes) / Math.log(k));
                        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
                    };

                    const dataLossPercentage = originalSize > 0 && originalSize > compressedSize
                        ? ((originalSize - compressedSize) / originalSize * 100).toFixed(2) 
                        : "0.00";

                    const compressedBase64 = `data:image/jpeg;base64,${compressedBuffer.toString('base64')}`;
                    
                    processedData.image = compressedBase64;
                    processedData.originalSize = formatBytes(originalSize);
                    processedData.compressedSize = formatBytes(compressedSize);
                    processedData.dataLossPercentage = dataLossPercentage;

                }
            } catch (err) {
                console.error("Error processing image:", err);
                socket.emit('chat_message', { text: "⚠️ Image processing failed.", username: "System", type: "system" });
                return;
            }
        }

        broadcastMessage(processedData);
        if (botModeActive) {
            setTimeout(() => {
                let botReply = getBotReply(text);
                
                if (!botReply && !processedData.image) {
                     botReply = "I received your message, but I have nothing to say about it.";
                }

                if (botReply) {
                    broadcastMessage({ text: botReply, username: "Bot", type: "bot" });
                }
            }, BOT_DELAY);
        }
    });

    socket.on('disconnect', () => {
        console.log(`User disconnected: ${socket.id}`);
        if (botModeActive && botActivatorSocketId === socket.id) {
            botModeActive = false;
            botActivatorSocketId = null;
            io.emit('bot_status', { isActive: false, activatorId: null });
            broadcastMessage({ text: "🤖 Bot mode automatically deactivated because the owner disconnected.", username: "System", type: "system" });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Access locally at http://localhost:${PORT}`);
});
