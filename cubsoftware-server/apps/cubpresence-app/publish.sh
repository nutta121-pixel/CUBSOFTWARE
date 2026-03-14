#!/bin/bash
echo "CubPresence Publisher"
echo "====================="
echo ""

# Check if GH_TOKEN is set
if [ -z "$GH_TOKEN" ]; then
    echo "ERROR: GH_TOKEN environment variable is not set!"
    echo ""
    echo "Set it with:"
    echo "  export GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx"
    echo ""
    echo "Or add to ~/.bashrc for permanent:"
    echo "  echo 'export GH_TOKEN=ghp_xxxxxxxxxxxxxxxxxxxx' >> ~/.bashrc"
    echo "  source ~/.bashrc"
    echo ""
    exit 1
fi

echo "Building and publishing CubPresence..."
echo ""
npm run publish

echo ""
echo "Done! Check your GitHub releases page."
