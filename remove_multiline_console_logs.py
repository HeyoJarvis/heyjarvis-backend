#!/usr/bin/env python3
"""
Remove multi-line console.log statements from JavaScript files
"""
import os
import re

def remove_multiline_console_logs(file_path):
    """Remove console.log statements including multi-line ones"""
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Remove console.log statements (including multi-line)
    # Match console.log( ... ); including nested parentheses
    pattern = r'^\s*console\.log\([^;]*\);\s*$'
    
    lines = content.split('\n')
    new_lines = []
    i = 0
    while i < len(lines):
        line = lines[i]
        
        # Check if line starts with console.log
        if re.match(r'^\s*console\.log\(', line):
            # Count parentheses to find the end
            paren_count = line.count('(') - line.count(')')
            full_statement = line
            
            # If parentheses are balanced and ends with );
            if paren_count == 0 and line.rstrip().endswith(');'):
                # Skip this single line console.log
                i += 1
                continue
            
            # Multi-line console.log - keep reading until balanced
            j = i + 1
            while j < len(lines) and paren_count > 0:
                full_statement += '\n' + lines[j]
                paren_count += lines[j].count('(') - lines[j].count(')')
                j += 1
            
            # Skip all lines of this console.log statement
            i = j
            continue
        
        new_lines.append(line)
        i += 1
    
    new_content = '\n'.join(new_lines)
    
    with open(file_path, 'w') as f:
        f.write(new_content)
    
    return len(lines) - len(new_lines)

def main():
    files_to_process = []
    
    for directory in ['api', 'lib']:
        if os.path.exists(directory):
            for filename in os.listdir(directory):
                if filename.endswith('.js'):
                    files_to_process.append(os.path.join(directory, filename))
    
    total_removed = 0
    for file_path in files_to_process:
        removed = remove_multiline_console_logs(file_path)
        if removed > 0:
            print(f"✅ {file_path}: Removed {removed} lines")
            total_removed += removed
    
    print(f"\n🎯 Total: Removed {total_removed} lines from {len(files_to_process)} files")

if __name__ == '__main__':
    main()

