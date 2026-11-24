# Multi-stage Dockerfile for React Frontend

# Stage 1: Build React static assets
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Stage 2: Minimal runtime web server (nginx alpine)
FROM nginx:alpine AS runner

# Copy built assets to nginx public html
COPY --from=builder /app/dist /usr/share/nginx/html

# Custom nginx config to handle client-side routing & reverse proxy
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 3000

CMD ["nginx", "-g", "daemon off;"]
