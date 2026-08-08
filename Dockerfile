FROM mcr.microsoft.com/playwright/node:18-jammy

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

EXPOSE 5000

CMD ["node", "server.js"]
