#!/bin/bash

# 颜色定义
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

# 检查是否安装了 ImageMagick
if ! command -v convert &> /dev/null
then
    echo -e "${RED}Error: ImageMagick is not installed${NC}"
    echo "Installing ImageMagick..."
    brew install imagemagick
fi

# 创建目录结构
mkdir -p screenshots/processed/{iphone_14_pro_max,iphone_8_plus,ipad_pro}
mkdir -p screenshots/original

echo -e "${BLUE}=== App Store Screenshot Processor ===${NC}"
echo -e "${BLUE}This script will process screenshots for different devices${NC}"

# 定义设备和尺寸
DEVICES=("iphone_14_pro_max" "iphone_8_plus" "ipad_pro")
SIZES=("1284x2778" "1242x2208" "2048x2732")

# 处理函数
process_image() {
    local input=$1
    local size=$2
    local device=$3
    local output="screenshots/processed/${device}/$(basename "${input%.*}")_${size}.png"
    
    echo -e "${BLUE}Processing ${input} for ${device} (${size})...${NC}"
    
    convert "$input" \
        -resize ${size}^ \
        -gravity center \
        -extent ${size} \
        -quality 100 \
        "$output"
    
    if [ $? -eq 0 ]
    then
        echo -e "${GREEN}Successfully created: $output${NC}"
        return 0
    else
        echo -e "${RED}Failed to process: $input${NC}"
        return 1
    fi
}

# 主处理逻辑
process_screenshots() {
    local count=0
    local total=0
    
    # 检查目录是否为空
    if [ -z "$(ls -A screenshots/original 2>/dev/null)" ]
    then
        echo -e "${RED}Error: screenshots/original/ directory is empty${NC}"
        echo -e "${BLUE}Please follow these steps:${NC}"
        echo "1. Place your screenshots in screenshots/original/ directory"
        echo "2. Supported formats: .png, .jpg, .jpeg"
        echo "3. Run this script again"
        return 1
    fi
    
    # 计算总文件数
    for ext in png jpg jpeg
    do
        for file in screenshots/original/*.$ext
        do
            if [ -f "$file" ]
            then
                total=$((total + ${#DEVICES[@]}))
            fi
        done
    done
    
    if [ $total -eq 0 ]
    then
        echo -e "${RED}No valid image files found in screenshots/original/${NC}"
        echo -e "${BLUE}Supported formats: .png, .jpg, .jpeg${NC}"
        return 1
    fi
    
    echo -e "${BLUE}Found $((total/${#DEVICES[@]})) images to process${NC}"
    echo -e "${BLUE}Will generate $total processed images${NC}"
    
    # 处理每种格式的文件
    for ext in png jpg jpeg
    do
        for file in screenshots/original/*.$ext
        do
            if [ -f "$file" ]
            then
                echo -e "${BLUE}Processing: $(basename "$file")${NC}"
                for i in "${!DEVICES[@]}"
                do
                    if process_image "$file" "${SIZES[$i]}" "${DEVICES[$i]}"
                    then
                        count=$((count + 1))
                        echo -e "${GREEN}Progress: $count/$total${NC}"
                    fi
                done
            fi
        done
    done
    
    if [ $count -gt 0 ]
    then
        echo -e "${GREEN}Processing complete! $count files created${NC}"
        echo -e "${BLUE}Files are saved in screenshots/processed/ directory${NC}"
        
        # 显示处理后的文件
        echo -e "${BLUE}Processed files:${NC}"
        for device in "${DEVICES[@]}"
        do
            echo -e "${GREEN}${device}:${NC}"
            ls -l "screenshots/processed/${device}"
        done
    else
        echo -e "${RED}No files were processed${NC}"
    fi
}

# 创建使用说明
create_readme() {
    cat > screenshots/README.md << 'EOF'
# Screenshot Processing Guide

## Directory Structure
- original/: Place your original screenshots here
- processed/: Contains processed screenshots for different devices
  - iphone_14_pro_max/: 1284x2778 pixels
  - iphone_8_plus/: 1242x2208 pixels
  - ipad_pro/: 2048x2732 pixels

## Usage
1. Place your original screenshots in the 'original' directory
2. Run the script: ./process_screenshots.sh
3. Find processed images in the respective device directories

## Requirements
- ImageMagick must be installed
- Original screenshots should be high resolution
EOF
}

# 初始化
init() {
    echo -e "${BLUE}Initializing directory structure...${NC}"
    create_readme
    echo -e "${GREEN}Initialization complete${NC}"
    echo -e "${BLUE}Current directory structure:${NC}"
    ls -R screenshots/
    echo -e "${BLUE}Please place your original screenshots in screenshots/original/ directory${NC}"
}

# 主程序
main() {
    echo -e "${BLUE}Script started${NC}"
    init
    echo -e "${BLUE}Starting screenshot processing...${NC}"
    process_screenshots
    echo -e "${BLUE}Script completed${NC}"
}

# 运行主程序
main