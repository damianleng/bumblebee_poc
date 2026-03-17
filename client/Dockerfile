FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}

EXPOSE 8080

CMD ["npm", "run", "dev", "--", "--host"]
