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

async function autoLoginAndFetchMail(email, password, isHeadless) {
    let browser;
    try {
        // Render ক্লাউডের জন্য নির্দিষ্ট লঞ্চ আর্গুমেন্ট
        browser = await chromium.launch({ 
            headless: isHeadless, 
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu'
            ] 
        });

        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();

        // ১. আউটলুক লগইন পেজে যাওয়া
        await page.goto('https://login.live.com/', { waitUntil: 'networkidle', timeout: 60000 });

        // ২. ইমেইল ইনপুট
        await page.fill('input[type="email"]', email);
        await page.click('input[type="submit"]');
        await page.waitForTimeout(2500);

        // ৩. পাসওয়ার্ড ইনপুট
        await page.fill('input[type="password"]', password);
        await page.click('input[type="submit"]');
        await page.waitForTimeout(4000);

        // Stay Signed In আসলে Yes চাপবে
        try {
            if (await page.$('input[id="acceptButton"]')) {
                await page.click('input[id="acceptButton"]');
                await page.waitForTimeout(2000);
            }
        } catch (e) {
            // Ignored if prompt doesn't appear
        }

        // ৪. সরাসরি ইনবক্সে যাওয়া
        await page.goto('https://outlook.live.com/mail/0/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForTimeout(6000);

        // ৫. মেইল এক্সট্র্যাক্ট করা
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
            message: 'লগইন ব্যর্থ হয়েছে বা 2FA/CAPTCHA আবশ্যক!' 
        };
    }
}

io.on('connection', (socket) => {
    socket.on('start-bot', async (payload) => {
        const inputData = typeof payload === 'string' ? payload : payload.credentials;
        const isHeadless = payload.isHeadless !== undefined ? payload.isHeadless : true;

        const lines = inputData.split('\n').filter(line => line.trim() !== '');
        const accounts = lines.map(line => {
            const [email, pass] = line.split('|').map(s => s?.trim());
            return { email, pass };
        }).filter(acc => acc.email && acc.pass);

        if (accounts.length === 0) {
            socket.emit('bot-complete', { success: false, message: 'সঠিক ফরম্যাটে দিন: email|password' });
            return;
        }

        socket.emit('bot-status', { status: `প্রসেসিং শুরু হচ্ছে... (Headless: ${isHeadless ? 'ON' : 'OFF'})` });

        const tasks = accounts.map(acc => 
            limit(async () => {
                socket.emit('bot-status', { status: `লগইন চেষ্টা চলছে: ${acc.email}` });
                return await autoLoginAndFetchMail(acc.email, acc.pass, isHeadless);
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
