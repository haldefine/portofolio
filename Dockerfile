FROM node:20.12

WORKDIR /app

COPY package*.json ./

RUN npm install

COPY . .

RUN npx tsc

EXPOSE 8080

CMD [ "node", "dist/index.js" ]
