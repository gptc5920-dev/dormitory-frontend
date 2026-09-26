# Step 1: Build the React application
FROM node:20-alpine AS build
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Step 2: Serve with Nginx
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
# Note: If using Create React App instead of Vite, change '/app/dist' to '/app/build'

# Expose port 80
EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]