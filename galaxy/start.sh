#!/bin/bash
pip3 install -r "$(dirname "$0")/requirements.txt" --quiet
exec python3 "$(dirname "$0")/main.py"
