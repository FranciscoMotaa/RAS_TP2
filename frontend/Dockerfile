FROM node:18

WORKDIR /usr/src/app

COPY package.json ./
RUN npm install -g bun
RUN bun i
COPY . .

EXPOSE 3000
# para dev (com hot reload):
CMD ["bun", "dev"]
