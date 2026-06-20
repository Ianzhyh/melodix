from PIL import Image, ImageDraw

# Create a simple but attractive icon
size = 256
img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
draw = ImageDraw.Draw(img)

# Background: rounded gradient-like circle
for i in range(size):
    for j in range(size):
        # Distance from center
        cx, cy = size // 2, size // 2
        dist = ((i - cx) ** 2 + (j - cy) ** 2) ** 0.5
        max_dist = size * 0.45
        if dist < max_dist:
            # Gradient from deep blue to purple
            t = dist / max_dist
            r = int(25 + t * 40)
            g = int(20 + t * 15)
            b = int(80 + t * 60)
            a = 255
            img.putpixel((j, i), (r, g, b, a))

# Draw a simple music note symbol
note_color = (200, 210, 255, 255)
# Stem
for y in range(60, 160):
    for x in range(148, 154):
        img.putpixel((x, y), note_color)
# Note head (ellipse)
draw.ellipse([120, 148, 155, 175], fill=note_color)
# Flag
for y in range(60, 100):
    x_start = 154
    x_end = 154 + int((100 - y) * 0.4)
    for x in range(x_start, min(x_end, size)):
        img.putpixel((x, y), note_color)

# Save as ICO
img.save(r'D:\IANMUSICD\melodix\src-tauri\icons\icon.ico', format='ICO', sizes=[(256, 256)])

# Also save PNG versions
img.save(r'D:\IANMUSICD\melodix\src-tauri\icons\32x32.png', format='PNG')
img.resize((128, 128), Image.LANCZOS).save(r'D:\IANMUSICD\melodix\src-tauri\icons\128x128.png', format='PNG')
img.save(r'D:\IANMUSICD\melodix\src-tauri\icons\128x128@2x.png', format='PNG')

print("Icons generated successfully!")
