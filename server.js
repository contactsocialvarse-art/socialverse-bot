const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { chromium } = require('playwright');
const cors = require('cors');

const app = express();
app.use(cors());

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" }
});

io.on('connection', (socket) => {
    console.log('Client connected');

    socket.on('start-bot', async (data) => {
        const { email, password } = data;

        let browser;
        try {
            // ব্যাকগ্রাউন্ড হেডলেস ব্রাউজার
            browser = await chromium.launch({ headless: true });
            const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
            let activePage = await context.newPage();

            // ১. Microsoft Login পেজে যাওয়া
            await activePage.goto('https://login.live.com/', { waitUntil: 'domcontentloaded', timeout: 60000 });

            // ২. ইমেইল ইনপুট
            const emailInput = activePage.locator('input[type="email"]');
            await emailInput.waitFor({ state: 'visible', timeout: 15000 });
            await emailInput.fill(email);
            await emailInput.press('Enter');
            try {
                const nextBtn = activePage.locator('#idSIButton9');
                if (await nextBtn.isVisible()) await nextBtn.click();
            } catch(e) {}

            await activePage.waitForTimeout(2500);

            // ৩. পাসওয়ার্ড ইনপুট
            const passInput = activePage.locator('input[type="password"]');
            await passInput.waitFor({ state: 'visible', timeout: 15000 });
            await passInput.fill(password);
            await passInput.press('Enter');
            try {
                const submitBtn = activePage.locator('#idSIButton9');
                if (await submitBtn.isVisible()) await submitBtn.click();
            } catch(e) {}

            await activePage.waitForTimeout(2500);

            // ৪. Stay signed in / KMSI বাইপাস
            try {
                const acceptBtn = activePage.locator('#acceptButton, #idSIButton9');
                if (await acceptBtn.first().isVisible({ timeout: 4000 })) {
                    await acceptBtn.first().click();
                    await activePage.waitForTimeout(2000);
                }
            } catch (e) {}

            // ৫. নতুন ট্যাবে Outlook Mail ওপেন করা
            const mailPage = await context.newPage();
            activePage = mailPage;

            await activePage.goto('https://outlook.live.com/mail/', { waitUntil: 'domcontentloaded', timeout: 60000 });
            await activePage.waitForTimeout(7000);

            // ৬. ইনবক্সের সমস্ত মেসেজ এক্সট্রাক্ট করা
            const mailItems = activePage.locator('div[role="listbox"] div[role="option"], div[data-convid]');
            let count = await mailItems.count();

            if (count === 0) {
                const altItems = activePage.locator('div[aria-label="Message list"] > div');
                count = await altItems.count();
            }

            let extractedMails = [];
            const limit = Math.min(count, 10); // সর্বোচ্চ ১০টি মেসেজ রিড করবে

            for (let i = 0; i < limit; i++) {
                try {
                    const currentMail = mailItems.nth(i);
                    await currentMail.scrollIntoViewIfNeeded();
                    await currentMail.click();
                    await activePage.waitForTimeout(1500);

                    // মেইলের বিষয়বস্তু/টেক্সট সংগ্রহ
                    const rawText = await currentMail.innerText().catch(() => '');
                    const cleanText = rawText.replace(/\n+/g, ' ').trim();

                    if (cleanText) {
                        extractedMails.push({
                            id: i + 1,
                            content: cleanText
                        });
                    }
                } catch (err) {}
            }

            await browser.close();

            // সম্পূর্ণ মেসেজের লিস্ট একসাথে পাঠানো পপ-আপের জন্য
            socket.emit('bot-complete', {
                success: true,
                mails: extractedMails
            });

        } catch (error) {
            if (browser) await browser.close();
            socket.emit('bot-complete', {
                success: false,
                message: 'লগইন বা মেইল রিড করতে সমস্যা হয়েছে: ' + error.message
            });
        }
    });
});

const PORT = 5000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});