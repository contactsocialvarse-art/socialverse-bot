const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { ImapFlow } = require('imapflow');
const { simpleParser } = require('mailparser');
const cors = require('cors');

const app = express();
app.use(cors());

// হেলথ চেক রুট (Render Active রাখার জন্য)
app.get('/', (req, res) => {
    res.send('Socialverse IMAP Backend Server is Running!');
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// IMAP দিয়ে একটি অ্যাকাউন্ট থেকে মেইল রিড করার ফাংশন
async function fetchMailsIMAP(email, password) {
    const client = new ImapFlow({
        host: 'outlook.office365.com',
        port: 993,
        secure: true,
        auth: {
            user: email,
            pass: password
        },
        logger: false
    });

    try {
        await client.connect();

        // INBOX ফোল্ডার লক/ওপেন করা
        let lock = await client.getMailboxLock('INBOX');
        let extractedMails = [];

        try {
            // ইনবক্সের তথ্য নেওয়া
            let status = await client.status('INBOX', { messages: true });
            let totalMessages = status.messages;

            if (totalMessages > 0) {
                // সর্বশেষ ৫টি থেকে ১০টি মেইলের রেঞ্জ তৈরি করা
                let fetchRange = `${Math.max(1, totalMessages - 9)}:*`;
                
                let count = 1;
                for await (let message of client.fetch(fetchRange, { envelope: true, source: true })) {
                    // মেইলের বডি পার্স করা
                    let parsed = await simpleParser(message.source);
                    
                    let subject = parsed.subject || message.envelope.subject || 'No Subject';
                    let from = parsed.from ? parsed.from.text : (message.envelope.from ? message.envelope.from[0].address : 'Unknown');
                    let textContent = parsed.text || parsed.html || 'No Content';

                    extractedMails.unshift({
                        id: count++,
                        subject: subject,
                        from: from,
                        content: `From: ${from} | Subject: ${subject} | Body: ${textContent.substring(0, 300)}...`
                    });
                }
            }
        } finally {
            lock.release();
        }

        await client.logout();
        return { success: true, email, mails: extractedMails };

    } catch (error) {
        try { await client.logout(); } catch(e){}
        return { 
            success: false, 
            email, 
            message: error.message.includes('AUTHENTICATIONFAILED') 
                ? 'আইডি বা পাসওয়ার্ড ভুল অথবা App Password / Modern Auth প্রয়োজন।' 
                : error.message 
        };
    }
}

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('start-bot', async (data) => {
        let credentials = [];
        
        if (typeof data === 'string') {
            credentials = data.split('\n').filter(line => line.trim() !== '').map(line => {
                const [email, password] = line.split('|');
                return { email: email?.trim(), password: password?.trim() };
            });
        } else if (data.email && data.password) {
            credentials = [{ email: data.email, password: data.password }];
        }

        let allResults = [];

        for (const cred of credentials) {
            if (cred.email && cred.password) {
                socket.emit('bot-status', { status: `Connecting IMAP for: ${cred.email}` });
                const result = await fetchMailsIMAP(cred.email, cred.password);
                allResults.push(result);
            }
        }

        socket.emit('bot-complete', {
            success: true,
            results: allResults
        });
    });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
    console.log(`IMAP Server running on port ${PORT}`);
});
