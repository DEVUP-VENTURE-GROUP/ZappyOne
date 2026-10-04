import sys
from PIL import Image

def remove_white_bg(input_path, output_path):
    try:
        # Open image and convert to RGBA
        img = Image.open(input_path).convert("RGBA")
        datas = img.getdata()

        new_data = []
        for item in datas:
            # Change all white (also shades of whites)
            # to transparent. 
            # Looking at standard jpeg artifacts, anything above 230,230,230 is white background.
            if item[0] > 230 and item[1] > 230 and item[2] > 230:
                new_data.append((255, 255, 255, 0))
            else:
                new_data.append(item)

        img.putdata(new_data)
        img.save(output_path, "PNG")
        print(f"Successfully saved transparent logo to {output_path}")
    except Exception as e:
        print(f"Error processing image: {e}")

if __name__ == "__main__":
    if len(sys.argv) != 3:
        print("Usage: python script.py <input.jpg> <output.png>")
        sys.exit(1)
    remove_white_bg(sys.argv[1], sys.argv[2])
