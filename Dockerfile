FROM ghcr.io/puppeteer/puppeteer:23.10.3

USER root

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ENV PORT=5000
EXPOSE 5000

CMD ["node", "server.js"]
