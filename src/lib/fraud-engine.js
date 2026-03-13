import { formatEta } from "@/lib/utils";

export async function parseEXIFFromUrl(src) {
  const result = { lat: null, lon: null, time: null };
  try {
    const response = await fetch(src);
    const buffer = await response.arrayBuffer();
    const view = new DataView(buffer);
    if (view.getUint16(0) !== 0xffd8) return result;

    let offset = 2;
    while (offset < view.byteLength - 4) {
      const marker = view.getUint16(offset);
      if (marker === 0xffe1) {
        parseAPP1(view, offset + 4, view.getUint16(offset + 2) - 2, result);
        break;
      }
      if ((marker & 0xff00) !== 0xff00) break;
      offset += 2 + view.getUint16(offset + 2);
    }
  } catch {
    return result;
  }
  return result;
}

function parseAPP1(view, start, length, result) {
  if (
    String.fromCharCode(
      view.getUint8(start),
      view.getUint8(start + 1),
      view.getUint8(start + 2),
      view.getUint8(start + 3)
    ) !== "Exif"
  ) {
    return;
  }

  const base = start + 6;
  const littleEndian = view.getUint16(base) === 0x4949;
  const get16 = (offset) => view.getUint16(base + offset, littleEndian);
  const get32 = (offset) => view.getUint32(base + offset, littleEndian);
  const ratio = (offset) => {
    const numerator = get32(offset);
    const denominator = get32(offset + 4);
    return denominator ? numerator / denominator : 0;
  };
  const readString = (offset, count) => {
    let value = "";
    for (let index = 0; index < count - 1; index += 1) {
      value += String.fromCharCode(view.getUint8(base + offset + index));
    }
    return value.trim();
  };
  const toDecimal = (deg, min, sec, ref) => {
    let value = deg + min / 60 + sec / 3600;
    if (ref === "S" || ref === "W") value = -value;
    return value;
  };

  function walkIfd(offset) {
    try {
      const count = get16(offset);
      let gpsOffset = null;
      for (let index = 0; index < count; index += 1) {
        const entryOffset = offset + 2 + index * 12;
        const tag = get16(entryOffset);
        const valueCount = get32(entryOffset + 4);
        const valueOffset = get32(entryOffset + 8);

        if ((tag === 0x9003 || tag === 0x0132) && !result.time) {
          result.time = valueCount > 4 ? readString(valueOffset, valueCount) : readString(entryOffset + 8, valueCount);
        }
        if (tag === 0x8825) gpsOffset = valueOffset;
        if (tag === 0x8769) walkIfd(valueOffset);
      }

      if (!gpsOffset) return;

      const gpsCount = get16(gpsOffset);
      let latRef = "N";
      let lonRef = "E";
      let latDeg = 0;
      let latMin = 0;
      let latSec = 0;
      let lonDeg = 0;
      let lonMin = 0;
      let lonSec = 0;

      for (let index = 0; index < gpsCount; index += 1) {
        const entryOffset = gpsOffset + 2 + index * 12;
        const tag = get16(entryOffset);
        const valueCount = get32(entryOffset + 4);
        const valueOffset = get32(entryOffset + 8);

        if (tag === 1) latRef = String.fromCharCode(view.getUint8(base + entryOffset + 8));
        if (tag === 3) lonRef = String.fromCharCode(view.getUint8(base + entryOffset + 8));
        if (tag === 2 && valueCount === 3) {
          latDeg = ratio(valueOffset);
          latMin = ratio(valueOffset + 8);
          latSec = ratio(valueOffset + 16);
        }
        if (tag === 4 && valueCount === 3) {
          lonDeg = ratio(valueOffset);
          lonMin = ratio(valueOffset + 8);
          lonSec = ratio(valueOffset + 16);
        }
      }

      if (latDeg || latMin || latSec) result.lat = toDecimal(latDeg, latMin, latSec, latRef);
      if (lonDeg || lonMin || lonSec) result.lon = toDecimal(lonDeg, lonMin, lonSec, lonRef);
    } catch {
      return;
    }
  }

  walkIfd(get32(4));
}

export function makeRingCanvas(src) {
  const canvas = document.createElement("canvas");
  canvas.width = src.width;
  canvas.height = src.height;
  const context = canvas.getContext("2d");

  context.fillStyle = "#000";
  context.fillRect(0, 0, canvas.width, canvas.height);

  const width = canvas.width;
  const height = canvas.height;
  const topHeight = Math.round(height * 0.18);
  const bottomHeight = Math.round(height * 0.18);
  const sideWidth = Math.round(width * 0.22);

  context.drawImage(src, 0, 0, width, topHeight, 0, 0, width, topHeight);
  context.drawImage(src, 0, height - bottomHeight, width, bottomHeight, 0, height - bottomHeight, width, bottomHeight);
  context.drawImage(src, 0, topHeight, sideWidth, height - topHeight - bottomHeight, 0, topHeight, sideWidth, height - topHeight - bottomHeight);
  context.drawImage(
    src,
    width - sideWidth,
    topHeight,
    sideWidth,
    height - topHeight - bottomHeight,
    width - sideWidth,
    topHeight,
    sideWidth,
    height - topHeight - bottomHeight
  );

  return canvas;
}

export function strictMatch(a, b) {
  const cv = window.cv;
  const result = { pass: false, score: 0, good: 0, inliers: 0, raw: 0, homoValid: false };

  if (!a.des || !b.des || a.des.rows < 10 || b.des.rows < 10) return result;

  const matcher = new cv.BFMatcher(cv.NORM_HAMMING, true);
  const rawMatches = new cv.DMatchVector();
  matcher.match(a.des, b.des, rawMatches);
  result.raw = rawMatches.size();

  const allMatches = [];
  for (let index = 0; index < rawMatches.size(); index += 1) allMatches.push(rawMatches.get(index));
  allMatches.sort((left, right) => left.distance - right.distance);

  if (allMatches.length < 8) {
    rawMatches.delete();
    matcher.delete();
    return result;
  }

  const medianDistance = allMatches[Math.floor(allMatches.length / 2)].distance;
  const distanceThreshold = Math.min(medianDistance * 0.7, 45);
  const goodMatches = allMatches.filter((match) => match.distance < distanceThreshold);
  result.good = goodMatches.length;

  if (goodMatches.length < 8) {
    rawMatches.delete();
    matcher.delete();
    return result;
  }

  const sourcePoints = [];
  const destinationPoints = [];
  for (const match of goodMatches) {
    const sourcePoint = a.kp.get(match.queryIdx).pt;
    const destinationPoint = b.kp.get(match.trainIdx).pt;
    sourcePoints.push(sourcePoint.x, sourcePoint.y);
    destinationPoints.push(destinationPoint.x, destinationPoint.y);
  }

  const sourceMatrix = cv.matFromArray(goodMatches.length, 1, cv.CV_32FC2, sourcePoints);
  const destinationMatrix = cv.matFromArray(goodMatches.length, 1, cv.CV_32FC2, destinationPoints);
  const mask = new cv.Mat();

  try {
    const homography = cv.findHomography(sourceMatrix, destinationMatrix, cv.RANSAC, 3.0, mask);

    let inliers = 0;
    const inlierIndices = [];
    for (let row = 0; row < mask.rows; row += 1) {
      if (mask.data[row]) {
        inliers += 1;
        inlierIndices.push(row);
      }
    }
    result.inliers = inliers;

    if (inliers < 10) {
      homography.delete();
      throw new Error("low_inliers");
    }

    const inlierRatio = inliers / goodMatches.length;
    if (inlierRatio < 0.35) {
      homography.delete();
      throw new Error("low_ratio");
    }

    const homographyValues = [];
    for (let index = 0; index < 9; index += 1) {
      homographyValues.push(homography.doubleAt(Math.floor(index / 3), index % 3));
    }

    const determinant =
      homographyValues[0] * (homographyValues[4] * homographyValues[8] - homographyValues[5] * homographyValues[7]) -
      homographyValues[1] * (homographyValues[3] * homographyValues[8] - homographyValues[5] * homographyValues[6]) +
      homographyValues[2] * (homographyValues[3] * homographyValues[7] - homographyValues[4] * homographyValues[6]);

    if (Math.abs(determinant) < 1e-4 || Math.abs(determinant) > 1e6) {
      homography.delete();
      throw new Error("degenerate");
    }

    const inlierPoints = inlierIndices.map((index) => {
      const point = a.kp.get(goodMatches[index].queryIdx).pt;
      return [point.x, point.y];
    });
    const xs = inlierPoints.map((point) => point[0]);
    const ys = inlierPoints.map((point) => point[1]);
    const xSpread = Math.max(...xs) - Math.min(...xs);
    const ySpread = Math.max(...ys) - Math.min(...ys);
    const imageDiagonal = Math.sqrt(a.canvas.width ** 2 + a.canvas.height ** 2);
    const spreadRatio = Math.sqrt(xSpread ** 2 + ySpread ** 2) / imageDiagonal;

    if (spreadRatio < 0.15) {
      homography.delete();
      throw new Error("clustered");
    }

    result.homoValid = true;
    result.pass = true;

    const inlierScore = Math.min(1, inliers / 30) * 50;
    const ratioScore = Math.min(1, inlierRatio / 0.7) * 30;
    const spreadScore = Math.min(1, spreadRatio / 0.4) * 20;
    result.score = Math.round(inlierScore + ratioScore + spreadScore);

    homography.delete();
  } catch {
    result.pass = false;
  }

  sourceMatrix.delete();
  destinationMatrix.delete();
  mask.delete();
  rawMatches.delete();
  matcher.delete();
  return result;
}

export function imageToCanvas(image, maxSize) {
  const canvas = document.createElement("canvas");
  let width = image.naturalWidth;
  let height = image.naturalHeight;
  if (Math.max(width, height) > maxSize) {
    const scale = maxSize / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }
  canvas.width = width;
  canvas.height = height;
  canvas.getContext("2d").drawImage(image, 0, 0, width, height);
  return canvas;
}

export function haversine(latA, lonA, latB, lonB) {
  const radius = 6371e3;
  const radians = Math.PI / 180;
  const deltaLat = (latB - latA) * radians;
  const deltaLon = (lonB - lonA) * radians;
  const value =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(latA * radians) * Math.cos(latB * radians) * Math.sin(deltaLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(value), Math.sqrt(1 - value));
}

async function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function updateProgress(onProgress, payload) {
  if (typeof onProgress === "function") onProgress(payload);
}

export async function runPairFraudDetection({
  imageEntries,
  maxFeatures,
  gpsRadius,
  resizeTo,
  onProgress,
  shouldStop,
}) {
  const cv = window.cv;
  const items = [];
  const scanStartedAt = performance.now();

  updateProgress(onProgress, {
    phase: "Phase 1 - Loading asset images",
    percent: 0,
    imagesLoaded: 0,
    pairsDone: 0,
    flagsFound: 0,
    eta: "—",
  });

  for (let index = 0; index < imageEntries.length; index += 1) {
    if (shouldStop?.()) throw new Error("SCAN_STOPPED");
    const entry = imageEntries[index];
    const src = `/assets/${entry.path}`;
    try {
      const [image, exif] = await Promise.all([loadImage(src), parseEXIFFromUrl(src)]);
      items.push({
        id: items.length,
        appNo: entry.appNo,
        applicationId: entry.applicationId,
        beneficiary: entry.beneficiary,
        sanction: entry.sanction,
        assetId: entry.assetId,
        hasSerial: entry.hasSerial,
        path: entry.path,
        filename: entry.filename,
        src,
        image,
        exif,
        canvas: null,
        ringCanvas: null,
        kp: null,
        des: null,
      });
    } catch {
      // Skip unreadable images to match the previous behavior of soft-failing bad files.
    }

    updateProgress(onProgress, {
      phase: "Phase 1 - Loading asset images",
      percent: ((index + 1) / Math.max(imageEntries.length, 1)) * 18,
      imagesLoaded: items.length,
      pairsDone: 0,
      flagsFound: 0,
      eta: "—",
    });
    if (index % 8 === 0) await sleep(3);
  }

  updateProgress(onProgress, {
    phase: "Phase 2 - Extracting background ring features",
    percent: 20,
    imagesLoaded: items.length,
    pairsDone: 0,
    flagsFound: 0,
    eta: "—",
  });

  for (let index = 0; index < items.length; index += 1) {
    if (shouldStop?.()) throw new Error("SCAN_STOPPED");
    const item = items[index];
    try {
      item.canvas = imageToCanvas(item.image, resizeTo);
      item.ringCanvas = makeRingCanvas(item.canvas);
      const mat = cv.imread(item.ringCanvas);
      const gray = new cv.Mat();
      cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);

      const orb = new cv.ORB(maxFeatures);
      const kp = new cv.KeyPointVector();
      const des = new cv.Mat();
      orb.detectAndCompute(gray, new cv.Mat(), kp, des);

      item.kp = kp;
      item.des = des;

      mat.delete();
      gray.delete();
      orb.delete();
    } catch {
      item.kp = null;
      item.des = null;
    }

    const elapsed = (performance.now() - scanStartedAt) / 1000;
    updateProgress(onProgress, {
      phase: "Phase 2 - Extracting background ring features",
      percent: 20 + ((index + 1) / Math.max(items.length, 1)) * 20,
      imagesLoaded: items.length,
      pairsDone: 0,
      flagsFound: 0,
      eta: formatEta((elapsed / Math.max(index + 1, 1)) * Math.max(items.length - index - 1, 0)),
    });
    if (index % 8 === 0) await sleep(3);
  }

  const validItems = items.filter((item) => item.des && item.des.rows >= 10);
  const candidatePairs = [];
  for (let a = 0; a < validItems.length; a += 1) {
    for (let b = a + 1; b < validItems.length; b += 1) {
      const left = validItems[a];
      const right = validItems[b];
      const hasGps = left.exif.lat !== null && right.exif.lat !== null;
      if (hasGps) {
        const distance = haversine(left.exif.lat, left.exif.lon, right.exif.lat, right.exif.lon);
        if (distance <= gpsRadius * 4) candidatePairs.push([a, b, distance]);
      } else {
        candidatePairs.push([a, b, null]);
      }
    }
  }

  updateProgress(onProgress, {
    phase: "Phase 3 - Matching backgrounds",
    percent: 42,
    imagesLoaded: items.length,
    pairsDone: 0,
    flagsFound: 0,
    eta: "—",
  });

  const flags = [];
  const matchStartedAt = performance.now();
  for (let index = 0; index < candidatePairs.length; index += 1) {
    if (shouldStop?.()) throw new Error("SCAN_STOPPED");
    const [leftIndex, rightIndex, gpsDist] = candidatePairs[index];
    const left = validItems[leftIndex];
    const right = validItems[rightIndex];
    const match = strictMatch(left, right);

    if (match.pass) {
      const gpsClose = gpsDist !== null && gpsDist <= gpsRadius;
      const bothGps = left.exif.lat !== null && right.exif.lat !== null;
      const hasDifferentTime = left.exif.time && right.exif.time && left.exif.time !== right.exif.time;

      let severity;
      if (match.score >= 55 || (match.score >= 35 && gpsClose)) severity = "high";
      else severity = "medium";

      const reasons = [];
      if (match.homoValid) reasons.push("homography_valid");
      if (gpsClose) reasons.push("gps_close");
      if (bothGps && !gpsClose && gpsDist !== null) reasons.push("gps_far");
      if (hasDifferentTime) reasons.push("diff_time");

      flags.push({
        appIdA: left.appNo || left.assetId,
        appIdB: right.appNo || right.assetId,
        applicationIdA: left.applicationId || null,
        applicationIdB: right.applicationId || null,
        sanctionA: left.sanction || "Unmapped asset",
        sanctionB: right.sanction || "Unmapped asset",
        beneficiaryA: left.beneficiary || left.filename,
        beneficiaryB: right.beneficiary || right.filename,
        hasSerialA: Boolean(left.hasSerial),
        hasSerialB: Boolean(right.hasSerial),
        bucket: left.hasSerial && right.hasSerial ? "serial" : "nonserial",
        imageA: left.path,
        imageB: right.path,
        imageUrlA: left.src,
        imageUrlB: right.src,
        timeA: left.exif.time,
        timeB: right.exif.time,
        gpsA: left.exif.lat !== null ? [left.exif.lat, left.exif.lon] : null,
        gpsB: right.exif.lat !== null ? [right.exif.lat, right.exif.lon] : null,
        score: match.score,
        goodMatches: match.good,
        inliers: match.inliers,
        rawMatches: match.raw,
        gpsDist,
        gpsClose,
        reasons,
        homoValid: match.homoValid,
        severity,
        markedFraud: "pending",
      });
    }

    const elapsed = (performance.now() - matchStartedAt) / 1000;
    updateProgress(onProgress, {
      phase: "Phase 3 - Matching backgrounds",
      percent: 42 + ((index + 1) / Math.max(candidatePairs.length, 1)) * 58,
      imagesLoaded: items.length,
      pairsDone: index + 1,
      flagsFound: flags.length,
      eta: formatEta((elapsed / Math.max(index + 1, 1)) * Math.max(candidatePairs.length - index - 1, 0)),
    });

    if (index % 25 === 0) await sleep(2);
  }

  for (const item of validItems) {
    try {
      item.kp?.delete?.();
      item.des?.delete?.();
    } catch {
      // no-op
    }
  }

  return {
    itemsCompared: items.length,
    candidatePairs: candidatePairs.length,
    flags,
  };
}
