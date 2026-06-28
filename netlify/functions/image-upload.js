const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

const DEFAULT_MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      ...CORS_HEADERS,
      "Content-Type": "application/json; charset=utf-8",
    },
    body: statusCode === 204 ? "" : JSON.stringify(body),
  };
}

function maxBytes() {
  const parsed = Number.parseInt(process.env.IMAGE_UPLOAD_MAX_BYTES || "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_BYTES;
}

function contentType(headers) {
  return headers?.["content-type"] || headers?.["Content-Type"] || "";
}

async function parseMultipart(event) {
  const type = contentType(event.headers);
  if (!type.includes("multipart/form-data")) {
    const err = new Error("Expected multipart/form-data upload.");
    err.status = 415;
    throw err;
  }

  const body = event.isBase64Encoded
    ? Buffer.from(event.body || "", "base64")
    : Buffer.from(event.body || "", "utf8");
  const request = new Request("https://local-upload.invalid", {
    method: "POST",
    headers: { "Content-Type": type },
    body,
  });
  return request.formData();
}

function matchesImageSignature(type, bytes) {
  if (type === "image/png") {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  }
  if (type === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === "image/gif") {
    const sig = bytes.subarray(0, 6).toString("ascii");
    return sig === "GIF87a" || sig === "GIF89a";
  }
  if (type === "image/webp") {
    return bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP";
  }
  return false;
}

async function validateImage(file) {
  if (!file || typeof file.arrayBuffer !== "function") {
    const err = new Error("Missing image file.");
    err.status = 400;
    throw err;
  }

  if (!ALLOWED_TYPES.has(file.type)) {
    const err = new Error("Unsupported image type. Use JPG, PNG, WebP, or GIF.");
    err.status = 415;
    throw err;
  }

  const limit = maxBytes();
  if (file.size > limit) {
    const err = new Error(`Image is too large. Maximum size is ${Math.round(limit / 1024 / 1024)} MB.`);
    err.status = 413;
    throw err;
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!matchesImageSignature(file.type, bytes)) {
    const err = new Error("Uploaded file content does not match its image type.");
    err.status = 415;
    throw err;
  }

  return bytes;
}

async function uploadToImgBb(file, bytes) {
  const apiKey = String(process.env.IMGBB_API_KEY || "").trim();
  if (!apiKey) {
    const err = new Error("Image upload is not configured.");
    err.status = 503;
    throw err;
  }

  const payload = new FormData();
  payload.append("image", new Blob([bytes], { type: file.type }), file.name || "upload");

  const response = await fetch(`https://api.imgbb.com/1/upload?key=${encodeURIComponent(apiKey)}`, {
    method: "POST",
    body: payload,
  });
  const data = await response.json().catch(() => null);

  if (!response.ok || !data?.success || !data?.data?.url) {
    const detail = data?.error?.message || `ImgBB upload failed (${response.status})`;
    const err = new Error(detail);
    err.status = response.ok ? 502 : response.status;
    throw err;
  }

  return {
    url: data.data.url,
    displayUrl: data.data.display_url || data.data.url,
    deleteUrl: data.data.delete_url || "",
  };
}

exports.handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return json(204, {});
  if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed." });

  try {
    const formData = await parseMultipart(event);
    const file = formData.get("image") || formData.get("file");
    const bytes = await validateImage(file);
    const uploaded = await uploadToImgBb(file, bytes);
    return json(200, uploaded);
  } catch (err) {
    const statusCode = err.status || 500;
    return json(statusCode, { error: err.message || "Image upload failed." });
  }
};
