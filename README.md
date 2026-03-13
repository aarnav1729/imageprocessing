# PanelGuard — Solar Installation Fraud Detection

## Setup

```bash
# Copy these files into your 0001/ project folder alongside the existing assets/ directory
# Your folder should look like:
#
# 0001/
# ├── package.json
# ├── server.js
# ├── public/
# │   └── index.html
# ├── assets/          ← your existing images by application number
# └── uploads/         ← created automatically

# Install dependencies
npm install

# Start the server
npm start
# or for auto-reload during dev:
npm run dev

# Open browser
# http://localhost:3000
```

## How It Works

### 1. Upload Sanctions
- Go to **Sanctions** tab
- Drop your `sanction1.xlsx`, `sanction234.xlsx` etc.
- The sanction name is extracted from the filename
- Excel rows with **red** cell fill = mismatch, **green** = match
- The `Remarks` column text ("lat long mismatch") is also parsed
- Images in `assets/` are auto-linked to each application by application number

### 2. View Applications
- Go to **Applications** tab
- Full table with color-coded rows (red = mismatch, green = match)
- Filter by sanction, status (match/mismatch), fraud status
- Search by beneficiary name, application number, or remarks
- Click camera icon to view all images for an application

### 3. Detect Fraud
- Go to **Fraud Detection** tab
- Select a sanction from dropdown
- Click **Run Fraud Detection**
- OpenCV.js runs in-browser:
  - Masks center of each photo (panels + people)
  - Extracts ORB features from peripheral ring only (background)
  - Cross-matches images from **different** applications only
  - Uses strict homography verification (10+ inliers, 35%+ ratio, spatial spread check)
  - Only flags geometrically consistent background matches
- Results show side-by-side image pairs
- Mark each flag as **Fraud** / **Clear** / **Reset**
- All markings saved to MongoDB

### 4. Asset Folder Structure
Images should be in `assets/` folder. Supported patterns:
- `assets/18701457279000.jpg` — single image per application
- `assets/18701457279000/` — folder with multiple images
- `assets/18701457279000_1.jpg` — prefixed files

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/upload-sanction | Upload Excel file |
| GET | /api/sanctions | List all sanctions |
| DELETE | /api/sanctions/:id | Delete sanction |
| GET | /api/applications | List applications (filterable) |
| PATCH | /api/applications/:id | Update application |
| GET | /api/images/:appNo | Get images for application |
| POST | /api/fraud-flags | Save fraud flags |
| GET | /api/fraud-flags | List fraud flags |
| PATCH | /api/fraud-flags/:id | Mark fraud flag |
| GET | /api/stats | Dashboard statistics |

## Tech Stack
- **Backend**: Express.js, MongoDB (Mongoose), ExcelJS, Multer
- **Frontend**: Vanilla JS SPA, OpenCV.js (browser-side)
- **DB**: MongoDB Atlas