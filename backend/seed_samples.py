import cv2
import numpy as np
from pathlib import Path
from backend.config import Config
from backend.services.image_processing import analyze_image

def generate_sample_river_image(filename, water_height_ratio=0.35, draw_gauge=True, water_color=(185, 130, 45), sky_cloudy=False):
    """
    Generates a realistic synthetic river scene for computer vision validation:
    - Graded sky & mountain horizon
    - Natural riverbanks with terrain/vegetation textures
    - Flowing river surface with specularity and ripples
    - Calibrated vertical river gauge staff with metric graduation marks
    """
    w, h = 960, 640
    img = np.zeros((h, w, 3), dtype=np.uint8)
    water_top_y = int(h * (1.0 - water_height_ratio))
    
    # 1. Sky gradient
    sky_h = min(water_top_y, int(h * 0.42))
    for y in range(sky_h):
        factor = y / max(1, sky_h)
        if sky_cloudy:
            r = int(110 + 35 * factor)
            g = int(120 + 35 * factor)
            b = int(130 + 35 * factor)
        else:
            r = int(75 + 90 * factor)
            g = int(135 + 55 * factor)
            b = int(210 + 35 * factor)
        img[y, :] = (b, g, r) # BGR
        
    # 2. Far riverbank & hills silhouette
    hill_top = max(10, water_top_y - 40)
    pts_hills = np.array([
        [0, hill_top + 20], [180, hill_top], [340, hill_top + 15],
        [520, hill_top - 5], [740, hill_top + 10], [960, hill_top + 25],
        [960, sky_h + 30], [0, sky_h + 30]
    ], np.int32)
    cv2.fillPoly(img, [pts_hills], (45, 75, 45))
    
    # 3. Rocky / earthy riverbanks submerged according to water level
    bank_h = max(20, min(water_top_y, int(h * 0.40)))
    pts_left_bank = np.array([
        [0, bank_h], [int(w * 0.22), water_top_y], [0, h]
    ], np.int32)
    cv2.fillPoly(img, [pts_left_bank], (60, 85, 110))
    
    pts_right_bank = np.array([
        [w, bank_h], [int(w * 0.78), water_top_y], [w, h]
    ], np.int32)
    cv2.fillPoly(img, [pts_right_bank], (55, 80, 105))
    
    # Bank texture noise
    noise = np.random.randint(-12, 12, (h, w, 3)).astype(np.int16)
    img_textured = np.clip(img.astype(np.int16) + noise, 0, 255).astype(np.uint8)
    img[:] = img_textured[:]
    
    # 4. River water surface (from water_top_y down to h)
    for y in range(water_top_y, h):
        depth_factor = (y - water_top_y) / max(1, (h - water_top_y))
        b = int(water_color[0] + 25 * depth_factor)
        g = int(water_color[1] + 18 * depth_factor)
        r = int(water_color[2] + 12 * depth_factor)
        img[y, :] = (min(255, b), min(255, g), min(255, r))
        
    # Add subtle water surface ripples
    for y in range(water_top_y + 10, h, 8):
        wave_shift = int(np.sin(y * 0.08) * 6)
        cv2.line(img, (int(w * 0.15) + wave_shift, y), (int(w * 0.85) + wave_shift, y), 
                 (min(255, water_color[0] + 35), min(255, water_color[1] + 30), min(255, water_color[2] + 25)), 1)
                 
    # 5. Vertical calibrated staff gauge if requested
    if draw_gauge:
        gx, gw = 700, 26
        gy_top = int(h * 0.10) # gauge top high on bank
        gy_bot = int(h * 0.94) # gauge bottom anchored deep
        gh = gy_bot - gy_top
        
        # Staff gauge background
        cv2.rectangle(img, (gx, gy_top), (gx + gw, gy_bot), (235, 240, 245), -1)
        cv2.rectangle(img, (gx, gy_top), (gx + gw, gy_bot), (20, 20, 20), 2)
        
        # Metric graduation tick marks
        num_ticks = 25
        tick_step = gh / num_ticks
        for i in range(num_ticks + 1):
            ty = int(gy_top + i * tick_step)
            tick_w = gw if (i % 5 == 0) else gw // 2
            cv2.line(img, (gx, ty), (gx + tick_w, ty), (15, 15, 15), 2 if (i % 5 == 0) else 1)
            if i % 5 == 0 and ty <= water_top_y:
                m_mark = round(5.0 - (i / num_ticks * 5.0), 1)
                cv2.putText(img, f"{m_mark}m", (gx - 34, ty + 4), cv2.FONT_HERSHEY_SIMPLEX, 0.35, (245, 245, 245), 1)

    # Save to uploads
    Config.UPLOAD_FOLDER.mkdir(parents=True, exist_ok=True)
    out_path = Config.UPLOAD_FOLDER / filename
    cv2.imwrite(str(out_path), img)
    return out_path

def create_all_samples():
    print("Generating comprehensive sample dataset for RiverGuard AI...")
    # Sample 1: SAFE / Normal Water Level (GREEN) ~1.8m
    img1 = generate_sample_river_image(
        "sample_river_normal_safe.jpg",
        water_height_ratio=0.35,
        draw_gauge=True,
        water_color=(190, 140, 40)
    )
    res1 = analyze_image(img1)
    print(f"Sample 1 (SAFE): Level={res1.get('water_level')}m, Risk={res1.get('risk_level')} ({res1.get('status_color')}), Conf={res1.get('confidence')}%")

    # Sample 2: WATCH Condition (YELLOW) ~2.4m
    img2 = generate_sample_river_image(
        "sample_river_watch.jpg",
        water_height_ratio=0.48,
        draw_gauge=True,
        water_color=(160, 130, 60)
    )
    res2 = analyze_image(img2)
    print(f"Sample 2 (WATCH): Level={res2.get('water_level')}m, Risk={res2.get('risk_level')} ({res2.get('status_color')}), Conf={res2.get('confidence')}%")

    # Sample 3: WARNING Condition (ORANGE) ~3.9m
    img3 = generate_sample_river_image(
        "sample_river_warning.jpg",
        water_height_ratio=0.70,
        draw_gauge=True,
        water_color=(125, 115, 80),
        sky_cloudy=True
    )
    res3 = analyze_image(img3)
    print(f"Sample 3 (WARNING): Level={res3.get('water_level')}m, Risk={res3.get('risk_level')} ({res3.get('status_color')}), Conf={res3.get('confidence')}%")

    # Sample 4: EMERGENCY Condition (RED) ~4.9m - critical flood
    img4 = generate_sample_river_image(
        "sample_river_flood_emergency.jpg",
        water_height_ratio=0.92,
        draw_gauge=True,
        water_color=(95, 90, 80),
        sky_cloudy=True
    )
    res4 = analyze_image(img4)
    print(f"Sample 4 (EMERGENCY): Level={res4.get('water_level')}m, Risk={res4.get('risk_level')} ({res4.get('status_color')}), Conf={res4.get('confidence')}%")

    # Sample 5: Uncalibrated River (NO GAUGE) -> CALIBRATION REQUIRED
    img5 = generate_sample_river_image(
        "sample_river_uncalibrated_nogauge.jpg",
        water_height_ratio=0.40,
        draw_gauge=False,
        water_color=(185, 145, 50)
    )
    res5 = analyze_image(img5)
    print(f"Sample 5 (UNCALIBRATED): Level={res5.get('water_level')}, CalibRequired={res5.get('calibration_required')}, Status={res5.get('status_title')}")

if __name__ == '__main__':
    create_all_samples()
