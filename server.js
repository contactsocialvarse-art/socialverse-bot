// স্ক্রিনশট সকেটে পাঠানোর হেলপার ফাংশন
async function captureAndEmit(page, socket) {
    try {
        const buffer = await page.screenshot({ type: 'jpeg', quality: 40 });
        const base64Image = buffer.toString('base64');
        socket.emit('live-screen', `data:image/jpeg;base64,${base64Image}`);
    } catch (e) {
        // নেভিগেশনের সময় স্ক্রিনশট মিস হলে ইগনোর করবে
    }
}

async function autoLoginAndFetchMail(email, password, socket) {
    let browser;
    try {
        browser = await chromium.launch({ 
            headless: true, // ইউজার মোড সবসময় হেডলেস থাকবে
            args: ['--no-sandbox', '--disable-setuid-sandbox'] 
        });
        const page = await browser.newPage();

        // ১. লগইন পেজ
        await page.goto('https://login.live.com/', { waitUntil: 'networkidle' });
        await captureAndEmit(page, socket); // 📸 স্ক্রিনশট ১

        // ২. ইমেইল ইনপুট
        await page.fill('input[type="email"]', email);
        await page.click('input[type="submit"]');
        await page.waitForTimeout(2000);
        await captureAndEmit(page, socket); // 📸 স্ক্রিনশট ২

        // ৩. পাসওয়ার্ড ইনপুট
        await page.fill('input[type="password"]', password);
        await page.click('input[type="submit"]');
        await page.waitForTimeout(3000);
        await captureAndEmit(page, socket); // 📸 স্ক্রিনশট ৩

        // ৪. ইনবক্স লোড
        await page.goto('https://outlook.live.com/mail/0/', { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(4000);
        await captureAndEmit(page, socket); // 📸 স্ক্রিনশট ৪

        await browser.close();
    } catch (error) {
        if (browser) await browser.close();
    }
}
