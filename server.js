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

const limit = pLimit(2);

// লাইভ স্ক্রিনশট ক্যাপচারের ফাংশন
async function captureAndEmit(page, socket) {
    try {
        const buffer = await page.screenshot({ type: 'jpeg', quality: 30 });
        const base64Image = buffer.toString('base64');
        socket.emit('live-screen', `data:image/jpeg;base64,${base64Image}`);
    } catch (e) {
        // Screenshot capture error ignored
    }
}

async function autoLoginAndFetchMail(email, password, socket) {
    let browser;
    try {
        browser = await chromium.launch({ 
            headless: true, 
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu'
            ] 
        });

        const context = await browser.newContext({
            viewport: { width: 800, height: 600 }
        });
        const page = await context.newPage();

        // ১. আউটলুক পেজে যাওয়া
        await page.goto('https://login.live.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await captureAndEmit(page, socket);

        // ২. ইমেইল দেওয়া
        await page.fill('input[type="email"]', email);
        await page.click('input[type="submit"]');
        await page.waitForTimeout(2000);
        await captureAndEmit(page, socket);

        // ৩. পাসওয়ার্ড দেওয়া
        await page.fill('input[type="password"]', password);
        await page.click('input[type="submit"]');
        await page.waitForTimeout(3000);
        await captureAndEmit(page, socket);

        // Stay Signed In আসলে হ্যান্ডেল করা
        try {
            if (await page.$('input[id="acceptButton"]')) {
                await page.click('input[id="acceptButton"]');
                await page.waitForTimeout(2000);
            }
        } catch (e) {}

        // ৪. ইনবক্সে যাওয়া
        await page.goto('https://outlook.live.com/mail/0/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(5000);
        await captureAndEmit(page, socket);

        // ৫. মেইল তোলা
        const mails = await page.evaluate(() => {
            const mailElements = document.querySelectorAll('div[role="option"]');
            let extracted = [];
            mailElements.forEach((el, index) => {
                if (index < 5) {
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
            message: 'লগইন ব্যর্থ হয়েছে বা Captcha / 2FA সিকিউরিটি এসেছে!' 
        };
    }
}

io.on('connection', (socket) => {
    socket.on('start-bot', async (payload) => {
        const inputData = typeof payload === 'string' ? payload : payload.credentials;

        const lines = inputData.split('\n').filter(line => line.trim() !== '');
        const accounts = lines.map(line => {
            const [email, pass] = line.split('|').map(s => s?.trim());
            return { email, pass };
        }).filter(acc => acc.email && acc.pass);

        if (accounts.length === 0) {
            socket.emit('bot-complete', { success: false, message: 'সঠিক ফরম্যাটে দিন: email|password' });
            return;
        }

        socket.emit('bot-status', { status: `প্রসেসিং শুরু হচ্ছে (${accounts.length} টি অ্যাকাউন্ট)...` });

        const tasks = accounts.map(acc => 
            limit(async () => {
                socket.emit('bot-status', { status: `লগইন ও ব্যাকগ্রাউন্ড পেজ মনিটরিং চলছে: ${acc.email}` });
                return await autoLoginAndFetchMail(acc.email, acc.pass, socket);
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
