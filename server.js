const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const axios = require('axios');
const cors = require('cors');

const app = express();
app.use(cors());

// Azure App Configurations (এখানে তোমার তথ্যগুলো বসাও)
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const TENANT_ID = process.env.TENANT_ID;

app.get('/', (req, res) => {
    res.send('Socialverse Azure Graph API Backend is Running!');
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// Azure Graph API দিয়ে মেইল রিড করার ফাংশন
async function fetchMailsViaAzure(targetEmail) {
    try {
        // ১. Access Token নেওয়া
        const tokenUrl = `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/token`;
        const params = new URLSearchParams({
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            scope: 'https://graph.microsoft.com/.default',
            grant_type: 'client_credentials'
        });

        const tokenRes = await axios.post(tokenUrl, params);
        const accessToken = tokenRes.data.access_token;

        // ২. মেইল এক্সট্র্যাক্ট করা
        const mailUrl = `https://graph.microsoft.com/v1.0/users/${targetEmail}/messages?$top=5&$select=subject,sender,bodyPreview,receivedDateTime`;
        const mailRes = await axios.get(mailUrl, {
            headers: { Authorization: `Bearer ${accessToken}` }
        });

        const mails = mailRes.data.value.map((msg, index) => ({
            id: index + 1,
            subject: msg.subject,
            from: msg.sender?.emailAddress?.address || 'Unknown',
            content: `From: ${msg.sender?.emailAddress?.address} | Subject: ${msg.subject} | Preview: ${msg.bodyPreview}`
        }));

        return { success: true, email: targetEmail, mails };

    } catch (error) {
        return { 
            success: false, 
            email: targetEmail, 
            message: error.response?.data?.error?.message || error.message 
        };
    }
}

io.on('connection', (socket) => {
    socket.on('start-bot', async (data) => {
        let emails = [];
        
        if (typeof data === 'string') {
            emails = data.split('\n').map(line => line.split('|')[0].trim()).filter(Boolean);
        } else if (data.email) {
            emails = [data.email.trim()];
        }

        let allResults = [];

        for (const email of emails) {
            socket.emit('bot-status', { status: `Reading mails via Azure API for: ${email}` });
            const result = await fetchMailsViaAzure(email);
            allResults.push(result);
        }

        socket.emit('bot-complete', {
            success: true,
            results: allResults
        });
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`Azure Graph API Server running on port ${PORT}`);
});
