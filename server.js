const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { chromium } = require('playwright');
const pLimit = require('p-limit');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// একসাথে ৩টি ব্রাউজার সমান্তরালে কাজ করবে (সার্ভার মেমোরি ঠিক রাখার জন্য)
const limit = pLimit(3);

async function autoLoginAndFetchMail(email, password) {
    let browser;
    try {
        browser = await chromium.launch({ 
            headless: true, // ব্যাকগ্রাউন্ডে চলবে
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        const context = await browser.newContext();
        const page = await context.newPage();

        // ১. আউটলুক লগইন পেজে যাওয়া
        await page.goto('https://login.live.com/', { waitUntil: 'networkidle', timeout: 60000 });

        // ২. ইমেইল ইনপুট
        await page.fill('input[type="email"]', email);
        await page.click('input[type="submit"]');
        await page.waitForTimeout(2000);

        // ৩. পাসওয়ার্ড ইনপুট
        await page.fill('input[type="password"]', password);
        await page.click('input[type="submit"]');
        await page.waitForTimeout(3000);

        // Stay Signed In থাকলে Yes দেওয়া
        if (await page.$('input[id="acceptButton"]')) {
            await page.click('input[id="acceptButton"]');
        }

        // ৪. ইনবক্সে যাওয়া
        await page.goto('https://outlook.live.com/mail/0/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(5000);

        // ৫. মেইলের তালিকা স্ক্র্যাপ করা
        const mails = await page.evaluate(() => {
            const mailElements = document.querySelectorAll('div[role="option"]');
            let extracted = [];
            mailElements.forEach((el, index) => {
                if (index < 5) { // লেটেস্ট ৫টি মেইল
                    extracted.push({
                        id: index + 1,
                        subject: el.innerText.split('\n')[0] || 'No Subject',
                        content: el.innerText.replace(/\n/g, ' | ')
                    });
                }
            });
            return extracted;
        });

        await browser.close();
        return { success: true, email, mails };

    } catch (error) {
        if (browser) await browser.close();
        return { 
            success: false, 
            email, 
            message: 'Login Failed or Captcha/2FA Required!' 
        };
    }
}

io.on('connection', (socket) => {
    socket.on('start-bot', async (inputData) => {
        // ইনপুট ফরম্যাট: email|password (প্রতি লাইনে একটি)
        const lines = inputData.split('\n').filter(line => line.trim() !== '');
        
        const accounts = lines.map(line => {
            const [email, pass] = line.split('|').map(s => s?.trim());
            return { email, pass };
        }).filter(acc => acc.email && acc.pass);

        if (accounts.length === 0) {
            socket.emit('bot-complete', { success: false, message: 'সঠিক ফরম্যাটে দিন: email|password' });
            return;
        }

        socket.emit('bot-status', { status: `মোট ${accounts.length} টি অ্যাকাউন্ট প্রসেস করা হচ্ছে...` });

        // বাল্ক প্রসেসিং
        const tasks = accounts.map(acc => 
            limit(async () => {
                socket.emit('bot-status', { status: `লগইন করা হচ্ছে: ${acc.email}` });
                return await autoLoginAndFetchMail(acc.email, acc.pass);
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
server.listen(PORT, () => console.log(`Auto-Login Server running on port ${PORT}`));
