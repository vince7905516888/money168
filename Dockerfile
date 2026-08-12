FROM node:24-alpine AS base

WORKDIR /app

# Copy package files and prisma schema (needed for postinstall)
COPY package*.json ./
COPY prisma ./prisma
COPY prisma.config.ts ./

# Install all dependencies including devDependencies (needed for tsx in start script)
RUN npm ci --include=dev

# Copy remaining source
COPY . .

# Generate Prisma client & build
RUN npm run build

# Start
EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["npm", "run", "start"]
