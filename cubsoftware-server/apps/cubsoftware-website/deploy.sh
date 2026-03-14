#!/bin/bash
# Deployment script for CUB SOFTWARE

set -e

echo "==================================="
echo "CUB SOFTWARE Deployment Script"
echo "==================================="

# Update system
echo "Updating system packages..."
sudo apt update && sudo apt upgrade -y

# Install required packages
echo "Installing required packages..."
sudo apt install -y python3 python3-pip python3-venv nginx ffmpeg

# Create application directory
echo "Setting up application directory..."
sudo mkdir -p /var/www/cubsoftware
sudo chown -R $USER:$USER /var/www/cubsoftware

# Create log directories
echo "Creating log directories..."
sudo mkdir -p /var/log/cubsoftware
sudo mkdir -p /var/run/cubsoftware
sudo chown -R www-data:www-data /var/log/cubsoftware
sudo chown -R www-data:www-data /var/run/cubsoftware

# Copy application files (assumes you're in the project directory)
echo "Copying application files..."
cp -r * /var/www/cubsoftware/
cd /var/www/cubsoftware

# Create virtual environment
echo "Creating Python virtual environment..."
python3 -m venv venv
source venv/bin/activate

# Install Python dependencies
echo "Installing Python dependencies..."
pip install --upgrade pip
pip install -r requirements.txt

# Set proper permissions
echo "Setting permissions..."
sudo chown -R www-data:www-data /var/www/cubsoftware
sudo chmod -R 755 /var/www/cubsoftware

# Install systemd service
echo "Installing systemd service..."
sudo cp cubsoftware.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable cubsoftware
sudo systemctl start cubsoftware

# Configure Nginx
echo "Configuring Nginx..."
sudo cp nginx.conf /etc/nginx/sites-available/cubsoftware
sudo ln -sf /etc/nginx/sites-available/cubsoftware /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx

# Set up SSL with Let's Encrypt (optional but recommended)
echo ""
echo "==================================="
echo "To set up SSL certificate, run:"
echo "sudo apt install certbot python3-certbot-nginx"
echo "sudo certbot --nginx -d cubsoftware.site -d www.cubsoftware.site"
echo "==================================="

echo ""
echo "Deployment complete!"
echo "Your application should now be running at http://your-server-ip"
echo ""
echo "Check status with: sudo systemctl status cubsoftware"
echo "View logs with: sudo journalctl -u cubsoftware -f"
