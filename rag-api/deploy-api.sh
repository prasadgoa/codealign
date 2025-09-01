#!/bin/bash

# RAG API Server Deployment Script
set -e

echo "🚀 Deploying RAG API Server..."

# Create application directory
sudo mkdir -p /opt/rag-api
cd /opt/rag-api

# Copy files (assumes you're running this from your local directory with the files)
echo "📁 Copying application files..."
sudo cp server.js /opt/rag-api/
sudo cp package.json /opt/rag-api/

# Install Node.js if not present
if ! command -v node &> /dev/null; then
    echo "📦 Installing Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
    sudo apt-get install -y nodejs
fi

# Install dependencies
echo "📦 Installing npm dependencies..."
sudo npm install --production

# Set up systemd service
echo "🔧 Setting up systemd service..."
sudo cp rag-api.service /etc/systemd/system/

# Reload systemd and enable service
sudo systemctl daemon-reload
sudo systemctl enable rag-api

# Open firewall port
echo "🔥 Configuring firewall..."
sudo ufw allow 3001/tcp

# Start the service
echo "🚀 Starting RAG API service..."
sudo systemctl start rag-api

# Check status
echo "✅ Checking service status..."
sudo systemctl status rag-api --no-pager

echo ""
echo "==================================="
echo "🎉 RAG API Server deployed successfully!"
echo "📡 API URL: http://35.209.113.236:3001"
echo "🏥 Health check: http://35.209.113.236:3001/health"
echo "📊 Service status: sudo systemctl status rag-api"
echo "📝 Service logs: sudo journalctl -u rag-api -f"
echo "==================================="
