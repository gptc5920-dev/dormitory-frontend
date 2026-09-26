# Step 1: Build stage
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN chmod -R +x node_modules/.bin
RUN npm run build

# Step 2: Serve stage
FROM nginx:alpine

# Remove default static files to prevent leftover index page issues
RUN rm -rf /usr/share/nginx/html/*

# Copy Vite production build
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration with proxy rules
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]# Step 1: Build stage
FROM node:20-alpine AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

RUN chmod -R +x node_modules/.bin
RUN npm run build

# Step 2: Serve stage
FROM nginx:alpine

# Remove default static files to prevent leftover index page issues
RUN rm -rf /usr/share/nginx/html/*

# Copy Vite production build
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration with proxy rules
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]