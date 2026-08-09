# Microsoft-এর অফিসিয়াল Playwright ইমেজ
FROM mcr.microsoft.com/playwright:v1.42.1-jammy

# ওয়ার্ক ডিরেক্টরি সেট করা
WORKDIR /app

# ডিপেন্ডেন্সি কপি ও ইনস্টল করা
COPY package*.json ./
RUN npm install

# প্রজেক্ট ফাইল কপি করা
COPY . .

# পোর্ট এক্সপোজ করা
EXPOSE 5000

# সার্ভার স্টার্ট কমান্ড
CMD ["npm", "start"]
