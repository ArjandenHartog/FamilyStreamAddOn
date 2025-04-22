#!/bin/bash

# Initialize git repository
git init

# Add all files
git add .

# Initial commit
git commit -m "Initial commit of FamilyStream Home Assistant Add-on"

# Instructions for pushing to GitHub
echo "Repository initialized successfully."
echo ""
echo "To push this repository to GitHub:"
echo "1. Create a new repository on GitHub (don't initialize with README)"
echo "2. Run the following commands:"
echo "   git remote add origin https://github.com/ArjandenHartog/familystream-addon.git"
echo "   git branch -M main"
echo "   git push -u origin main"
echo ""
echo "Replace 'YourUsername' with your actual GitHub username and repository name if different." 