FROM mcr.microsoft.com/playwright/node:22-jammy

WORKDIR /app

RUN apt-get update && apt-get install -y unzip

COPY package*.json ./
RUN npm install

COPY . .

ENV PORT=5000
EXPOSE 5000

CMD ["node", "server.js"]
