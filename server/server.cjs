const express = require("express");
const https = require("https");
const mongoose = require("mongoose");
const multer = require("multer");
const ExcelJS = require("exceljs");
const path = require("path");
const fs = require("fs");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json({ limit: "50mb" }));

const ROOT_DIR = path.join(__dirname, "..");
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const ASSETS_DIR = path.join(ROOT_DIR, "assets");
const UPLOADS_DIR = path.join(ROOT_DIR, "uploads");
const RECTIFY_DIR = path.join(ROOT_DIR, "rectifications");
const CERTS_DIR = path.join(__dirname, "certs");

const httpsOptions = {
  key: fs.readFileSync(path.join(CERTS_DIR, "mydomain.key")),
  cert: fs.readFileSync(path.join(CERTS_DIR, "d466aacf3db3f299.crt")),
  ca: fs.readFileSync(path.join(CERTS_DIR, "gd_bundle-g2-g1.crt")),
};

app.use(express.static(PUBLIC_DIR));
[ASSETS_DIR, UPLOADS_DIR, RECTIFY_DIR].forEach((d) => {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
});
app.use("/assets", express.static(ASSETS_DIR));
app.use("/rectifications", express.static(RECTIFY_DIR));

const upload = multer({ dest: UPLOADS_DIR });
const rectUpload = multer({
  dest: RECTIFY_DIR,
  limits: { fileSize: 20 * 1024 * 1024 },
});

// ── MongoDB ──
const mongoURI =
  process.env.MONGO_URI ||
  "mongodb+srv://aarnavsingh836:Cucumber1729@rr.oldse8x.mongodb.net/visa?retryWrites=true&w=majority";
mongoose
  .connect(mongoURI)
  .then(async () => {
    console.log("✅ MongoDB connected");
    try {
      await syncAllApplicationFraudStates();
    } catch (error) {
      console.error("❌ Fraud state sync:", error.message);
    }
  })
  .catch((e) => console.error("❌ MongoDB:", e.message));

// ══════════════════════════════════════
//  SCHEMAS
// ══════════════════════════════════════
const sanctionSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  filename: String,
  uploadedAt: { type: Date, default: Date.now },
  totalApplications: { type: Number, default: 0 },
  matchCount: { type: Number, default: 0 },
  mismatchCount: { type: Number, default: 0 },
});

const applicationSchema = new mongoose.Schema({
  sanctionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Sanction",
    index: true,
  },
  sanctionName: String,
  applicationNo: { type: String, index: true },
  beneficiaryName: String,
  refLat: Number,
  refLon: Number,
  installDate: String,
  inspectDate: String,
  complianceDate: String,
  remarks: String,
  rowColorHex: String,
  status: {
    type: String,
    enum: ["match", "mismatch", "unknown"],
    default: "unknown",
  },
  images: [String],
  hasImages: { type: Boolean, default: false },
  inDataset: { type: Boolean, default: true },
  fraudMarked: {
    type: String,
    enum: ["yes", "no", "pending"],
    default: "pending",
  },
});
applicationSchema.index({
  beneficiaryName: "text",
  applicationNo: "text",
  remarks: "text",
});

const fraudFlagSchema = new mongoose.Schema({
  appIdA: String,
  appIdB: String,
  applicationIdA: String,
  applicationIdB: String,
  sanctionA: String,
  sanctionB: String,
  beneficiaryA: String,
  beneficiaryB: String,
  hasSerialA: { type: Boolean, default: false },
  hasSerialB: { type: Boolean, default: false },
  bucket: { type: String, enum: ["serial", "nonserial"], default: "serial" },
  imageA: String,
  imageB: String,
  imageUrlA: String,
  imageUrlB: String,
  gpsA: [Number],
  gpsB: [Number],
  timeA: String,
  timeB: String,
  score: Number,
  inliers: Number,
  goodMatches: Number,
  rawMatches: Number,
  gpsDist: Number,
  gpsClose: Boolean,
  reasons: [String],
  homoValid: Boolean,
  severity: { type: String, enum: ["high", "medium"] },
  markedFraud: {
    type: String,
    enum: ["yes", "no", "pending"],
    default: "pending",
  },
  markedAt: Date,
  createdAt: { type: Date, default: Date.now },
});
fraudFlagSchema.index({ appIdA: 1, appIdB: 1 });

const rectificationSchema = new mongoose.Schema({
  applicationId: { type: mongoose.Schema.Types.ObjectId, ref: "Application" },
  applicationNo: String,
  comment: String,
  attachmentPath: String,
  attachmentName: String,
  submittedAt: { type: Date, default: Date.now },
});

const Sanction = mongoose.model("Sanction", sanctionSchema);
const Application = mongoose.model("Application", applicationSchema);
const FraudFlag = mongoose.model("FraudFlag", fraudFlagSchema);
const Rectification = mongoose.model("Rectification", rectificationSchema);

// ══════════════════════════════════════
//  HELPERS
// ══════════════════════════════════════
function getCellColor(cell) {
  if (!cell || !cell.fill) return null;
  const fill = cell.fill;
  if (fill.type === "pattern" && fill.fgColor) {
    const argb = fill.fgColor.argb;
    if (argb && typeof argb === "string" && argb.length >= 6) {
      const hex = argb.length === 8 ? argb.substring(2) : argb;
      const r = parseInt(hex.substring(0, 2), 16);
      const g = parseInt(hex.substring(2, 4), 16);
      const b = parseInt(hex.substring(4, 6), 16);
      return { r, g, b, hex: "#" + hex };
    }
    if (fill.fgColor.theme !== undefined) {
      const idx = fill.fgColor.indexed;
      if (idx === 10 || idx === 2)
        return { r: 255, g: 0, b: 0, hex: "#FF0000" };
      if (idx === 11 || idx === 3)
        return { r: 0, g: 176, b: 80, hex: "#00B050" };
    }
  }
  return null;
}
function isRedish(c) {
  return c && c.r > 160 && c.g < 140 && c.b < 140;
}
function isGreenish(c) {
  return c && c.g > 130 && c.r < 160 && c.b < 160;
}

function findImagesForApp(appNo) {
  const images = [];
  if (!fs.existsSync(ASSETS_DIR)) return images;
  const appStr = String(appNo).trim();
  const appDir = path.join(ASSETS_DIR, appStr);
  if (fs.existsSync(appDir) && fs.statSync(appDir).isDirectory()) {
    fs.readdirSync(appDir).forEach((f) => {
      if (/\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(f))
        images.push(`${appStr}/${f}`);
    });
  }
  try {
    fs.readdirSync(ASSETS_DIR).forEach((f) => {
      if (
        f.startsWith(appStr) &&
        /\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(f) &&
        !images.includes(f)
      )
        images.push(f);
    });
  } catch (e) {}
  return images;
}

function collectAssetImageEntries() {
  const images = [];
  if (!fs.existsSync(ASSETS_DIR)) return images;

  const walk = (currentDir, prefix = "") => {
    for (const entry of fs.readdirSync(currentDir, { withFileTypes: true })) {
      const relPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const absPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        walk(absPath, relPath);
        continue;
      }
      if (!/\.(jpg|jpeg|png|webp|gif|bmp)$/i.test(entry.name)) continue;
      const parts = relPath.split("/");
      const root = parts[0];
      const filename = parts[parts.length - 1];
      const folderMatch = /^\d+$/.test(root) ? root : null;
      const fileMatch = filename.match(/^(\d{6,})/);
      const serial = folderMatch || (fileMatch ? fileMatch[1] : null);
      images.push({
        path: relPath,
        filename,
        serial,
        hasSerial: Boolean(serial),
      });
    }
  };

  walk(ASSETS_DIR);
  return images;
}

function fmtDate(val) {
  if (!val) return "";
  if (val instanceof Date) {
    const d = val.getDate().toString().padStart(2, "0");
    const m = (val.getMonth() + 1).toString().padStart(2, "0");
    return `${d}-${m}-${val.getFullYear()}`;
  }
  return String(val).trim();
}

function normalizeString(val) {
  if (val === null || val === undefined) return "";
  return String(val).trim();
}

function isObjectIdString(val) {
  return /^[a-f\d]{24}$/i.test(normalizeString(val));
}

function fraudPairKey(flag) {
  const left =
    normalizeString(flag?.applicationIdA) ||
    normalizeString(flag?.appIdA) ||
    normalizeString(flag?.imageA);
  const right =
    normalizeString(flag?.applicationIdB) ||
    normalizeString(flag?.appIdB) ||
    normalizeString(flag?.imageB);
  if (!left || !right) return "";
  return [left, right].sort().join("::");
}

async function resolveFlagApplicationIds(flags) {
  const list = Array.isArray(flags) ? flags : [flags];
  const appNos = [
    ...new Set(
      list
        .flatMap((flag) => {
          const values = [];
          const rawApplicationIdA = normalizeString(flag?.applicationIdA);
          const rawApplicationIdB = normalizeString(flag?.applicationIdB);
          const appIdA = normalizeString(flag?.appIdA);
          const appIdB = normalizeString(flag?.appIdB);

          if (appIdA) values.push(appIdA);
          if (appIdB) values.push(appIdB);
          if (rawApplicationIdA && !isObjectIdString(rawApplicationIdA)) values.push(rawApplicationIdA);
          if (rawApplicationIdB && !isObjectIdString(rawApplicationIdB)) values.push(rawApplicationIdB);
          return values;
        })
        .filter(Boolean)
    ),
  ];

  if (!appNos.length) {
    return list.map((flag) => ({
      flag,
      applicationIdA: isObjectIdString(flag?.applicationIdA) ? normalizeString(flag?.applicationIdA) : "",
      applicationIdB: isObjectIdString(flag?.applicationIdB) ? normalizeString(flag?.applicationIdB) : "",
    }));
  }

  const applications = await Application.find({
    applicationNo: { $in: appNos },
  }).select("_id applicationNo");
  const appNoToId = new Map(
    applications.map((application) => [normalizeString(application.applicationNo), normalizeString(application._id)])
  );

  return list.map((flag) => ({
    flag,
    applicationIdA: (() => {
      const rawApplicationId = normalizeString(flag?.applicationIdA);
      if (isObjectIdString(rawApplicationId)) return rawApplicationId;
      const lookupKey = normalizeString(flag?.appIdA) || rawApplicationId;
      return normalizeString(appNoToId.get(lookupKey));
    })(),
    applicationIdB: (() => {
      const rawApplicationId = normalizeString(flag?.applicationIdB);
      if (isObjectIdString(rawApplicationId)) return rawApplicationId;
      const lookupKey = normalizeString(flag?.appIdB) || rawApplicationId;
      return normalizeString(appNoToId.get(lookupKey));
    })(),
  }));
}

async function ensureFlagApplicationIds(flag) {
  if (!flag) return false;
  const [resolved] = await resolveFlagApplicationIds(flag);
  let changed = false;

  if (resolved.applicationIdA && normalizeString(flag.applicationIdA) !== resolved.applicationIdA) {
    flag.applicationIdA = resolved.applicationIdA;
    changed = true;
  }
  if (resolved.applicationIdB && normalizeString(flag.applicationIdB) !== resolved.applicationIdB) {
    flag.applicationIdB = resolved.applicationIdB;
    changed = true;
  }

  return changed;
}

async function normalizeApplicationIds(applicationIds) {
  const rawIds = [
    ...new Set((applicationIds || []).map((applicationId) => normalizeString(applicationId)).filter(Boolean)),
  ];
  if (!rawIds.length) return [];

  const validIds = rawIds.filter(isObjectIdString);
  const appNos = rawIds.filter((applicationId) => !isObjectIdString(applicationId));
  if (!appNos.length) return validIds;

  const applications = await Application.find({
    applicationNo: { $in: appNos },
  }).select("_id");

  return [
    ...new Set([
      ...validIds,
      ...applications.map((application) => normalizeString(application._id)).filter(Boolean),
    ]),
  ];
}

async function syncApplicationFraudState(applicationIds) {
  const uniqueIds = await normalizeApplicationIds(applicationIds);
  if (!uniqueIds.length) return;

  const flags = await FraudFlag.find({
    $or: [
      { applicationIdA: { $in: uniqueIds } },
      { applicationIdB: { $in: uniqueIds } },
    ],
  }).select("applicationIdA applicationIdB markedFraud");

  const nextState = new Map(uniqueIds.map((applicationId) => [applicationId, "pending"]));
  for (const flag of flags) {
    for (const applicationId of [flag.applicationIdA, flag.applicationIdB]) {
      if (!applicationId || !nextState.has(String(applicationId))) continue;
      const key = String(applicationId);
      const current = nextState.get(key);
      if (flag.markedFraud === "yes") {
        nextState.set(key, "yes");
        continue;
      }
      if (flag.markedFraud === "pending" && current !== "yes") {
        nextState.set(key, "pending");
        continue;
      }
      if (flag.markedFraud === "no" && current === "pending") {
        nextState.set(key, "no");
      }
    }
  }

  await Promise.all(
    uniqueIds.map((applicationId) =>
      Application.updateOne({ _id: applicationId }, {
        fraudMarked: nextState.get(applicationId) || "pending",
      })
    )
  );
}

async function syncAllApplicationFraudStates() {
  const flags = await FraudFlag.find().select(
    "appIdA appIdB applicationIdA applicationIdB markedFraud"
  );
  if (!flags.length) {
    await Application.updateMany({}, { fraudMarked: "pending" });
    return;
  }

  const resolvedPairs = await resolveFlagApplicationIds(flags);
  const nextState = new Map();

  for (const { flag, applicationIdA, applicationIdB } of resolvedPairs) {
    for (const applicationId of [applicationIdA, applicationIdB]) {
      if (!applicationId) continue;
      const current = nextState.get(applicationId) || "pending";
      if (flag.markedFraud === "yes") {
        nextState.set(applicationId, "yes");
        continue;
      }
      if (flag.markedFraud === "pending" && current !== "yes") {
        nextState.set(applicationId, "pending");
        continue;
      }
      if (flag.markedFraud === "no" && current === "pending") {
        nextState.set(applicationId, "no");
      }
    }
  }

  const resolvedIds = [...nextState.keys()];
  if (!resolvedIds.length) {
    await Application.updateMany({}, { fraudMarked: "pending" });
    return;
  }

  await Application.updateMany(
    { _id: { $nin: resolvedIds } },
    { fraudMarked: "pending" }
  );
  await Promise.all(
    resolvedIds.map((applicationId) =>
      Application.updateOne({ _id: applicationId }, {
        fraudMarked: nextState.get(applicationId) || "pending",
      })
    )
  );
}

// ══════════════════════════════════════
//  SCAN ASSETS — find all images, link to apps, flag orphans
// ══════════════════════════════════════
app.get("/api/scan-assets", async (req, res) => {
  try {
    const allAssetEntries = collectAssetImageEntries();
    const allImages = {};
    for (const entry of allAssetEntries) {
      const groupKey = entry.serial || "__unmatched__";
      if (!allImages[groupKey]) allImages[groupKey] = [];
      allImages[groupKey].push(entry.path);
    }

    // Find which asset folders have matching applications
    const appNos = await Application.distinct("applicationNo");
    const appNoSet = new Set(appNos.map(String));
    const inDataset = [],
      notInDataset = [];
    let totalImgCount = 0;

    for (const [folder, imgs] of Object.entries(allImages)) {
      if (folder === "__unmatched__") continue;
      totalImgCount += imgs.length;
      if (appNoSet.has(folder)) {
        inDataset.push({ folder, images: imgs, count: imgs.length });
        await Application.updateMany(
          { applicationNo: folder },
          { images: imgs, hasImages: true }
        );
      } else {
        notInDataset.push({ folder, images: imgs, count: imgs.length });
      }
    }

    // Mark apps without images
    const foldersWithImages = new Set(Object.keys(allImages));
    const appsNoImages = appNos.filter(
      (a) => !foldersWithImages.has(String(a))
    );

    const withoutSerial = allAssetEntries.filter((entry) => !entry.hasSerial);
    totalImgCount = allAssetEntries.length;

    res.json({
      totalFolders: Object.keys(allImages).filter((key) => key !== "__unmatched__").length,
      totalImages: totalImgCount,
      inDataset: inDataset.length,
      notInDataset: notInDataset.length,
      appsWithoutImages: appsNoImages.length,
      orphanFolders: notInDataset,
      withoutSerial: withoutSerial.length,
      missingImages: appsNoImages.slice(0, 100),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Return flat list of ALL image paths for OpenCV processing
app.get("/api/all-image-list", async (req, res) => {
  try {
    const assets = collectAssetImageEntries();
    const appNos = [...new Set(assets.map((asset) => asset.serial).filter(Boolean))];
    const apps = await Application.find({
      applicationNo: { $in: appNos },
    }).select("_id applicationNo beneficiaryName sanctionName fraudMarked");
    const appMap = new Map(apps.map((app) => [String(app.applicationNo), app]));
    const result = assets.map((asset) => {
      const app = asset.serial ? appMap.get(String(asset.serial)) : null;
      return {
        appNo: asset.serial || null,
        applicationId: app?._id || null,
        historicalNegligence: app?.fraudMarked === "yes",
        assetId: asset.path,
        hasSerial: asset.hasSerial,
        beneficiary: app?.beneficiaryName || null,
        sanction: app?.sanctionName || null,
        path: asset.path,
        filename: asset.filename,
      };
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════
//  UPLOAD SANCTION EXCEL
// ══════════════════════════════════════
app.post("/api/upload-sanction", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file uploaded" });
    const originalName = req.file.originalname;
    const sanctionName = path.basename(
      originalName,
      path.extname(originalName)
    );

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(req.file.path);
    const sheet = workbook.getWorksheet(1);
    if (!sheet) return res.status(400).json({ error: "No worksheet found" });

    let headerRow = null,
      hm = {};
    sheet.eachRow((row, rowNum) => {
      if (headerRow) return;
      const vals = [];
      row.eachCell((cell) =>
        vals.push(
          String(cell.value || "")
            .toLowerCase()
            .trim()
        )
      );
      const joined = vals.join(" ");
      if (joined.includes("application") || joined.includes("beneficiary")) {
        headerRow = rowNum;
        row.eachCell((cell, colNum) => {
          const v = String(cell.value || "")
            .toLowerCase()
            .trim();
          if (v.includes("application") && !v.includes("date"))
            hm.applicationNo = colNum;
          else if (
            v.includes("beneficiary") ||
            (v.includes("name") && !hm.beneficiaryName)
          )
            hm.beneficiaryName = colNum;
          else if (
            (v.includes("rms") || v.includes("reference")) &&
            v.includes("lat")
          )
            hm.refLat = colNum;
          else if (
            (v.includes("rms") || v.includes("reference")) &&
            v.includes("lon")
          )
            hm.refLon = colNum;
          else if (v.includes("installation")) hm.installDate = colNum;
          else if (v.includes("inspection")) hm.inspectDate = colNum;
          else if (v.includes("compliance")) hm.complianceDate = colNum;
          else if (v.includes("remark")) hm.remarks = colNum;
        });
      }
    });
    if (!headerRow) {
      headerRow = 1;
      hm = {
        applicationNo: 1,
        beneficiaryName: 2,
        refLat: 3,
        refLon: 4,
        installDate: 5,
        inspectDate: 6,
        complianceDate: 7,
        remarks: 8,
      };
    }
    console.log(`📊 Headers row ${headerRow}:`, hm);

    let sanction = await Sanction.findOne({ name: sanctionName });
    if (sanction) {
      await Application.deleteMany({ sanctionId: sanction._id });
      sanction.uploadedAt = new Date();
    } else {
      sanction = new Sanction({ name: sanctionName, filename: originalName });
    }

    const applications = [];
    let matchCount = 0,
      mismatchCount = 0;

    sheet.eachRow((row, rowNum) => {
      if (rowNum <= headerRow) return;
      const rawAppNo = row.getCell(hm.applicationNo || 1).value;
      const appNo = String(rawAppNo != null ? rawAppNo : "").trim();
      if (!appNo || appNo === "null" || appNo === "undefined" || appNo === "0")
        return;

      let rowColor = null,
        colorHex = "";
      row.eachCell((cell) => {
        const c = getCellColor(cell);
        if (c && !rowColor) {
          rowColor = c;
          colorHex = c.hex;
        }
      });
      const remarks = String(row.getCell(hm.remarks || 8).value || "").trim();
      let status = "unknown";
      if (isRedish(rowColor)) {
        status = "mismatch";
        mismatchCount++;
      } else if (/mismatch/i.test(remarks)) {
        status = "mismatch";
        mismatchCount++;
      } else if (isGreenish(rowColor)) {
        status = "match";
        matchCount++;
      } else {
        status = "match";
        matchCount++;
      }

      const images = findImagesForApp(appNo);
      applications.push({
        sanctionId: sanction._id,
        sanctionName,
        applicationNo: appNo,
        beneficiaryName: String(
          row.getCell(hm.beneficiaryName || 2).value || ""
        ).trim(),
        refLat: parseFloat(row.getCell(hm.refLat || 3).value) || 0,
        refLon: parseFloat(row.getCell(hm.refLon || 4).value) || 0,
        installDate: fmtDate(row.getCell(hm.installDate || 5).value),
        inspectDate: fmtDate(row.getCell(hm.inspectDate || 6).value),
        complianceDate: fmtDate(row.getCell(hm.complianceDate || 7).value),
        remarks,
        rowColorHex: colorHex,
        status,
        images,
        hasImages: images.length > 0,
        inDataset: true,
        fraudMarked: "pending",
      });
    });

    sanction.totalApplications = applications.length;
    sanction.matchCount = matchCount;
    sanction.mismatchCount = mismatchCount;
    await sanction.save();
    if (applications.length > 0) await Application.insertMany(applications);
    try {
      fs.unlinkSync(req.file.path);
    } catch (e) {}

    console.log(
      `✅ "${sanctionName}": ${applications.length} apps (${matchCount}/${mismatchCount})`
    );
    res.json({
      success: true,
      sanction: sanction.toObject(),
      applicationsInserted: applications.length,
      matchCount,
      mismatchCount,
    });
  } catch (e) {
    console.error("Upload error:", e);
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════
//  CRUD
// ══════════════════════════════════════
app.get("/api/sanctions", async (req, res) => {
  try {
    res.json(await Sanction.find().sort({ uploadedAt: -1 }));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.delete("/api/sanctions/:id", async (req, res) => {
  try {
    await Application.deleteMany({ sanctionId: req.params.id });
    await Sanction.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/applications", async (req, res) => {
  try {
    const {
      sanctionId,
      status,
      fraudMarked,
      search,
      hasImages,
      queue = "active",
      page = 1,
      limit = 50,
    } = req.query;
    const filter = {};
    if (sanctionId) filter.sanctionId = sanctionId;
    if (status) filter.status = status;
    if (fraudMarked) filter.fraudMarked = fraudMarked;
    if (hasImages === "true") filter.hasImages = true;
    if (hasImages === "false") filter.hasImages = false;
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { applicationNo: re },
        { beneficiaryName: re },
        { remarks: re },
      ];
    }

    if (queue === "active" || queue === "reviewed") {
      const flagPairs = await FraudFlag.find().select(
        "appIdA appIdB applicationIdA applicationIdB markedFraud"
      );
      const resolvedPairs = await resolveFlagApplicationIds(flagPairs);
      const flaggedAppIds = new Set();
      const reviewedAppIds = new Set();
      for (const { flag, applicationIdA, applicationIdB } of resolvedPairs) {
        if (applicationIdA) flaggedAppIds.add(applicationIdA);
        if (applicationIdB) flaggedAppIds.add(applicationIdB);
        if (flag.markedFraud !== "pending") {
          if (applicationIdA) reviewedAppIds.add(applicationIdA);
          if (applicationIdB) reviewedAppIds.add(applicationIdB);
        }
      }

      if (queue === "active") {
        if (fraudMarked === "yes" || fraudMarked === "no") {
          const included = [...new Set([...reviewedAppIds])];
          if (!included.length) {
            return res.json({ applications: [], total: 0, page: parseInt(page), pages: 0 });
          }
          filter._id = {
            ...(filter._id || {}),
            $in: included,
          };
        } else {
          const excluded = [...flaggedAppIds];
          if (excluded.length) {
            filter._id = {
              ...(filter._id || {}),
              $nin: excluded,
            };
          }
          if (!fraudMarked) filter.fraudMarked = "pending";
        }
      }

      if (queue === "reviewed") {
        const included = [...new Set([...reviewedAppIds])];
        if (!included.length) {
          return res.json({ applications: [], total: 0, page: parseInt(page), pages: 0 });
        }
        filter._id = {
          ...(filter._id || {}),
          $in: included,
        };
      }
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [apps, total] = await Promise.all([
      Application.find(filter)
        .sort({ _id: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      Application.countDocuments(filter),
    ]);
    res.json({
      applications: apps,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / parseInt(limit)),
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch("/api/applications/:id", async (req, res) => {
  try {
    res.json(
      await Application.findByIdAndUpdate(req.params.id, req.body, {
        new: true,
      })
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/applications/by-number/:appNo", async (req, res) => {
  try {
    const applicationNo = decodeURIComponent(req.params.appNo || "").trim();
    if (!applicationNo)
      return res.status(400).json({ error: "application number required" });

    const application = await Application.findOne({ applicationNo });
    if (!application)
      return res.status(404).json({ error: "Application not found" });

    const images = findImagesForApp(applicationNo);
    res.json({
      application,
      images,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/images/:appNo", (req, res) => {
  res.json({
    applicationNo: req.params.appNo,
    images: findImagesForApp(req.params.appNo),
  });
});

// ══════════════════════════════════════
//  FRAUD FLAGS (cross-sanction)
// ══════════════════════════════════════
app.post("/api/fraud-flags", async (req, res) => {
  try {
    const { flags, clearAll } = req.body;
    if (!flags || !Array.isArray(flags))
      return res.status(400).json({ error: "flags array required" });
    let preservedCount = 0;
    if (clearAll) {
      const reviewedFlags = await FraudFlag.find({
        markedFraud: { $ne: "pending" },
      }).lean();
      preservedCount = reviewedFlags.length;
      const preservedKeys = new Set(
        reviewedFlags.map((flag) => fraudPairKey(flag)).filter(Boolean)
      );
      const seenIncomingKeys = new Set();
      const dedupedFlags = flags.filter((flag) => {
        const key = fraudPairKey(flag);
        if (!key) return true;
        if (preservedKeys.has(key) || seenIncomingKeys.has(key)) return false;
        seenIncomingKeys.add(key);
        return true;
      });
      await FraudFlag.deleteMany({ markedFraud: "pending" });
      const inserted = dedupedFlags.length
        ? await FraudFlag.insertMany(dedupedFlags)
        : [];
      await syncAllApplicationFraudStates();
      return res.json({
        success: true,
        count: inserted.length,
        preserved: preservedCount,
      });
    }
    const inserted = await FraudFlag.insertMany(flags);
    await syncApplicationFraudState(
      inserted.flatMap((flag) => [flag.applicationIdA, flag.applicationIdB])
    );
    res.json({ success: true, count: inserted.length, preserved: preservedCount });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/fraud-flags/manual", async (req, res) => {
  try {
    const appNoA = String(req.body.appNoA || "").trim();
    const appNoB = String(req.body.appNoB || "").trim();
    const requestedImageA = String(req.body.imageA || "").trim();
    const requestedImageB = String(req.body.imageB || "").trim();

    if (!appNoA || !appNoB) {
      return res.status(400).json({ error: "Both application numbers are required" });
    }
    if (appNoA === appNoB) {
      return res.status(400).json({ error: "Applications must be different" });
    }

    const [appA, appB] = await Promise.all([
      Application.findOne({ applicationNo: appNoA }),
      Application.findOne({ applicationNo: appNoB }),
    ]);
    if (!appA || !appB) {
      return res.status(404).json({ error: "One or both applications were not found" });
    }

    const imagesA = findImagesForApp(appNoA);
    const imagesB = findImagesForApp(appNoB);
    if (!imagesA.length || !imagesB.length) {
      return res.status(400).json({ error: "Both applications need assets for manual pair creation" });
    }

    const imageA = requestedImageA && imagesA.includes(requestedImageA) ? requestedImageA : imagesA[0];
    const imageB = requestedImageB && imagesB.includes(requestedImageB) ? requestedImageB : imagesB[0];
    const gpsA =
      Number.isFinite(appA.refLat) &&
      Number.isFinite(appA.refLon) &&
      (appA.refLat !== 0 || appA.refLon !== 0)
        ? [appA.refLat, appA.refLon]
        : undefined;
    const gpsB =
      Number.isFinite(appB.refLat) &&
      Number.isFinite(appB.refLon) &&
      (appB.refLat !== 0 || appB.refLon !== 0)
        ? [appB.refLat, appB.refLon]
        : undefined;

    let flag = await FraudFlag.findOne({
      $or: [
        {
          applicationIdA: String(appA._id),
          applicationIdB: String(appB._id),
        },
        {
          applicationIdA: String(appB._id),
          applicationIdB: String(appA._id),
        },
        {
          appIdA: appNoA,
          appIdB: appNoB,
        },
        {
          appIdA: appNoB,
          appIdB: appNoA,
        },
      ],
    }).sort({ score: -1, createdAt: -1 });

    if (flag) {
      flag.appIdA = appNoA;
      flag.appIdB = appNoB;
      flag.applicationIdA = String(appA._id);
      flag.applicationIdB = String(appB._id);
      flag.sanctionA = appA.sanctionName;
      flag.sanctionB = appB.sanctionName;
      flag.beneficiaryA = appA.beneficiaryName;
      flag.beneficiaryB = appB.beneficiaryName;
      flag.hasSerialA = true;
      flag.hasSerialB = true;
      flag.bucket = "serial";
      flag.imageA = imageA;
      flag.imageB = imageB;
      flag.imageUrlA = `/assets/${imageA}`;
      flag.imageUrlB = `/assets/${imageB}`;
      flag.gpsA = gpsA;
      flag.gpsB = gpsB;
      flag.timeA = appA.inspectDate || appA.installDate || appA.complianceDate || "";
      flag.timeB = appB.inspectDate || appB.installDate || appB.complianceDate || "";
      flag.reasons = [...new Set([...(flag.reasons || []), "manual_pair"])];
      flag.score = Math.max(Number(flag.score) || 0, 100);
      flag.severity = "high";
      flag.markedFraud = "yes";
      flag.markedAt = new Date();
      await flag.save();
      await syncApplicationFraudState([flag.applicationIdA, flag.applicationIdB]);
      return res.json({ success: true, created: false, flag });
    }

    flag = await FraudFlag.create({
      appIdA: appNoA,
      appIdB: appNoB,
      applicationIdA: String(appA._id),
      applicationIdB: String(appB._id),
      sanctionA: appA.sanctionName,
      sanctionB: appB.sanctionName,
      beneficiaryA: appA.beneficiaryName,
      beneficiaryB: appB.beneficiaryName,
      hasSerialA: true,
      hasSerialB: true,
      bucket: "serial",
      imageA,
      imageB,
      imageUrlA: `/assets/${imageA}`,
      imageUrlB: `/assets/${imageB}`,
      gpsA,
      gpsB,
      timeA: appA.inspectDate || appA.installDate || appA.complianceDate || "",
      timeB: appB.inspectDate || appB.installDate || appB.complianceDate || "",
      score: 100,
      inliers: 0,
      goodMatches: 0,
      rawMatches: 0,
      gpsDist: null,
      gpsClose: false,
      reasons: ["manual_pair"],
      homoValid: false,
      severity: "high",
      markedFraud: "yes",
      markedAt: new Date(),
    });

    await syncApplicationFraudState([flag.applicationIdA, flag.applicationIdB]);
    res.json({ success: true, created: true, flag });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/fraud-flags", async (req, res) => {
  try {
    const { markedFraud, severity, search, limit = 5000 } = req.query;
    const filter = {};
    if (markedFraud) filter.markedFraud = markedFraud;
    if (severity) filter.severity = severity;
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      filter.$or = [
        { appIdA: re },
        { appIdB: re },
        { beneficiaryA: re },
        { beneficiaryB: re },
        { sanctionA: re },
        { sanctionB: re },
      ];
    }
    res.json(await FraudFlag.find(filter).sort({ score: -1, createdAt: -1 }).limit(parseInt(limit, 10)));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.patch("/api/fraud-flags/:id", async (req, res) => {
  try {
    const updated = await FraudFlag.findById(req.params.id);
    if (!updated) return res.status(404).json({ error: "Fraud flag not found" });

    updated.set({ ...req.body, markedAt: new Date() });
    await ensureFlagApplicationIds(updated);
    await updated.save();
    if (updated) {
      try {
        await syncApplicationFraudState([
          updated.applicationIdA,
          updated.applicationIdB,
        ]);
      } catch (syncError) {
        console.error("❌ Flag sync:", syncError.message);
      }
    }
    res.json(updated);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.delete("/api/fraud-flags", async (req, res) => {
  try {
    await FraudFlag.deleteMany({});
    await Application.updateMany({}, { fraudMarked: "pending" });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════
//  RECTIFICATIONS
// ══════════════════════════════════════
app.post(
  "/api/rectify/:appId",
  rectUpload.single("attachment"),
  async (req, res) => {
    try {
      const appDoc = await Application.findById(req.params.appId);
      if (!appDoc)
        return res.status(404).json({ error: "Application not found" });
      if (!req.file)
        return res.status(400).json({ error: "Attachment is mandatory" });

      // Move file to rectifications with proper name
      const ext = path.extname(req.file.originalname) || ".jpg";
      const newName = `${appDoc.applicationNo}_${Date.now()}${ext}`;
      const newPath = path.join(RECTIFY_DIR, newName);
      fs.renameSync(req.file.path, newPath);

      const rect = new Rectification({
        applicationId: appDoc._id,
        applicationNo: appDoc.applicationNo,
        comment: req.body.comment || "",
        attachmentPath: newName,
        attachmentName: req.file.originalname,
      });
      await rect.save();
      res.json({ success: true, rectification: rect.toObject() });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  }
);

app.get("/api/rectifications/:appNo", async (req, res) => {
  try {
    const rects = await Rectification.find({
      applicationNo: req.params.appNo,
    }).sort({ submittedAt: -1 });
    res.json(rects);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/rectifications", async (req, res) => {
  try {
    res.json(await Rectification.find().sort({ submittedAt: -1 }).limit(200));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/rectification-summary", async (req, res) => {
  try {
    const appNos = String(req.query.appNos || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    if (!appNos.length) return res.json({});

    const summary = await Rectification.aggregate([
      { $match: { applicationNo: { $in: appNos } } },
      { $group: { _id: "$applicationNo", count: { $sum: 1 } } },
    ]);

    res.json(
      Object.fromEntries(summary.map((item) => [String(item._id), item.count]))
    );
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ══════════════════════════════════════
//  STATS
// ══════════════════════════════════════
app.get("/api/stats", async (req, res) => {
  try {
    const [
      sanctions,
      totalApps,
      matchApps,
      mismatchApps,
      totalFlags,
      confirmedFraud,
      pendingReview,
      appsWithImages,
      rectCount,
    ] = await Promise.all([
      Sanction.countDocuments(),
      Application.countDocuments(),
      Application.countDocuments({ status: "match" }),
      Application.countDocuments({ status: "mismatch" }),
      FraudFlag.countDocuments(),
      FraudFlag.countDocuments({ markedFraud: "yes" }),
      FraudFlag.countDocuments({ markedFraud: "pending" }),
      Application.countDocuments({ hasImages: true }),
      Rectification.countDocuments(),
    ]);
    res.json({
      sanctions,
      totalApps,
      matchApps,
      mismatchApps,
      totalFlags,
      confirmedFraud,
      pendingReview,
      appsWithImages,
      rectCount,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── SPA fallback ──
app.get("/{*path}", (req, res) => {
  res.sendFile(path.join(PUBLIC_DIR, "index.html"));
});

const PORT = process.env.PORT || 43443;
https.createServer(httpsOptions, app).listen(PORT, () => {
  console.log(
    `\n🛡  PanelGuard → https://localhost:${PORT}\n   Assets: ${ASSETS_DIR}\n   Rectifications: ${RECTIFY_DIR}\n`
  );
});
