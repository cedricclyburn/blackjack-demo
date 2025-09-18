# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --no-audit --no-fund

# Copy source code
COPY . .

# Build the app with environment variables
ARG VITE_LS_BASE_URL=/v1
ARG VITE_LS_MODEL_ID=mistral-small-24b-w8a8
RUN npm run build

# Production stage
FROM nginx:stable-alpine

# Copy built app from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

# Create directories for nginx with proper permissions
RUN mkdir -p /tmp/nginx_client_temp /tmp/nginx_proxy_temp /tmp/nginx_fastcgi_temp /tmp/nginx_uwsgi_temp /tmp/nginx_scgi_temp && \
    chmod -R 777 /tmp/nginx_* && \
    chmod -R 755 /usr/share/nginx/html && \
    chmod 644 /etc/nginx/nginx.conf && \
    chown -R nginx:nginx /usr/share/nginx/html /tmp/nginx_* && \
    touch /var/run/nginx.pid && \
    chown nginx:nginx /var/run/nginx.pid

# Use non-root user
USER nginx

# Expose port 8080 for OpenShift compatibility
EXPOSE 8080

# Run nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
