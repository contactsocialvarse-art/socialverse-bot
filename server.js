const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { chromium } = require('playwright');
const cors = require('cors');

const app = express();
app.use(cors());

// হেলথ চেক রুট (Render Active রাখার জন্য)
app.get('/', (req, res) => {
    res.send('Socialverse Backend Server is Running!');
});

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

// একটি অ্যাকাউন্ট প্রসেস করার ফাংশন
async function processAccount(email, password) {
    let browser;
    try {
        browser = await chromium.launch({ 
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
        let activePage = await context.newPage();

        // ১. Microsoft Login
        await activePage.goto('https://login.live.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });

        const emailInput = activePage.locator('input[type="email"]');
        await emailInput.waitFor({ state: 'visible', timeout: 15000 });
        await emailInput.fill(email);
        await emailInput.press('Enter');

        try {
            const nextBtn = activePage.locator('#idSIButton9');
            if (await nextBtn.isVisible()) await nextBtn.click();
        } catch(e) {}

        await activePage.waitForTimeout(2500);

        const passInput = activePage.locator('input[type="password"]');
        await passInput.waitFor({ state: 'visible', timeout: 15000 });
        await passInput.fill(password);
        await passInput.press('Enter');

        try {
            const submitBtn = activePage.locator('#idSIButton9');
            if (await submitBtn.isVisible()) await submitBtn.click();
        } catch(e) {}

        await activePage.waitForTimeout(2500);

        // KMSI bypass
        try {
            const acceptBtn = activePage.locator('#acceptButton, #idSIButton9');
            if (await acceptBtn.first().isVisible({ timeout: 4000 })) {
                await acceptBtn.first().click();
                await activePage.waitForTimeout(2000);
            }
        } catch (e) {}

        // ২. Outlook Mail Open
        const mailPage = await context.newPage();
        activePage = mailPage;

        await activePage.goto('https://outlook.live.com/mail/', { waitUntil: 'domcontentloaded', timeout: 60000 });
        await activePage.waitForTimeout(7000);

        // ৩. Mail Extract
        const mailItems = activePage.locator('div[role="listbox"] div[role="option"], div[data-convid]');
        let count = await mailItems.count();

        if (count === 0) {
            const altItems = activePage.locator('div[aria-label="Message list"] > div');
            count = await altItems.count();
        }

        let extractedMails = [];
        const limit = Math.min(count, 10);

        for (let i = 0; i < limit; i++) {
            try {
                const currentMail = mailItems.nth(i);
                await currentMail.scrollIntoViewIfNeeded();
                await currentMail.click();
                await activePage.waitForTimeout(1500);

                const rawText = await currentMail.innerText().catch(() => '');
                const cleanText = rawText.replace(/\n+/g, ' ').trim();

                if (cleanText) {
                    extractedMails.push({ id: i + 1, content: cleanText });
                }
            } catch (err) {}
        }

        await browser.close();
        return { success: true, email, mails: extractedMails };

    } catch (error) {
        if (browser) await browser.close();
        return { success: false, email, message: error.message };
    }
}

io.on('connection', (socket) => {
    console.log('Client connected:', socket.id);

    socket.on('start-bot', async (data) => {
        // সিঙ্গেল বা মাল্টিপল যেকোনো ইনপুট সাপোর্ট
        let credentials = [];
        
        if (typeof data === 'string') {
            // যদি লাইন বাই লাইন টেক্সট ডেটা আসে
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
                socket.emit('bot-status', { status: `Processing: ${cred.email}` });
                const result = await processAccount(cred.email, cred.password);
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
    console.log(`Server running on port ${PORT}`);
});
