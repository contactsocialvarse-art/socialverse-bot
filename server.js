const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { ImapFlow } = require('imapflow');
const pLimit = require('p-limit');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// একসাথে সর্বোচ্চ ৫টি অ্যাকাউন্ট সমান্তরালে (Parallel) রান হবে
const limit = pLimit(5);

async function fetchMailsViaIMAP(email, appPassword) {
    const client = new ImapFlow({
        host: 'outlook.office365.com',
        port: 993,
        secure: true,
        auth: {
            user: email,
            pass: appPassword
        },
        logger: false
    });

    try {
        await client.connect();
        let lock = await client.getMailboxLock('INBOX');
        let mails = [];

        try {
            // ইনবক্সের সর্বশেষ ৫টি মেইল ফেচ করবে
            for await (let message of client.fetch('1:5', { envelope: true, bodyStructure: true }, { changedSince: 0 })) {
                mails.push({
                    id: message.seq,
                    subject: message.envelope.subject || '(No Subject)',
                    from: message.envelope.from[0]?.address || 'Unknown',
                    date: message.envelope.date
                });
            }
        } finally {
            lock.release();
        }

        await client.logout();
        return { success: true, email, mails };

    } catch (error) {
        return { 
            success: false, 
            email, 
            message: error.message.includes('AUTHENTICATIONFAILED') 
                ? 'Invalid Email or App Password!' 
                : error.message 
        };
    }
}

io.on('connection', (socket) => {
    socket.on('start-bot', async (inputData) => {
        // ইনপুট ফরম্যাট: email|app_password (প্রতিটি নতুন লাইনে)
        const lines = inputData.split('\n').filter(line => line.trim() !== '');
        
        const accounts = lines.map(line => {
            const [email, pass] = line.split('|').map(s => s?.trim());
            return { email, pass };
        }).filter(acc => acc.email && acc.pass);

        if (accounts.length === 0) {
            socket.emit('bot-complete', { success: false, message: 'Invalid Input Format! Use email|app_password' });
            return;
        }

        socket.emit('bot-status', { status: `Processing ${accounts.length} accounts in bulk...` });

        // বাল্ক অ্যাকাউন্টের প্রসেসিং
        const tasks = accounts.map(acc => 
            limit(async () => {
                socket.emit('bot-status', { status: `Reading INBOX for: ${acc.email}` });
                return await fetchMailsViaIMAP(acc.email, acc.pass);
            })
        );

        const results = await Promise.all(tasks);

        socket.emit('bot-complete', {
            success: true,
            results: results
        });
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Bulk IMAP Server running on port ${PORT}`));
