FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm config set strict-ssl false && npm install
COPY . .
ARG BACKEND_URL=http://backend:3001
ENV BACKEND_URL=${BACKEND_URL}
RUN NODE_TLS_REJECT_UNAUTHORIZED=0 npm run build
EXPOSE 3000
CMD ["npm", "start"]
