FROM node:20
WORKDIR /app
COPY package*.json ./
RUN npm config set strict-ssl false && npm install
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["node", "dist/main"]
