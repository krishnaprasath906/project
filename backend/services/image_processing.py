import os
import cv2
import numpy as np
from PIL import Image
from datetime import datetime
from pathlib import Path
from backend.config import Config
from backend.services.water_level import detect_reference_marker, calculate_water_level
from backend.services.flood_detection import classify_flood_risk

def hex_to_bgr(hex_str):
    hex_str = hex_str.lstrip('#')
    rgb = tuple(int(hex_str[i:i+2], 16) for i in (0, 2, 4))
    return (rgb[2], rgb[1], rgb[0])

def validate_image(file_path):
    """
    Validates the uploaded image before image processing:
    - File existence and size (<= 16MB)
    - File extension and integrity
    - Image dimensions and readability
    - Exposure and blur evaluation
    
    Returns: (is_valid: bool, reason: str, metadata: dict)
    """
    p = Path(file_path)
    if not p.exists():
        return False, "File does not exist on storage.", {}
        
    file_size_bytes = p.stat().st_size
    if file_size_bytes == 0:
        return False, "Uploaded file is 0 bytes (empty file).", {}
        
    if file_size_bytes > Config.MAX_CONTENT_LENGTH:
        return False, f"File size exceeds maximum threshold of {Config.MAX_CONTENT_LENGTH / (1024*1024):.0f}MB.", {}

    ext = p.suffix.lower().lstrip('.')
    if ext not in Config.ALLOWED_EXTENSIONS:
        return False, f"Unsupported file format '.{ext}'. Allowed formats: JPG, JPEG, PNG.", {}

    # Verify PIL readability & corrupt header
    try:
        with Image.open(file_path) as img:
            img.verify()
    except Exception as e:
        return False, f"Corrupted image header or unreadable data: {str(e)}", {}

    # Read with OpenCV
    img_bgr = cv2.imread(str(file_path))
    if img_bgr is None:
        return False, "OpenCV was unable to decode the image matrix.", {}

    h, w = img_bgr.shape[:2]
    if w < 240 or h < 180:
        return False, f"Image resolution too low ({w}x{h}). Minimum required is 240x180 pixels.", {}

    # Check for extreme under/over exposure
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    mean_brightness = float(np.mean(gray))
    if mean_brightness < 12.0:
        return False, f"Image is extremely underexposed/dark (brightness: {mean_brightness:.1f}/255). Water features indistinguishable.", {}
    if mean_brightness > 248.0:
        return False, f"Image is completely overexposed/washed out (brightness: {mean_brightness:.1f}/255).", {}

    # Blur evaluation using Laplacian variance
    laplacian_var = float(cv2.Laplacian(gray, cv2.CV_64F).var())
    is_blurry = laplacian_var < 20.0

    metadata = {
        'width': w,
        'height': h,
        'channels': img_bgr.shape[2] if len(img_bgr.shape) > 2 else 1,
        'file_size_kb': round(file_size_bytes / 1024, 1),
        'mean_brightness': round(mean_brightness, 1),
        'sharpness_variance': round(laplacian_var, 1),
        'is_blurry': is_blurry,
        'format': ext.upper()
    }

    if is_blurry and laplacian_var < 8.0:
        return False, f"Image is excessively blurry (sharpness score: {laplacian_var:.1f}). Sharp edges cannot be extracted.", metadata

    return True, "Image verified and valid for computer vision pipeline.", metadata

def check_image_quality(img_bgr):
    """Calculates detailed quality scores for evidence-based confidence."""
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    h, w = gray.shape
    
    # 1. Sharpness score (Laplacian variance normalized 0 - 100)
    lap_var = cv2.Laplacian(gray, cv2.CV_64F).var()
    sharpness_score = min(100.0, (lap_var / 250.0) * 100.0)
    
    # 2. Lighting & contrast score
    mean_val = np.mean(gray)
    std_val = np.std(gray)
    # Optimum lighting around 90-160, good contrast std > 40
    lighting_balance = 100.0 - (abs(mean_val - 128.0) / 128.0 * 50.0)
    contrast_score = min(100.0, (std_val / 60.0) * 100.0)
    
    # 3. Overall quality index
    quality_score = (sharpness_score * 0.4) + (lighting_balance * 0.3) + (contrast_score * 0.3)
    
    return {
        'quality_score': round(quality_score, 1),
        'sharpness_score': round(sharpness_score, 1),
        'lighting_score': round(lighting_balance, 1),
        'contrast_score': round(contrast_score, 1),
        'laplacian_var': round(lap_var, 1)
    }

def preprocess_image(img_bgr, max_width=1280):
    """Resizes while preserving aspect ratio and generates multi-space representations."""
    h, w = img_bgr.shape[:2]
    scale = 1.0
    if w > max_width:
        scale = max_width / float(w)
        new_w = max_width
        new_h = int(h * scale)
        resized = cv2.resize(img_bgr, (new_w, new_h), interpolation=cv2.INTER_AREA)
    else:
        resized = img_bgr.copy()
        
    # Gaussian blur to suppress noise and fine surface ripples
    blurred = cv2.GaussianBlur(resized, (5, 5), 0)
    
    # Multi-color spaces
    hsv = cv2.cvtColor(blurred, cv2.COLOR_BGR2HSV)
    lab = cv2.cvtColor(blurred, cv2.COLOR_BGR2LAB)
    gray = cv2.cvtColor(blurred, cv2.COLOR_BGR2GRAY)
    
    return {
        'original': img_bgr,
        'resized': resized,
        'blurred': blurred,
        'hsv': hsv,
        'lab': lab,
        'gray': gray,
        'scale': scale,
        'width': resized.shape[1],
        'height': resized.shape[0]
    }

def verify_river_scene(img_bgr, prep_data):
    """
    Rigorously verifies whether an uploaded image contains a legitimate outdoor river,
    canal reach, or hydrological monitoring scene, actively rejecting non-water images
    such as documents, invoices, human portraits, selfies, vehicles, asphalt highways,
    indoor furniture/rooms, and synthetic screenshots.
    
    Returns: (is_river: bool, message: str, details: dict)
    """
    h, w = prep_data['height'], prep_data['width']
    total_px = h * w
    gray = prep_data['gray']
    hsv = prep_data['hsv']
    lab = prep_data['lab']
    
    b, g, r = prep_data['resized'][:, :, 0], prep_data['resized'][:, :, 1], prep_data['resized'][:, :, 2]
    s, v = hsv[:, :, 1], hsv[:, :, 2]
    
    # 1. Document / Scanned Text / Paper / High-Whiteness Rejection
    white_px = np.sum((r > 218) & (g > 218) & (b > 218))
    if (white_px / total_px) > 0.40:
        return False, 'NON-RIVER IMAGE DETECTED: Document, invoice, scanned paper, or predominantly white graphic identified. RiverGuard AI requires a real-world river monitoring photograph.', {'rejection_reason': 'document_or_high_whiteness'}

    # 2. Road / Asphalt Surface Rejection (Dark neutral gray pavement in lower reach)
    asphalt_mask = (s < 18) & (v > 20) & (v < 100) & (np.abs(r.astype(int) - b.astype(int)) < 12) & (np.abs(g.astype(int) - b.astype(int)) < 12)
    lower_asphalt = float(np.sum(asphalt_mask[int(h*0.50):, :])) / (total_px * 0.50)
    if lower_asphalt > 0.65:
        return False, 'NON-RIVER IMAGE DETECTED: Paved roadway or dry asphalt surface detected without open water.', {'rejection_reason': 'paved_road_surface'}

    # 3. Indoor Room / Furniture / Architecture Rejection (Vertical lines dominate)
    sobel_x = np.abs(cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3))
    sobel_y = np.abs(cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3))
    mean_sx = float(np.mean(sobel_x))
    mean_sy = float(np.mean(sobel_y))
    if mean_sx > 16.0 and (mean_sy / (mean_sx + 1e-5)) < 0.50:
        return False, 'NON-RIVER IMAGE DETECTED: Indoor room, furniture, or architectural interior detected. RiverGuard AI requires an outdoor river monitoring reach.', {'rejection_reason': 'indoor_architecture'}

    # 4. Human Portrait / Selfie Rejection (Genuine skin has red substantially dominating green and blue)
    skin_mask = (r > 95) & (g > 40) & (b > 20) & ((r.astype(int) - g.astype(int)) >= 38) & ((r.astype(int) - b.astype(int)) >= 48) & (s >= 30)
    lower_skin_ratio = float(np.sum(skin_mask[int(h*0.25):, :])) / (total_px * 0.75)
    if lower_skin_ratio > 0.22:
        return False, f'NON-RIVER IMAGE DETECTED: Human portrait or personal photograph detected ({lower_skin_ratio*100:.1f}% skin tones). RiverGuard AI requires an open river or flood monitoring scene.', {'rejection_reason': 'human_portrait'}

    # 5. Multi-Spectral River Water Detection
    # Type A: Blue / Cyan / Sky-reflecting water
    mask_blue = (hsv[:, :, 0] >= 75) & (hsv[:, :, 0] <= 140) & (s >= 18) & (v >= 25) & (b.astype(int) >= r.astype(int) - 20)
    
    # Type B: Green / Algal river water (excluding intense foliage)
    mask_green = (hsv[:, :, 0] >= 25) & (hsv[:, :, 0] < 75) & (s >= 16) & (v >= 25) & ((g.astype(int) - b.astype(int)) <= 40)
    
    # Type C: Muddy / Silt alluvial / sunset warm reflection river water (r and g close, r - g <= 30)
    mask_muddy = (hsv[:, :, 0] >= 5) & (hsv[:, :, 0] < 35) & (s >= 18) & (s <= 240) & (v >= 25) & ((r.astype(int) - g.astype(int)) <= 30)
    
    # Exclude foliage
    is_foliage = (g > b + 25) & (g > r + 15) & (s > 45)
    base_water = (mask_blue | mask_green | mask_muddy) & (~is_foliage)
    
    # Surface specularity constrained to near color-verified water
    dilated_water_seed = cv2.dilate(base_water.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_RECT, (21, 21))) > 0
    mask_specular = (s < 55) & (v >= 50) & (v <= 235) & (lab[:, :, 2] >= 110) & dilated_water_seed
    
    water_all = (base_water | mask_specular)
    y_idx = np.arange(h)[:, None]
    is_sky = (y_idx < int(h * 0.38)) & (((b > 175) & (b > r + 35)) | (v > 230))
    water_all[is_sky] = False
    
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (7, 5))
    clean_mask = cv2.morphologyEx(water_all.astype(np.uint8)*255, cv2.MORPH_OPEN, kernel)
    
    num_labels, labels, stats, _ = cv2.connectedComponentsWithStats(clean_mask, connectivity=8)
    best_area = 0
    for lbl in range(1, num_labels):
        area = stats[lbl, cv2.CC_STAT_AREA]
        top = stats[lbl, cv2.CC_STAT_TOP]
        bottom = top + stats[lbl, cv2.CC_STAT_HEIGHT]
        if bottom >= int(h * 0.55) and area > (total_px * 0.08):
            if area > best_area:
                best_area = area
                
    if best_area == 0:
        return False, 'NON-RIVER IMAGE DETECTED: No contiguous river water surface or waterline detected in monitoring reach. Please upload a verified river image.', {'rejection_reason': 'no_water_surface'}
        
    water_ratio = best_area / total_px
    if water_ratio < 0.10:
        return False, f'NON-RIVER IMAGE DETECTED: Water surface coverage insufficient ({water_ratio*100:.1f}%). Minimum 10% required.', {'rejection_reason': 'insufficient_water_coverage'}
        
    return True, f'Valid river scene confirmed. Water coverage: {water_ratio*100:.1f}%', {'water_area_ratio': round(water_ratio, 4)}

def detect_water_region(prep_data):
    """
    Performs multi-color space segmentation to identify river water surfaces:
    - HSV color thresholding (water tones: blue, cyan, murky greenish-brown, grey-blue)
    - LAB color space lightness & color difference
    - Texture filtering (water surfaces generally have lower local gradient variance than rocky riverbanks or tree canopy)
    - Morphological opening and closing
    """
    hsv = prep_data['hsv']
    lab = prep_data['lab']
    gray = prep_data['gray']
    h, w = prep_data['height'], prep_data['width']
    
    # Range 1: Clear / Blue / Cyan water
    lower_blue = np.array([75, 25, 40])
    upper_blue = np.array([135, 255, 245])
    mask_blue = cv2.inRange(hsv, lower_blue, upper_blue)
    
    # Range 2: River green / murky sediment / natural river water
    lower_green_brown = np.array([20, 20, 25])
    upper_green_brown = np.array([75, 240, 240])
    mask_green_brown = cv2.inRange(hsv, lower_green_brown, upper_green_brown)
    
    # Range 2b: Alluvial / silt / sunset river reflections (warm natural water tones)
    b_ch = prep_data['resized'][:, :, 0]
    g_ch = prep_data['resized'][:, :, 1]
    r_ch = prep_data['resized'][:, :, 2]
    lower_alluvial = np.array([5, 18, 20])
    upper_alluvial = np.array([35, 240, 240])
    mask_alluvial = cv2.inRange(hsv, lower_alluvial, upper_alluvial)
    mask_alluvial[(r_ch.astype(int) - g_ch.astype(int)) > 30] = 0
    
    # Range 3: Natural river surface specularity (moderate lightness, but constrained chromaticity)
    s_channel = hsv[:, :, 1]
    v_channel = hsv[:, :, 2]
    l_channel = lab[:, :, 0]
    b_channel = lab[:, :, 2]
    
    # Specular water surface (excludes atmospheric sky which has very low b* and high L)
    mask_specular = ((s_channel < 55) & (v_channel > 50) & (v_channel < 235) & (b_channel >= 110)).astype(np.uint8) * 255
    
    # Natural river water color balance:
    # 1. Vegetation foliage has green significantly higher than blue and red
    is_vegetation = (g_ch > b_ch + 20) & (g_ch > r_ch + 15) & (s_channel > 40)
    
    # 2. Atmospheric sky filter (upper 45% of image with very low saturation or bright sky)
    y_indices = np.arange(h)[:, None]
    is_upper_sky = (y_indices < int(h * 0.38)) & (
        ((b_ch > 175) & (b_ch > r_ch + 35)) | # blue atmospheric sky
        ((l_channel > 180) & (s_channel < 25)) # high-altitude clouds
    )
    
    # Texture analysis: River water has relatively low variance
    sobel_x = cv2.Sobel(gray, cv2.CV_64F, 1, 0, ksize=3)
    sobel_y = cv2.Sobel(gray, cv2.CV_64F, 0, 1, ksize=3)
    grad_mag = np.sqrt(sobel_x**2 + sobel_y**2)
    smooth_texture_mask = (grad_mag < 55).astype(np.uint8) * 255
    
    # Structural horizon edge barrier: Canny edges from terrain/banks prevent water from leaking into sky
    canny_edges = cv2.Canny(gray, 35, 110)
    kernel_edge = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 3))
    dilated_edges = cv2.dilate(canny_edges, kernel_edge, iterations=1)
    
    # Combine water candidate masks
    combined_color_mask = cv2.bitwise_or(mask_blue, cv2.bitwise_or(mask_green_brown, mask_alluvial))
    water_candidate = cv2.bitwise_or(combined_color_mask, mask_specular)
    
    # Exclude vegetation and atmospheric sky
    water_candidate[is_vegetation] = 0
    water_candidate[is_upper_sky] = 0
    
    # Apply texture smoothness and subtract prominent terrain boundary edges
    filtered_candidate = cv2.bitwise_and(water_candidate, smooth_texture_mask)
    filtered_candidate[dilated_edges > 0] = 0
    
    # Morphological processing:
    # 1. Opening to remove small noise specks
    kernel_open = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    opened = cv2.morphologyEx(filtered_candidate, cv2.MORPH_OPEN, kernel_open)
    
    # 2. Closing with horizontal bias
    kernel_close = cv2.getStructuringElement(cv2.MORPH_RECT, (17, 7))
    closed = cv2.morphologyEx(opened, cv2.MORPH_CLOSE, kernel_close)
    
    # In open river scenes, water flows predominantly in ground plane, but floods can rise high
    y_weights = np.linspace(0.55, 1.0, h)[:, None]
    weighted_mask = (closed.astype(np.float32) / 255.0) * y_weights
    final_water_mask = (weighted_mask > 0.28).astype(np.uint8) * 255
    
    # Filter connected components: A river body must occupy the ground/lower plane (extend past 50% height)
    num_labels, labels, stats, centroids = cv2.connectedComponentsWithStats(closed, connectivity=8)
    
    water_mask = np.zeros((h, w), dtype=np.uint8)
    largest_area = 0
    best_label = 0
    
    for label in range(1, num_labels):
        area = stats[label, cv2.CC_STAT_AREA]
        top = stats[label, cv2.CC_STAT_TOP]
        height_span = stats[label, cv2.CC_STAT_HEIGHT]
        bottom = top + height_span
        
        # River water surface must extend into the lower region (bottom >= h * 0.55)
        # Excludes sky/clouds that are confined to the upper horizon
        if bottom >= int(h * 0.55) and area > (w * h * 0.05):
            if area > largest_area:
                largest_area = area
                best_label = label
                
    if best_label > 0:
        water_mask[labels == best_label] = 255
    else:
        # Strict anti-hallucination: No blind floodfill fallback on non-water scenes!
        water_mask = np.zeros((h, w), dtype=np.uint8)
        largest_area = 0

    area_ratio = float(largest_area) / float(w * h)
    
    return {
        'mask': water_mask,
        'area_pixels': int(largest_area),
        'area_ratio': round(area_ratio, 4),
        'water_detected': bool(area_ratio >= 0.08)
    }

def detect_waterline(water_mask, prep_data):
    """
    Identifies the boundary waterline separating the water surface from riverbanks/terrain:
    - Analyzes the upper boundary profile across image width
    - Fits horizontal/polynomial trendline
    - Calculates waterline Y-coordinate and clarity score
    """
    h, w = prep_data['height'], prep_data['width']
    gray = prep_data['gray']
    
    # Find contour of the water mask
    contours, _ = cv2.findContours(water_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours:
        return {
            'detected': False,
            'waterline_y': None,
            'waterline_x': None,
            'points': [],
            'clarity_score': 0.0,
            'reason': 'No contiguous water region contour extracted.'
        }
        
    main_contour = max(contours, key=cv2.contourArea)
    
    # Sample top boundary across horizontal slices
    # For each X column (with step), find the minimum Y (highest point) where water mask is active
    step = max(2, w // 80)
    top_points = []
    
    for x in range(0, w, step):
        col = np.where(water_mask[:, x] > 0)[0]
        if len(col) > 0:
            top_y = col[0]
            # Verify not top edge of image
            if top_y > (h * 0.05):
                top_points.append((x, int(top_y)))
                
    if len(top_points) < 8:
        return {
            'detected': False,
            'waterline_y': None,
            'waterline_x': None,
            'points': [],
            'clarity_score': 0.0,
            'reason': 'Waterline boundary does not span across sufficient horizontal channel reach.'
        }
        
    xs = np.array([p[0] for p in top_points])
    ys = np.array([p[1] for p in top_points])
    
    if (np.max(xs) - np.min(xs)) < (w * 0.20):
        return {
            'detected': False,
            'waterline_y': None,
            'waterline_x': None,
            'points': [],
            'clarity_score': 0.0,
            'reason': 'Waterline width span is too narrow to confirm a natural river channel.'
        }
        
    # Remove outlier spikes using median absolute deviation
    median_y = np.median(ys)
    mad = np.median(np.abs(ys - median_y))
    valid_idx = np.abs(ys - median_y) <= max(25, 2.5 * mad)
    
    if np.sum(valid_idx) >= 5:
        xs_clean = xs[valid_idx]
        ys_clean = ys[valid_idx]
    else:
        xs_clean, ys_clean = xs, ys
        
    # Fit a 1st or 2nd order polynomial across river width
    poly = np.polyfit(xs_clean, ys_clean, 1)
    waterline_y = int(np.mean(ys_clean))
    
    # Generate smooth points for drawing
    fit_xs = np.linspace(0, w - 1, 60)
    fit_ys = np.polyval(poly, fit_xs)
    points = [(int(fx), int(np.clip(fy, 5, h - 5))) for fx, fy in zip(fit_xs, fit_ys)]
    
    # Calculate waterline gradient clarity (edge sharpness along waterline)
    edge_magnitudes = []
    for fx, fy in points:
        if 5 <= fy < h - 5 and 5 <= fx < w - 5:
            # Vertical gradient across waterline
            grad_val = abs(int(gray[fy + 3, fx]) - int(gray[fy - 3, fx]))
            edge_magnitudes.append(grad_val)
            
    mean_grad = np.mean(edge_magnitudes) if edge_magnitudes else 15.0
    clarity_score = min(100.0, (mean_grad / 40.0) * 100.0)

    return {
        'detected': True,
        'waterline_y': int(waterline_y),
        'waterline_x': int(w // 2),
        'points': points,
        'clarity_score': round(float(clarity_score), 1),
        'reason': 'Waterline successfully segmented and extracted.'
    }

def calculate_confidence(waterline_data, water_region_data, quality_data, reference_data):
    """
    Evidence-based confidence score calculation (0 - 100%).
    Factors:
    - Waterline boundary clarity (gradient contrast)
    - Water region coverage and compactness
    - Image sharpness and lighting
    - Reference gauge presence and calibration evidence
    """
    if not water_region_data['water_detected']:
        return 12
    if not waterline_data['detected']:
        return 25

    # 1. Waterline clarity (0 - 35 points)
    clarity_pts = (waterline_data.get('clarity_score', 50.0) / 100.0) * 35.0
    
    # 2. Water region consistency (0 - 25 points)
    area_ratio = water_region_data.get('area_ratio', 0.2)
    # Healthy river view has 15% - 75% water area
    if 0.15 <= area_ratio <= 0.80:
        region_pts = 25.0
    else:
        region_pts = 14.0
        
    # 3. Image quality & sharpness (0 - 25 points)
    quality_pts = (quality_data.get('quality_score', 60.0) / 100.0) * 25.0
    
    # 4. Reference marker calibration bonus (0 - 15 points)
    if reference_data.get('detected', False):
        ref_pts = 15.0
    else:
        ref_pts = 4.0  # Uncalibrated baseline
        
    total_confidence = int(np.clip(clarity_pts + region_pts + quality_pts + ref_pts, 20, 99))
    return total_confidence

def create_annotated_image(prep_data, water_mask, waterline_data, reference_data, risk_data, water_level_info, confidence):
    """
    Generates a futuristic, professional AI computer vision annotated image:
    - Translucent cyan water mask tint
    - Sharp waterline rendered in the exact status color (GREEN for safe, YELLOW for watch, ORANGE for warning, RED for emergency)
    - HUD gauge reference marker bounding box with sci-fi bracket corners
    - Futuristic Top HUD banner with CV Engine status, resolution, and time
    - Futuristic Bottom HUD panel with Waterline Y, Water Level, Confidence, and Status Badge
    """
    img = prep_data['resized'].copy()
    h, w = img.shape[:2]
    
    # Status color in BGR
    status_hex = risk_data['status_color']
    status_bgr = hex_to_bgr(status_hex)
    cyan_bgr = (216, 180, 0)      # #00B4D8 in BGR
    dark_bgr = (31, 17, 7)        # #07111F in BGR
    
    # 1. Translucent water region tint
    if water_mask is not None and np.sum(water_mask) > 0:
        water_tint = np.zeros_like(img)
        # Tint with calm cyan/blue hue
        water_tint[water_mask > 0] = (200, 140, 20)  # Calm blue-cyan
        cv2.addWeighted(water_tint, 0.28, img, 1.0, 0, img)
        
        # Subtle water region boundary line
        contours, _ = cv2.findContours(water_mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        cv2.drawContours(img, contours, -1, (220, 180, 40), 1, cv2.LINE_AA)

    # 2. Draw Detected Waterline
    if waterline_data.get('detected') and len(waterline_data.get('points', [])) > 1:
        points = waterline_data['points']
        pts_np = np.array(points, dtype=np.int32).reshape((-1, 1, 2))
        
        # Glowing effect: thick translucent line underneath
        glow_layer = img.copy()
        cv2.polylines(glow_layer, [pts_np], isClosed=False, color=status_bgr, thickness=8, lineType=cv2.LINE_AA)
        cv2.addWeighted(glow_layer, 0.45, img, 0.55, 0, img)
        
        # Sharp primary waterline
        cv2.polylines(img, [pts_np], isClosed=False, color=status_bgr, thickness=3, lineType=cv2.LINE_AA)
        
        # Waterline text badge
        wl_txt = f"WATERLINE (Y: {waterline_data['waterline_y']}px)"
        (tw_wl, th_wl), _ = cv2.getTextSize(wl_txt, cv2.FONT_HERSHEY_SIMPLEX, 0.40, 1)
        label_x = max(14, min(w - tw_wl - 16, points[len(points)//2][0] - tw_wl // 2))
        label_y = max(th_wl + 14, points[len(points)//2][1] - 12)
        
        cv2.rectangle(img, (label_x - 6, label_y - th_wl - 6), (label_x + tw_wl + 6, label_y + 6), (15, 15, 15), -1)
        cv2.rectangle(img, (label_x - 6, label_y - th_wl - 6), (label_x + tw_wl + 6, label_y + 6), status_bgr, 1)
        cv2.putText(img, wl_txt, (label_x, label_y), cv2.FONT_HERSHEY_SIMPLEX, 0.40, (255, 255, 255), 1, cv2.LINE_AA)

    # 3. Draw Reference Marker / Gauge if detected
    if reference_data.get('detected') and reference_data.get('bbox'):
        rx, ry, rw, rh = reference_data['bbox']
        bracket_len = min(15, rw // 2, rh // 4)
        cv2.rectangle(img, (rx, ry), (rx + rw, ry + rh), cyan_bgr, 1, cv2.LINE_AA)
        
        cv2.line(img, (rx, ry), (rx + bracket_len, ry), cyan_bgr, 3)
        cv2.line(img, (rx, ry), (rx, ry + bracket_len), cyan_bgr, 3)
        cv2.line(img, (rx + rw, ry), (rx + rw - bracket_len, ry), cyan_bgr, 3)
        cv2.line(img, (rx + rw, ry), (rx + rw, ry + bracket_len), cyan_bgr, 3)
        cv2.line(img, (rx, ry + rh), (rx + bracket_len, ry + rh), cyan_bgr, 3)
        cv2.line(img, (rx, ry + rh), (rx, ry + rh - bracket_len), cyan_bgr, 3)
        cv2.line(img, (rx + rw, ry + rh), (rx + rw - bracket_len, ry + rh), cyan_bgr, 3)
        cv2.line(img, (rx + rw, ry + rh), (rx + rw, ry + rh - bracket_len), cyan_bgr, 3)
        
        ref_label = f"REF: {reference_data.get('type', 'GAUGE')}"
        (tw_ref, th_ref), _ = cv2.getTextSize(ref_label, cv2.FONT_HERSHEY_SIMPLEX, 0.36, 1)
        ref_x = max(6, min(w - tw_ref - 12, rx))
        ref_y = max(th_ref + 8, ry - 8)
        cv2.rectangle(img, (ref_x - 4, ref_y - th_ref - 4), (ref_x + tw_ref + 6, ref_y + 4), (10, 15, 25), -1)
        cv2.rectangle(img, (ref_x - 4, ref_y - th_ref - 4), (ref_x + tw_ref + 6, ref_y + 4), cyan_bgr, 1)
        cv2.putText(img, ref_label, (ref_x, ref_y), cv2.FONT_HERSHEY_SIMPLEX, 0.36, (240, 240, 240), 1, cv2.LINE_AA)

    # 4. Clean Top HUD Banner
    top_hud_h = 32
    hud_overlay = img.copy()
    cv2.rectangle(hud_overlay, (0, 0), (w, top_hud_h), dark_bgr, -1)
    cv2.addWeighted(hud_overlay, 0.88, img, 0.12, 0, img)
    cv2.line(img, (0, top_hud_h), (w, top_hud_h), cyan_bgr, 1)
    
    cv2.putText(img, "RIVERGUARD AI", (14, 21), 
                cv2.FONT_HERSHEY_SIMPLEX, 0.44, cyan_bgr, 1, cv2.LINE_AA)
    
    if w >= 460:
        now_str = datetime.now().strftime('%Y-%m-%d %H:%M:%S UTC')
        info_txt = f"{now_str} | {w}x{h}"
        (tw_info, _), _ = cv2.getTextSize(info_txt, cv2.FONT_HERSHEY_SIMPLEX, 0.35, 1)
        cv2.putText(img, info_txt, (w - tw_info - 14, 21), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.35, (180, 195, 210), 1, cv2.LINE_AA)

    # 5. Clean Bottom HUD Panel (Non-overlapping adaptive layout)
    bot_hud_h = 38
    cv2.rectangle(hud_overlay, (0, h - bot_hud_h), (w, h), dark_bgr, -1)
    cv2.addWeighted(hud_overlay, 0.88, img, 0.12, 0, img)
    cv2.line(img, (0, h - bot_hud_h), (w, h - bot_hud_h), status_bgr, 1)
    
    font_scale = 0.40 if w < 480 else 0.44
    
    # Right element: AI Confidence
    conf_str = f"AI: {confidence}%"
    (tw_conf, _), _ = cv2.getTextSize(conf_str, cv2.FONT_HERSHEY_SIMPLEX, font_scale, 1)
    conf_x = max(w - tw_conf - 14, 10)
    cv2.putText(img, conf_str, (conf_x, h - 14), 
                cv2.FONT_HERSHEY_SIMPLEX, font_scale, (220, 235, 245), 1, cv2.LINE_AA)
                
    # Left element: Status indicator & text
    circle_x = 18
    circle_y = h - 18
    cv2.circle(img, (circle_x, circle_y), 6, status_bgr, -1)
    cv2.circle(img, (circle_x, circle_y), 8, (255, 255, 255), 1)
    
    risk_lvl = risk_data.get('risk_level', 'SAFE')
    if water_level_info.get('water_level') is not None:
        status_text = f"STATUS: {risk_lvl} ({water_level_info['water_level']:.2f}m)"
    else:
        status_text = f"STATUS: {risk_lvl}"
        
    cv2.putText(img, status_text, (32, h - 14), 
                cv2.FONT_HERSHEY_SIMPLEX, font_scale, (255, 255, 255), 1, cv2.LINE_AA)
                
    return img

def analyze_image(image_path, user_id=1, manual_calibration=None):
    """
    Executes the complete RiverGuard AI image processing and flood detection pipeline:
    1. Image Validation
    2. Image Quality Check
    3. Preprocessing (multi-color space conversion)
    4. Water Region Segmentation
    5. Waterline Detection
    6. Reference / Gauge Detection
    7. Water Level Estimation (or CALIBRATION REQUIRED)
    8. Confidence Calculation
    9. Flood Risk Classification
    10. Annotated HUD Image Generation
    11. Database Persistence
    
    Returns: dict of complete analysis results
    """
    # 1. Validation
    is_valid, val_msg, meta = validate_image(image_path)
    if not is_valid:
        return {
            'success': False,
            'error': val_msg,
            'metadata': meta,
            'step': 'IMAGE_VALIDATION_FAILED'
        }
        
    img_bgr = cv2.imread(str(image_path))
    
    # 2. Quality Check
    quality = check_image_quality(img_bgr)
    
    # 3. Preprocessing
    prep = preprocess_image(img_bgr)
    
    # 3b. River Scene Verification (Anti-Hallucination Gate)
    is_river, river_msg, river_meta = verify_river_scene(img_bgr, prep)
    if not is_river:
        return {
            'success': False,
            'error': river_msg,
            'metadata': {**meta, **river_meta},
            'quality': quality,
            'step': 'NON_RIVER_IMAGE_REJECTED'
        }
        
    # 4. Water Region Segmentation
    water_region = detect_water_region(prep)
    if not water_region['water_detected']:
        return {
            'success': False,
            'error': "NON-RIVER IMAGE DETECTED: Continuous water region could not be identified with required certainty. Ensure river surface is visible.",
            'metadata': meta,
            'quality': quality,
            'step': 'WATER_SEGMENTATION_FAILED'
        }
        
    # 5. Waterline Detection
    waterline = detect_waterline(water_region['mask'], prep)
    if not waterline.get('detected'):
        return {
            'success': False,
            'error': f"NON-RIVER IMAGE DETECTED: {waterline.get('reason', 'Waterline boundary could not be traced across river reach.')}",
            'metadata': meta,
            'quality': quality,
            'step': 'WATERLINE_DETECTION_FAILED'
        }
    
    # 6. Reference / Gauge Detection
    reference = detect_reference_marker(prep['resized'])
    
    # 7. Water Level Estimation
    water_level_info = calculate_water_level(
        waterline.get('waterline_y'), 
        prep['height'], 
        reference,
        manual_calibration
    )
    
    # 8. Confidence Score
    confidence = calculate_confidence(waterline, water_region, quality, reference)
    
    # 9. Flood Risk Classification
    risk = classify_flood_risk(
        water_level=water_level_info.get('water_level'),
        calibration_required=water_level_info.get('calibration_required', False),
        relative_fill_ratio=water_region.get('area_ratio')
    )
    
    # 10. Create Annotated Image
    annotated_img = create_annotated_image(
        prep, 
        water_region['mask'], 
        waterline, 
        reference, 
        risk, 
        water_level_info, 
        confidence
    )
    
    # Save Annotated Image
    Config.PROCESSED_FOLDER.mkdir(parents=True, exist_ok=True)
    orig_name = Path(image_path).name
    stem = Path(image_path).stem
    annotated_filename = f"{stem}_annotated_{int(datetime.now().timestamp())}.jpg"
    annotated_rel_path = f"processed/{annotated_filename}"
    annotated_abs_path = Config.PROCESSED_FOLDER / annotated_filename
    cv2.imwrite(str(annotated_abs_path), annotated_img)
    
    return {
        'success': True,
        'original_filename': orig_name,
        'image_path': f"uploads/{orig_name}",
        'annotated_image_path': annotated_rel_path,
        'water_level': water_level_info.get('water_level'),
        'unit': 'm',
        'calibration_required': water_level_info.get('calibration_required', False),
        'waterline_x': waterline.get('waterline_x'),
        'waterline_y': waterline.get('waterline_y'),
        'reference_detected': 1 if reference.get('detected') else 0,
        'reference_type': reference.get('type'),
        'confidence': confidence,
        'risk_level': risk['risk_level'],
        'status_title': risk['status_title'],
        'status_color': risk['status_color'],
        'is_safe': risk['is_safe'],
        'message': risk['message'],
        'recommendation': risk['recommendation'],
        'threshold': risk['threshold'],
        'image_metadata': meta,
        'quality_metrics': quality,
        'created_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    }
