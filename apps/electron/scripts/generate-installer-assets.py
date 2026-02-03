#!/usr/bin/env python3
"""
Generate installer assets using the app's background image
Creates beautiful DMG and NSIS installer graphics

Generates high-quality @2x Retina images for best display quality.
"""

from PIL import Image, ImageFilter, ImageDraw, ImageFont
import os
from pathlib import Path

# Paths
SCRIPT_DIR = Path(__file__).parent
BUILD_DIR = SCRIPT_DIR.parent / "build"
SOURCE_BG = BUILD_DIR / "background.png"

# Use @2x resolution for Retina displays
RETINA_SCALE = 2

def create_dmg_background():
    """Create DMG background with drag-to-Applications design at @2x resolution"""
    print("Creating DMG background (@2x Retina)...")

    # Base dimensions (will be scaled 2x for Retina)
    base_width, base_height = 660, 400
    width, height = base_width * RETINA_SCALE, base_height * RETINA_SCALE

    # Load and process background
    bg = Image.open(SOURCE_BG)

    # Calculate crop to cover the target size
    bg_ratio = bg.width / bg.height
    target_ratio = width / height

    if bg_ratio > target_ratio:
        # Image is wider, crop width
        new_width = int(bg.height * target_ratio)
        left = (bg.width - new_width) // 2
        bg = bg.crop((left, 0, left + new_width, bg.height))
    else:
        # Image is taller, crop height
        new_height = int(bg.width / target_ratio)
        top = (bg.height - new_height) // 2
        bg = bg.crop((0, top, bg.width, top + new_height))

    # Resize to target dimensions
    bg = bg.resize((width, height), Image.Resampling.LANCZOS)

    # Apply slight blur (scaled for resolution)
    bg = bg.filter(ImageFilter.GaussianBlur(radius=2 * RETINA_SCALE))

    # Darken slightly
    from PIL import ImageEnhance
    enhancer = ImageEnhance.Brightness(bg)
    bg = enhancer.enhance(0.85)

    # Create overlay
    overlay = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # Semi-transparent dark overlay
    draw.rectangle([0, 0, width, height], fill=(0, 0, 0, 76))  # 30% opacity

    # Scale factor for all dimensions
    s = RETINA_SCALE

    # Try to load a nice font, fallback to default (scaled for Retina)
    try:
        title_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 32 * s)
        subtitle_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 14 * s)
        label_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 13 * s)
        instruction_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 15 * s)
        version_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 12 * s)
    except:
        title_font = ImageFont.load_default()
        subtitle_font = title_font
        label_font = title_font
        instruction_font = title_font
        version_font = title_font

    # Title
    draw.text((width//2, 50 * s), "S-AGI", font=title_font, fill=(255, 255, 255, 255), anchor="mm")
    draw.text((width//2, 78 * s), "AI Agent for Spreadsheets", font=subtitle_font, fill=(255, 255, 255, 200), anchor="mm")

    # Drop zone boxes (glassmorphism style)
    # App icon zone (left)
    box_size = 110 * s
    app_x, app_y = 180 * s, 175 * s
    draw.rounded_rectangle(
        [app_x - box_size//2, app_y - box_size//2, app_x + box_size//2, app_y + box_size//2],
        radius=24 * s,
        fill=(255, 255, 255, 25),
        outline=(255, 255, 255, 76),
        width=2 * s
    )

    # Applications zone (right)
    apps_x, apps_y = 480 * s, 175 * s
    draw.rounded_rectangle(
        [apps_x - box_size//2, apps_y - box_size//2, apps_x + box_size//2, apps_y + box_size//2],
        radius=24 * s,
        fill=(255, 255, 255, 25),
        outline=(255, 255, 255, 76),
        width=2 * s
    )

    # Arrow between boxes
    arrow_y = 175 * s
    arrow_start = app_x + box_size//2 + 20 * s
    arrow_end = apps_x - box_size//2 - 20 * s

    # Dashed line effect (draw segments)
    dash_length = 12 * s
    gap_length = 6 * s
    x = arrow_start
    while x < arrow_end - 20 * s:
        draw.line([(x, arrow_y), (min(x + dash_length, arrow_end - 20 * s), arrow_y)],
                  fill=(255, 255, 255, 153), width=3 * s)
        x += dash_length + gap_length

    # Arrow head
    arrow_head_x = arrow_end
    draw.polygon([
        (arrow_head_x, arrow_y),
        (arrow_head_x - 20 * s, arrow_y - 14 * s),
        (arrow_head_x - 20 * s, arrow_y + 14 * s)
    ], fill=(255, 255, 255, 178))

    # Labels
    draw.text((180 * s, 270 * s), "S-AGI.app", font=label_font, fill=(255, 255, 255, 230), anchor="mm")
    draw.text((480 * s, 270 * s), "Applications", font=label_font, fill=(255, 255, 255, 230), anchor="mm")

    # Instructions
    draw.text((width//2, 330 * s), "Drag S-AGI to Applications to install",
              font=instruction_font, fill=(255, 255, 255, 216), anchor="mm")

    # Version badge
    badge_width = 80 * s
    badge_height = 26 * s
    badge_x = width//2 - badge_width//2
    badge_y = 350 * s
    draw.rounded_rectangle(
        [badge_x, badge_y, badge_x + badge_width, badge_y + badge_height],
        radius=13 * s,
        fill=(255, 255, 255, 38)
    )
    draw.text((width//2, badge_y + badge_height//2), "v0.1.0", font=version_font, fill=(255, 255, 255, 178), anchor="mm")

    # Composite
    bg = bg.convert('RGBA')
    result = Image.alpha_composite(bg, overlay)
    result = result.convert('RGB')

    # Save at maximum quality (compress_level=0 = no compression)
    result.save(BUILD_DIR / "dmg-background.png", "PNG", compress_level=0)
    print(f"✓ DMG background created ({width}x{height} @2x Retina)")

def create_nsis_sidebar():
    """Create NSIS installer sidebar at high resolution"""
    print("Creating NSIS sidebar (high quality)...")

    # NSIS sidebar is 164x314 - use 2x for better quality on high-DPI displays
    base_width, base_height = 164, 314
    width, height = base_width * RETINA_SCALE, base_height * RETINA_SCALE

    # Load and process background
    bg = Image.open(SOURCE_BG)

    # Crop and resize
    bg_ratio = bg.width / bg.height
    target_ratio = width / height

    if bg_ratio > target_ratio:
        new_width = int(bg.height * target_ratio)
        left = (bg.width - new_width) // 2
        bg = bg.crop((left, 0, left + new_width, bg.height))
    else:
        new_height = int(bg.width / target_ratio)
        top = (bg.height - new_height) // 2
        bg = bg.crop((0, top, bg.width, top + new_height))

    bg = bg.resize((width, height), Image.Resampling.LANCZOS)
    bg = bg.filter(ImageFilter.GaussianBlur(radius=3 * RETINA_SCALE))

    from PIL import ImageEnhance
    enhancer = ImageEnhance.Brightness(bg)
    bg = enhancer.enhance(0.7)

    # Scale factor
    s = RETINA_SCALE

    # Create overlay
    overlay = Image.new('RGBA', (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    # Gradient overlay (darker at bottom)
    for y in range(height):
        alpha = int(100 + (y / height) * 50)  # 40% to 60%
        draw.line([(0, y), (width, y)], fill=(0, 0, 0, alpha))

    # Try to load fonts (scaled)
    try:
        logo_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 36 * s)
        name_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 22 * s)
        desc_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 11 * s)
        version_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 10 * s)
    except:
        logo_font = ImageFont.load_default()
        name_font = logo_font
        desc_font = logo_font
        version_font = logo_font

    # Logo circle
    cx, cy = width // 2, 100 * s
    r = 45 * s
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, 38), outline=(255, 255, 255, 76), width=2 * s)
    draw.text((cx, cy + 5 * s), "S", font=logo_font, fill=(255, 255, 255, 255), anchor="mm")

    # App name
    draw.text((width//2, 180 * s), "S-AGI", font=name_font, fill=(255, 255, 255, 255), anchor="mm")
    draw.text((width//2, 202 * s), "AI Agent for", font=desc_font, fill=(255, 255, 255, 178), anchor="mm")
    draw.text((width//2, 218 * s), "Spreadsheets", font=desc_font, fill=(255, 255, 255, 178), anchor="mm")

    # Decorative line
    draw.line([(30 * s, 250 * s), (134 * s, 250 * s)], fill=(255, 255, 255, 51), width=1 * s)

    # Version
    draw.text((width//2, 290 * s), "Version 0.1.0", font=version_font, fill=(255, 255, 255, 127), anchor="mm")

    # Composite
    bg = bg.convert('RGBA')
    result = Image.alpha_composite(bg, overlay)

    # Resize back to target size for Windows (which doesn't need @2x)
    result = result.resize((base_width, base_height), Image.Resampling.LANCZOS)
    result = result.convert('RGB')

    result.save(BUILD_DIR / "installer-sidebar.png", "PNG", compress_level=0)
    print(f"✓ NSIS sidebar created ({base_width}x{base_height}, rendered @{RETINA_SCALE}x)")

def create_nsis_header():
    """Create NSIS installer header at high resolution"""
    print("Creating NSIS header (high quality)...")

    # NSIS header is 150x57 - render at 2x for quality
    base_width, base_height = 150, 57
    width, height = base_width * RETINA_SCALE, base_height * RETINA_SCALE
    s = RETINA_SCALE

    # Load and process background
    bg = Image.open(SOURCE_BG)

    # Crop top portion and resize
    bg_ratio = bg.width / bg.height
    target_ratio = width / height

    if bg_ratio > target_ratio:
        new_width = int(bg.height * target_ratio)
        left = (bg.width - new_width) // 2
        bg = bg.crop((left, 0, left + new_width, bg.height))
    else:
        new_height = int(bg.width / target_ratio)
        bg = bg.crop((0, 0, bg.width, new_height))

    bg = bg.resize((width, height), Image.Resampling.LANCZOS)
    bg = bg.filter(ImageFilter.GaussianBlur(radius=2 * s))

    from PIL import ImageEnhance
    enhancer = ImageEnhance.Brightness(bg)
    bg = enhancer.enhance(0.75)

    # Create overlay
    overlay = Image.new('RGBA', (width, height), (0, 0, 0, 76))
    draw = ImageDraw.Draw(overlay)

    try:
        title_font = ImageFont.truetype("/System/Library/Fonts/Helvetica.ttc", 20 * s)
    except:
        title_font = ImageFont.load_default()

    draw.text((width//2, height//2 + 2 * s), "S-AGI", font=title_font, fill=(255, 255, 255, 255), anchor="mm")

    # Composite
    bg = bg.convert('RGBA')
    result = Image.alpha_composite(bg, overlay)

    # Resize back to target size for Windows
    result = result.resize((base_width, base_height), Image.Resampling.LANCZOS)
    result = result.convert('RGB')

    result.save(BUILD_DIR / "installer-header.png", "PNG", compress_level=0)
    print(f"✓ NSIS header created ({base_width}x{base_height}, rendered @{RETINA_SCALE}x)")

if __name__ == "__main__":
    print("=" * 50)
    print("S-AGI Installer Assets Generator")
    print("Using app background image")
    print("=" * 50)
    print()

    create_dmg_background()
    create_nsis_sidebar()
    create_nsis_header()

    print()
    print("=" * 50)
    print("All assets generated successfully!")
    print("=" * 50)
