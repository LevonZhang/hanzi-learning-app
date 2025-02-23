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
mkdir -p screenshots/{iphone,ipad,mac}/{original,processed}
mkdir -p screenshots/iphone/processed/{iphone_15_pro_max_portrait,iphone_15_pro_max_landscape,iphone_14_pro_portrait,iphone_14_pro_landscape}
mkdir -p screenshots/ipad/processed/{ipad_pro_portrait,ipad_pro_landscape,ipad_portrait,ipad_landscape}
mkdir -p screenshots/mac/processed/{macbook,imac}

echo -e "${BLUE}=== App Store Screenshot Processor ===${NC}"
echo -e "${BLUE}This script will process screenshots for different devices${NC}"

# 定义设备和尺寸
declare -A DEVICE_CONFIGS=(
    ["iphone"]="iphone_15_pro_max_portrait:1290x2796 iphone_15_pro_max_landscape:2796x1290 iphone_14_pro_portrait:1320x2868 iphone_14_pro_landscape:2868x1320"
    ["ipad"]="ipad_pro_portrait:2048x2732 ipad_pro_landscape:2732x2048 ipad_portrait:2048x2732 ipad_landscape:2732x2048"
    ["mac"]="macbook:2880x1800 imac:2880x1800"
)

# 处理函数
process_image() {
    local input=$1
    local size=$2
    local device_type=$3
    local device_subtype=$4
    local output="screenshots/${device_type}/processed/${device_subtype}/$(basename "${input%.*}")_${size}.png"
    
    echo -e "${BLUE}Processing ${input} for ${device_type}/${device_subtype} (${size})...${NC}"
    
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

# 处理特定设备类型的图片
process_device_type() {
    local device_type=$1
    local configs=${DEVICE_CONFIGS[$device_type]}
    local count=0
    local total=0
    
    # 检查原始目录是否为空
    if [ -z "$(ls -A screenshots/${device_type}/original 2>/dev/null)" ]
    then
        echo -e "${RED}No files found in screenshots/${device_type}/original/${NC}"
        return 0
    fi
    
    # 计算总文件数
    for ext in png jpg jpeg
    do
        for file in screenshots/${device_type}/original/*.$ext
        do
            if [ -f "$file" ]
            then
                total=$((total + $(echo "$configs" | wc -w)))
            fi
        done
    done
    
    if [ $total -eq 0 ]
    then
        return 0
    fi
    
    echo -e "${BLUE}Processing ${device_type} screenshots...${NC}"
    echo -e "${BLUE}Found $((total/$(echo "$configs" | wc -w))) images to process${NC}"
    
    # 处理每个文件
    for ext in png jpg jpeg
    do
        for file in screenshots/${device_type}/original/*.$ext
        do
            if [ -f "$file" ]
            then
                echo -e "${BLUE}Processing: $(basename "$file")${NC}"
                for config in $configs
                do
                    IFS=':' read -r device_subtype size <<< "$config"
                    if process_image "$file" "$size" "$device_type" "$device_subtype"
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
        echo -e "${GREEN}Completed processing ${device_type} screenshots: $count files created${NC}"
    fi
}

# 创建使用说明
create_readme() {
    cat > screenshots/README.md << 'EOF'
# Screenshot Processing Guide

## Directory Structure
- iphone/
  - original/: Place your iPhone original screenshots here
  - processed/
    - iphone_15_pro_max_portrait/: 1290 × 2796px
    - iphone_15_pro_max_landscape/: 2796 × 1290px
    - iphone_14_pro_portrait/: 1320 × 2868px
    - iphone_14_pro_landscape/: 2868 × 1320px
- ipad/
  - original/: Place your iPad original screenshots here
  - processed/
    - ipad_pro_portrait/: 2048 × 2732px
    - ipad_pro_landscape/: 2732 × 2048px
    - ipad_portrait/: 2048 × 2732px
    - ipad_landscape/: 2732 × 2048px
- mac/
  - original/: Place your Mac original screenshots here
  - processed/
    - macbook/: 2880 × 1800px
    - imac/: 2880 × 1800px

## Usage
1. Place your original screenshots in the corresponding device's 'original' directory:
   - iPhone screenshots -> iphone/original/
   - iPad screenshots -> ipad/original/
   - Mac screenshots -> mac/original/
2. Run the script: ./process_screenshots.sh
3. Find processed images in the respective device directories

## Requirements
- ImageMagick must be installed (will be automatically installed if missing)
- Original screenshots should be high resolution
- Supported formats: .png, .jpg, .jpeg

## App Store Requirements
These dimensions are specifically chosen to meet App Store requirements for:
- iPhone 14 Pro/iPhone 15 Pro screenshots (1320 × 2868px)
- iPhone 14 Pro Max/iPhone 15 Pro Max screenshots (1290 × 2796px)
- iPad Pro (12.9-inch) screenshots (2048 × 2732px)
- iPad (13-inch) screenshots (2048 × 2732px)
- Mac screenshots (2880 × 1800px)
Both portrait and landscape orientations are supported for mobile devices.
EOF
}

# 初始化
init() {
    echo -e "${BLUE}Initializing directory structure...${NC}"
    create_readme
    echo -e "${GREEN}Initialization complete${NC}"
    echo -e "${BLUE}Current directory structure:${NC}"
    ls -R screenshots/
    echo -e "${BLUE}Please place your original screenshots in the corresponding device's original directory${NC}"
}

# 主程序
main() {
    echo -e "${BLUE}Script started${NC}"
    init
    echo -e "${BLUE}Starting screenshot processing...${NC}"
    
    # 处理每种设备类型
    for device_type in "${!DEVICE_CONFIGS[@]}"
    do
        process_device_type "$device_type"
    done
    
    echo -e "${BLUE}Script completed${NC}"
}

# 运行主程序
main