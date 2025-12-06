#!/usr/bin/env python3
"""
Remove console.log statements from JavaScript files while keeping console.error
"""
import os
import re
import sys

def remove_console_logs(file_path):
    """Remove console.log lines from a file"""
    with open(file_path, 'r') as f:
        lines = f.readlines()
    
    new_lines = []
    for line in lines:
        # Skip lines that are ONLY console.log (with optional whitespace)
        if re.match(r'^\s*console\.log\(.*\);\s*$', line):
            continue
        new_lines.append(line)
    
    with open(file_path, 'w') as f:
        f.writelines(new_lines)
    
    return len(lines) - len(new_lines)

def main():
    # Get all JS files in api and lib directories
    files_to_process = []
    
    for directory in ['api', 'lib']:
        if os.path.exists(directory):
            for filename in os.listdir(directory):
                if filename.endswith('.js'):
                    files_to_process.append(os.path.join(directory, filename))
    
    total_removed = 0
    for file_path in files_to_process:
        removed = remove_console_logs(file_path)
        if removed > 0:
            print(f"✅ {file_path}: Removed {removed} console.log lines")
            total_removed += removed
    
    print(f"\n🎯 Total: Removed {total_removed} console.log lines from {len(files_to_process)} files")

if __name__ == '__main__':
    main()

