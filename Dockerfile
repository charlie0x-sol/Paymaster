# Use specific node version for reproducibility
FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
# --only=production skips devDependencies like jest
RUN npm ci --only=production

# Copy source code
COPY . .

# Expose the application port
EXPOSE 3000

# Define environment variables with defaults (can be overridden)
ENV NODE_ENV=production
ENV PORT=3000

# Start the application
CMD ["node", "index.js"]
