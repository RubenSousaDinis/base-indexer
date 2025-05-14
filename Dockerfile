# Use Node.js 18 as the base image
FROM node:18-alpine

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

# Build TypeScript and copy necessary files
RUN npm run build

# Set environment variables
ENV NODE_ENV=production
ENV NODE_OPTIONS="--experimental-specifier-resolution=node"

# Expose port if needed (for future API endpoints)
EXPOSE 3000

# Start the application
CMD ["node", "--experimental-specifier-resolution=node", "--input-type=module", "dist/indexer/index.js"] 