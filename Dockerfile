# Use Node.js 18 as the base image
FROM node:18-slim

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm install

# Bundle app source
COPY . .

# Build TypeScript and copy necessary files
RUN npm run build && \
    echo "Contents of dist directory:" && \
    ls -la dist && \
    echo "Contents of dist/indexer directory:" && \
    ls -la dist/indexer

# Expose port if needed (for future API endpoints)
EXPOSE 3000

# Start the indexer
CMD ["node", "--experimental-specifier-resolution=node", "--input-type=module", "--experimental-modules", "dist/indexer/index.js"] 