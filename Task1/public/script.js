const socket = io();

const form = document.getElementById('chat-form');
const usernameInput = document.getElementById('username-input');
const messageInput = document.getElementById('message-input');
const messagesContainer = document.getElementById('messages');
const sendBtn = document.querySelector('.send-btn');
const botOverlay = document.getElementById('bot-overlay');
const statusBanner = document.getElementById('status-banner');
const imageInput = document.getElementById('image-input');
const imageBtnLabel = document.getElementById('image-btn-label');

let isLocked = false;
let selectedImageDataUrl = null;

function appendMessage(data, isSelf = false) {
    const msgDiv = document.createElement('div');
    msgDiv.classList.add('message');
    msgDiv.classList.add(data.type);
    if (isSelf) {
        msgDiv.classList.add('self');
    }

    if (data.type === 'system') {
        msgDiv.innerHTML = `<div class="content">${data.text}</div>`;
    } else {
        let contentHtml = '';
        if (data.text) contentHtml += data.text;
        
        if (data.image) {
            contentHtml += `<img src="${data.image}">`;
            
            if (data.originalSize) {
                contentHtml += `<div class="image-meta">`;
                if (data.originalSize) {
                    contentHtml += `<span class="meta-label">Original: ${data.originalSize}</span>`;
                }
                if (data.compressedSize) {
                    contentHtml += `<span class="meta-label">Compressed: ${data.compressedSize}</span>`;
                }
                if (data.dataLossPercentage !== undefined) {
                    contentHtml += `<span class="meta-label">Reduced: ${data.dataLossPercentage}%</span>`;
                }

                contentHtml += `</div>`;
            }
        }
        
        msgDiv.innerHTML = `
            <div class="sender">${data.username}</div>
            <div class="content">${contentHtml}</div>
        `;
    }

    messagesContainer.appendChild(msgDiv);
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

socket.on('chat_message', (data) => {
    let isSelf = false;
    if (data.sid && data.sid === socket.id) {
        isSelf = true;
    }
    appendMessage(data, isSelf);
});

socket.on('chat_history', (history) => {
    messagesContainer.innerHTML = '';
    history.forEach(data => {
        let isSelf = false;
        if (data.sid && data.sid === socket.id) {
            isSelf = true;
        }
        appendMessage(data, isSelf);
    });
});

socket.on('bot_status', (data) => {
    if (data.isActive) {
        statusBanner.classList.remove('hidden');

        const amIActivator = data.isActivator || (data.activatorId && data.activatorId === socket.id);
        
        if (!amIActivator) {
            isLocked = true;
            messageInput.disabled = true;
            sendBtn.disabled = true;
            imageBtnLabel.classList.add('disabled');
            botOverlay.classList.remove('hidden');
            messageInput.placeholder = "Read-Only Mode";
        } else {
            isLocked = false;
            sendBtn.disabled = false;
            imageBtnLabel.classList.remove('disabled');
            botOverlay.classList.add('hidden');
            messageInput.placeholder = "Type a message to Bot...";
        }
    } else {
        statusBanner.classList.add('hidden');
        isLocked = false;
        messageInput.disabled = false;
        sendBtn.disabled = false;
        imageBtnLabel.classList.remove('disabled');
        botOverlay.classList.add('hidden');
        messageInput.placeholder = "Type a message...";
    }
});

socket.on('connect', () => {
    console.log('Connected to server with ID:', socket.id);
});

imageInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
            selectedImageDataUrl = ev.target.result;
            imageBtnLabel.style.background = '#dff0d8';
        };
        reader.readAsDataURL(file);
    } else {
        selectedImageDataUrl = null;
        imageBtnLabel.style.background = '#f1f1f1';
    }
});

form.addEventListener('submit', (e) => {
    e.preventDefault();
    if (isLocked) return;

    const text = messageInput.value.trim();
    const username = usernameInput.value.trim() || 'User';

    if (selectedImageDataUrl) {
        socket.emit('chat_message', { 
            text: text, 
            username: username, 
            image: selectedImageDataUrl 
        });
        
        messageInput.value = '';
        selectedImageDataUrl = null;
        imageInput.value = '';
        imageBtnLabel.style.background = '#f1f1f1';
    } else if (text) {
        socket.emit('chat_message', { text, username });
        messageInput.value = '';
    }
});

if (window.innerWidth > 600) {
    messageInput.focus();
}

window.addEventListener('resize', () => {
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
});
