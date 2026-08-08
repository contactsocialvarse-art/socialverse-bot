<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Socialverse Mail Reader</title>
    <script src="https://cdn.socket.io/4.7.5/socket.io.min.js"></script>
    <style>
        body { font-family: Arial, sans-serif; background: #f4f7f6; padding: 40px; display: flex; justify-content: center; }
        .card { background: #fff; padding: 30px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.1); width: 100%; max-width: 500px; text-align: center; }
        textarea { width: 90%; height: 120px; padding: 10px; border-radius: 8px; border: 1px solid #ccc; font-size: 14px; margin-bottom: 15px; }
        button { background: #4a90e2; color: white; border: none; padding: 12px 25px; font-size: 16px; border-radius: 8px; cursor: pointer; font-weight: bold; width: 100%; }
        button:disabled { background: #b0bec5; }
        #loader { margin-top: 15px; font-weight: bold; color: #333; display: none; }
        .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.5); justify-content: center; align-items: center; }
        .modal-content { background: white; padding: 25px; border-radius: 12px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto; text-align: left; }
        .mail-box { border-left: 4px solid #4a90e2; background: #f9f9f9; padding: 10px; margin-bottom: 10px; border-radius: 4px; font-size: 13px; }
        .close-btn { background: #ff4757; color: white; padding: 8px 15px; border: none; border-radius: 6px; float: right; cursor: pointer; }
    </style>
</head>
<body>

<div class="card">
    <h2>Socialverse Mail Reader</h2>
    <p style="font-size: 12px; color: #666;">Azure Graph API - Fast & Secure</p>
    
    <textarea id="credentials" placeholder="Email address (e.g. user@domain.com)"></textarea><br>
    <button id="startBtn" onclick="startBot()">Start Mail Reader 🚀</button>

    <div id="loader">⏳ মেইল প্রসেস করা হচ্ছে, অনুগ্রহ করে অপেক্ষা করুন...</div>
</div>

<!-- Output Modal -->
<div id="modalOverlay" class="modal">
    <div class="modal-content">
        <button class="close-btn" onclick="closeModal()">Close</button>
        <h3>Extracted Mails</h3>
        <hr><br>
        <div id="modalBody"></div>
    </div>
</div>

<script>
    // 🔴 Render Live Server Connection
    const socket = io('https://socialverse-bot.onrender.com');

    // রিয়েল-টাইম স্ট্যাটাস আপডেট
    socket.on('bot-status', (data) => {
        document.getElementById('loader').innerText = `⏳ ${data.status}`;
    });

    // ব্যাকএন্ড থেকে রেসপন্স হ্যান্ডেল করা
    socket.on('bot-complete', (data) => {
        document.getElementById('startBtn').disabled = false;
        document.getElementById('loader').style.display = 'none';

        const modalBody = document.getElementById('modalBody');
        modalBody.innerHTML = '';

        if (data.success && data.results && data.results.length > 0) {
            data.results.forEach((acc) => {
                if (acc.success) {
                    if (!acc.mails || acc.mails.length === 0) {
                        modalBody.innerHTML += `<div class="mail-box"><b>📧 Account: ${acc.email}</b><br>কোনো মেইল পাওয়া যায়নি।</div>`;
                    } else {
                        acc.mails.forEach((mail) => {
                            modalBody.innerHTML += `
                                <div class="mail-box">
                                    <b>📧 Account: ${acc.email} | #Mail ${mail.id}:</b><br>
                                    <strong>Subject:</strong> ${mail.subject}<br>
                                    ${mail.content}
                                </div>
                            `;
                        });
                    }
                } else {
                    modalBody.innerHTML += `<div class="mail-box" style="border-left-color: #ff4757;"><b>❌ Account: ${acc.email}</b><br>Error: ${acc.message}</div>`;
                }
            });

            document.getElementById('modalOverlay').style.display = 'flex';
        } else {
            alert("কোনো ডাটা পাওয়া যায়নি!");
        }
    });

    function startBot() {
        const inputData = document.getElementById('credentials').value.trim();
        if (!inputData) {
            alert("ইমেইল প্রদান করুন!");
            return;
        }

        document.getElementById('startBtn').disabled = true;
        document.getElementById('loader').innerText = '⏳ Azure API কানেক্ট করা হচ্ছে...';
        document.getElementById('loader').style.display = 'block';

        socket.emit('start-bot', inputData);
    }

    function closeModal() {
        document.getElementById('modalOverlay').style.display = 'none';
    }
</script>

</body>
</html>
