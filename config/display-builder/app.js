const defaultConfig = {
  screen: {
    width: 68,
    height: 160,
    physicalWidth: 160,
    physicalHeight: 68,
    orientation: "vertical",
    background: "light",
    name: "generated_nice_view"
  },
  assets: [],
  widgets: [
    {
      id: "battery_main",
      type: "battery",
      x: 5,
      y: 6,
      width: 31,
      height: 13,
      bind: "battery.level",
      chargingBind: "battery.charging",
      visible: true,
      options: { capWidth: 3, border: 1, lowThreshold: 20, showPercent: false }
    },
    {
      id: "ble_profiles",
      type: "bleProfiles",
      x: 5,
      y: 34,
      width: 58,
      height: 38,
      bind: "ble.profiles",
      visible: true,
      options: { count: 5, active: 1 }
    },
    {
      id: "layer_label",
      type: "layerText",
      x: 5,
      y: 140,
      width: 58,
      height: 12,
      bind: "layer.name",
      visible: true,
      options: { align: "center", prefix: "" }
    },
    {
      id: "wpm_graph",
      type: "wpmGraph",
      x: 6,
      y: 92,
      width: 46,
      height: 24,
      bind: "wpm.history",
      visible: true,
      options: { samples: 10 }
    }
  ]
};

const assetCache = new Map();
let config = normalizeConfig(JSON.parse(JSON.stringify(defaultConfig)));
let selectedId = config.widgets[0].id;
let outputTab = "c";
let state = {
  battery: { level: 76, charging: false },
  layer: { name: "Base", index: 0 },
  ble: {
    active: 1,
    connected: [true, false, false, false, false],
    bonded: [true, true, false, false, false]
  },
  wpm: { current: 38, history: [12, 18, 21, 30, 28, 35, 40, 34, 37, 38] }
};

const $ = (id) => document.getElementById(id);
const preview = $("preview");
const ctx = preview.getContext("2d");
ctx.imageSmoothingEnabled = false;

function screenSize() {
  return {
    width: Math.max(1, Number(config.screen?.width) || 68),
    height: Math.max(1, Number(config.screen?.height) || 160),
    physicalWidth: Math.max(1, Number(config.screen?.physicalWidth) || 160),
    physicalHeight: Math.max(1, Number(config.screen?.physicalHeight) || 68),
    orientation: config.screen?.orientation || "vertical"
  };
}

function applyOrientation(orientation) {
  config.screen.orientation = orientation;
  if (orientation === "vertical") {
    config.screen.width = 68;
    config.screen.height = 160;
    config.screen.physicalWidth = 160;
    config.screen.physicalHeight = 68;
  } else {
    config.screen.width = 160;
    config.screen.height = 68;
    config.screen.physicalWidth = 160;
    config.screen.physicalHeight = 68;
  }
}

function syncPreviewCanvas() {
  const screen = screenSize();
  if (preview.width !== screen.width || preview.height !== screen.height) {
    preview.width = screen.width;
    preview.height = screen.height;
    ctx.imageSmoothingEnabled = false;
  }
  preview.style.setProperty("--preview-aspect", `${screen.width} / ${screen.height}`);
  preview.style.setProperty("--preview-width", screen.orientation === "vertical" ? "340px" : "800px");
  const orientationControl = $("orientationState");
  if (orientationControl) {
    orientationControl.value = screen.orientation;
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function selectedWidget() {
  return config.widgets.find((widget) => widget.id === selectedId) || null;
}

function normalizeWidget(widget) {
  widget.visible = widget.visible !== false;
  widget.options = widget.options || {};
  widget.x = Number(widget.x) || 0;
  widget.y = Number(widget.y) || 0;
  widget.width = Math.max(1, Number(widget.width) || 1);
  widget.height = Math.max(1, Number(widget.height) || 1);
  return widget;
}

function assetById(id) {
  return (config.assets || []).find((asset) => asset.id === id) || null;
}

function loadAsset(asset) {
  if (!asset || !asset.dataUrl || assetCache.has(asset.id)) {
    return;
  }
  const image = new Image();
  image.onload = () => {
    asset.width = image.naturalWidth;
    asset.height = image.naturalHeight;
    assetCache.set(asset.id, image);
    renderAll();
  };
  image.src = asset.dataUrl;
}

function loadAssets() {
  (config.assets || []).forEach(loadAsset);
}

function imagePixels(widget) {
  const asset = assetById(widget.asset);
  const image = assetCache.get(widget.asset);
  if (!asset || !image) {
    return null;
  }

  const width = Math.max(1, widget.width);
  const height = Math.max(1, widget.height);
  const threshold = widget.options.threshold ?? 128;
  const invert = widget.options.invert === true;
  const offscreen = document.createElement("canvas");
  offscreen.width = width;
  offscreen.height = height;
  const off = offscreen.getContext("2d");
  off.imageSmoothingEnabled = false;
  off.fillStyle = "#ffffff";
  off.fillRect(0, 0, width, height);

  const fit = widget.options.fit || "contain";
  let drawW = width;
  let drawH = height;
  let dx = 0;
  let dy = 0;
  if (fit !== "stretch") {
    const scale = fit === "cover"
      ? Math.max(width / image.naturalWidth, height / image.naturalHeight)
      : Math.min(width / image.naturalWidth, height / image.naturalHeight);
    drawW = Math.max(1, Math.round(image.naturalWidth * scale));
    drawH = Math.max(1, Math.round(image.naturalHeight * scale));
    dx = Math.round((width - drawW) / 2);
    dy = Math.round((height - drawH) / 2);
  }

  off.drawImage(image, dx, dy, drawW, drawH);
  const data = off.getImageData(0, 0, width, height).data;
  const bits = [];
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const alpha = data[offset + 3] / 255;
      const luminance = (data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114) * alpha + 255 * (1 - alpha);
      const on = invert ? luminance > threshold : luminance < threshold;
      bits.push(on ? 1 : 0);
    }
  }
  return { width, height, bits };
}

function packedBitmap(widget) {
  const pixels = imagePixels(widget);
  if (!pixels) {
    return null;
  }
  const bytes = [];
  let byte = 0;
  pixels.bits.forEach((bit, index) => {
    if (bit) {
      byte |= 1 << (7 - (index % 8));
    }
    if (index % 8 === 7) {
      bytes.push(byte);
      byte = 0;
    }
  });
  if (pixels.bits.length % 8 !== 0) {
    bytes.push(byte);
  }
  return { ...pixels, bytes };
}

function normalizeConfig(nextConfig) {
  nextConfig.screen = nextConfig.screen || {};
  nextConfig.screen.orientation = nextConfig.screen.orientation || "vertical";
  if (!nextConfig.screen.width || !nextConfig.screen.height) {
    if (nextConfig.screen.orientation === "horizontal") {
      nextConfig.screen.width = 160;
      nextConfig.screen.height = 68;
    } else {
      nextConfig.screen.width = 68;
      nextConfig.screen.height = 160;
    }
  }
  nextConfig.screen.physicalWidth = nextConfig.screen.physicalWidth || 160;
  nextConfig.screen.physicalHeight = nextConfig.screen.physicalHeight || 68;
  nextConfig.screen.name = nextConfig.screen.name || "generated_nice_view";
  nextConfig.assets = Array.isArray(nextConfig.assets) ? nextConfig.assets : [];
  nextConfig.widgets = Array.isArray(nextConfig.widgets) ? nextConfig.widgets : [];
  nextConfig.widgets.forEach(normalizeWidget);
  nextConfig.assets.forEach(loadAsset);
  return nextConfig;
}

function addWidget(type) {
  const id = `${type}_${Math.floor(Date.now() % 100000)}`;
  const vertical = screenSize().orientation === "vertical";
  const base = {
    battery: {
      id,
      type,
      x: 8,
      y: 8,
      width: 31,
      height: 13,
      bind: "battery.level",
      chargingBind: "battery.charging",
      visible: true,
      options: { capWidth: 3, border: 1, lowThreshold: 20, showPercent: false }
    },
    layerText: {
      id,
      type,
      x: vertical ? 5 : 84,
      y: vertical ? 136 : 52,
      width: vertical ? 58 : 68,
      height: 12,
      bind: "layer.name",
      visible: true,
      options: { align: vertical ? "center" : "right", prefix: "" }
    },
    bleProfiles: {
      id,
      type,
      x: vertical ? 5 : 48,
      y: vertical ? 34 : 8,
      width: vertical ? 58 : 66,
      height: vertical ? 38 : 36,
      bind: "ble.profiles",
      visible: true,
      options: { count: 5, active: 1 }
    },
    wpmGraph: {
      id,
      type,
      x: vertical ? 6 : 10,
      y: vertical ? 92 : 40,
      width: vertical ? 46 : 60,
      height: vertical ? 24 : 20,
      bind: "wpm.history",
      visible: true,
      options: { samples: 10 }
    },
    label: {
      id,
      type,
      x: vertical ? 5 : 72,
      y: vertical ? 76 : 28,
      width: vertical ? 58 : 70,
      height: 10,
      text: "hello",
      visible: true,
      options: { align: "left" }
    },
    image: {
      id,
      type,
      x: vertical ? 6 : 12,
      y: vertical ? 20 : 12,
      width: vertical ? 56 : 48,
      height: vertical ? 56 : 32,
      asset: null,
      visible: true,
      options: { threshold: 128, invert: false, fit: "contain" }
    }
  }[type];

  config.widgets.push(base);
  selectedId = id;
  renderAll();
}

function addImageFromFile(file) {
  if (!file) {
    return;
  }

  const reader = new FileReader();
  reader.onload = () => {
    const assetId = `asset_${Math.floor(Date.now() % 100000)}`;
    const widgetId = `image_${Math.floor(Date.now() % 100000)}`;
    const vertical = screenSize().orientation === "vertical";
    const asset = {
      id: assetId,
      name: file.name.replace(/[^A-Za-z0-9_.-]/g, "_"),
      dataUrl: reader.result
    };
    config.assets.push(asset);
    config.widgets.push({
      id: widgetId,
      type: "image",
      x: vertical ? 6 : 12,
      y: vertical ? 20 : 12,
      width: vertical ? 56 : 48,
      height: vertical ? 56 : 32,
      asset: assetId,
      visible: true,
      options: { threshold: 128, invert: false, fit: "contain" }
    });
    selectedId = widgetId;
    loadAsset(asset);
    renderAll();
  };
  reader.readAsDataURL(file);
}

function deleteSelected() {
  if (!selectedId) return;
  config.widgets = config.widgets.filter((widget) => widget.id !== selectedId);
  selectedId = config.widgets[0]?.id || null;
  renderAll();
}

function drawPixelText(text, x, y, align = "left") {
  ctx.save();
  ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillStyle = "#101820";
  ctx.textBaseline = "top";
  const width = ctx.measureText(text).width;
  const dx = align === "right" ? x - width : align === "center" ? x - width / 2 : x;
  ctx.fillText(text, Math.round(dx), Math.round(y));
  ctx.restore();
}

function clearPreview() {
  const screen = screenSize();
  ctx.fillStyle = "#c8d8b8";
  ctx.fillRect(0, 0, screen.width, screen.height);
}

function drawSelection(widget) {
  if (widget.id !== selectedId) return;
  ctx.save();
  ctx.setLineDash([2, 2]);
  ctx.strokeStyle = "#0f766e";
  ctx.strokeRect(widget.x - 1, widget.y - 1, widget.width + 2, widget.height + 2);
  ctx.restore();
}

function drawBattery(widget) {
  const level = Math.max(0, Math.min(100, state.battery.level));
  const cap = widget.options.capWidth ?? 3;
  const border = widget.options.border ?? 1;
  const bodyW = widget.width - cap - 1;
  const fillMax = Math.max(0, bodyW - border * 4);
  const fillW = Math.round((fillMax * level) / 100);

  ctx.strokeStyle = "#101820";
  ctx.fillStyle = "#101820";
  ctx.lineWidth = border;
  ctx.strokeRect(widget.x, widget.y + 1, bodyW, widget.height - 2);
  ctx.fillRect(widget.x + bodyW, widget.y + Math.floor(widget.height / 3), cap, Math.ceil(widget.height / 3));
  ctx.fillRect(widget.x + border * 2, widget.y + border * 3, fillW, Math.max(1, widget.height - border * 6));

  if (widget.options.showPercent) {
    drawPixelText(`${level}%`, widget.x + widget.width + 3, widget.y + 2);
  }

  if (level <= (widget.options.lowThreshold ?? 20)) {
    ctx.fillRect(widget.x + 3, widget.y + widget.height + 1, Math.max(1, bodyW - 6), 1);
  }
}

function drawLayerText(widget) {
  const label = `${widget.options.prefix || ""}${state.layer.name}`;
  const align = widget.options.align || "left";
  const anchor = align === "right" ? widget.x + widget.width : align === "center" ? widget.x + widget.width / 2 : widget.x;
  drawPixelText(label.toUpperCase(), anchor, widget.y, align);
}

function drawLabel(widget) {
  const align = widget.options.align || "left";
  const anchor = align === "right" ? widget.x + widget.width : align === "center" ? widget.x + widget.width / 2 : widget.x;
  drawPixelText(String(widget.text || ""), anchor, widget.y, align);
}

function drawBleProfiles(widget) {
  const count = Math.max(1, Math.min(5, Number(widget.options.count) || 5));
  const radius = 6;
  const points = [
    [widget.x + 8, widget.y + 8],
    [widget.x + 30, widget.y + 8],
    [widget.x + 52, widget.y + 8],
    [widget.x + 19, widget.y + 26],
    [widget.x + 41, widget.y + 26]
  ];

  ctx.strokeStyle = "#101820";
  ctx.fillStyle = "#101820";
  ctx.font = "8px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  for (let i = 0; i < count; i += 1) {
    const [cx, cy] = points[i];
    ctx.setLineDash(state.ble.bonded[i] && !state.ble.connected[i] ? [2, 2] : []);
    if (state.ble.connected[i] || state.ble.bonded[i]) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    if (i + 1 === state.ble.active) {
      ctx.beginPath();
      ctx.arc(cx, cy, radius - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c8d8b8";
      ctx.fillText(String(i + 1), cx, cy + 0.5);
      ctx.fillStyle = "#101820";
    } else {
      ctx.fillText(String(i + 1), cx, cy + 0.5);
    }
  }
  ctx.textAlign = "start";
}

function drawWpmGraph(widget) {
  const values = state.wpm.history.slice(-Math.max(2, widget.options.samples || 10));
  const max = Math.max(1, ...values);
  const step = widget.width / Math.max(1, values.length - 1);

  ctx.strokeStyle = "#101820";
  ctx.lineWidth = 1;
  ctx.strokeRect(widget.x, widget.y, widget.width, widget.height);
  ctx.beginPath();
  values.forEach((value, index) => {
    const px = Math.round(widget.x + index * step);
    const py = Math.round(widget.y + widget.height - 2 - ((widget.height - 4) * value) / max);
    if (index === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
  drawPixelText(String(state.wpm.current), widget.x + widget.width + 3, widget.y + widget.height - 9);
}

function drawImageWidget(widget) {
  const pixels = imagePixels(widget);
  if (!pixels) {
    ctx.save();
    ctx.strokeStyle = "#101820";
    ctx.setLineDash([3, 2]);
    ctx.strokeRect(widget.x, widget.y, widget.width, widget.height);
    ctx.restore();
    drawPixelText("IMAGE", widget.x + 3, widget.y + 3);
    return;
  }

  ctx.fillStyle = "#101820";
  pixels.bits.forEach((bit, index) => {
    if (!bit) {
      return;
    }
    const x = index % pixels.width;
    const y = Math.floor(index / pixels.width);
    ctx.fillRect(widget.x + x, widget.y + y, 1, 1);
  });
}

function drawWidget(widget) {
  if (widget.visible === false) return;
  normalizeWidget(widget);
  if (widget.type === "battery") drawBattery(widget);
  if (widget.type === "layerText") drawLayerText(widget);
  if (widget.type === "bleProfiles") drawBleProfiles(widget);
  if (widget.type === "wpmGraph") drawWpmGraph(widget);
  if (widget.type === "label") drawLabel(widget);
  if (widget.type === "image") drawImageWidget(widget);
  drawSelection(widget);
}

function renderPreview() {
  syncPreviewCanvas();
  clearPreview();
  config.widgets.forEach(drawWidget);
}

function widgetLabel(widget) {
  const names = {
    battery: "Battery",
    layerText: "Layer Text",
    bleProfiles: "BLE Profiles",
    wpmGraph: "WPM Graph",
    label: "Static Text",
    image: "Bitmap Image"
  };
  return names[widget.type] || widget.type;
}

function renderWidgetList() {
  const list = $("widgetList");
  list.innerHTML = "";
  config.widgets.forEach((widget) => {
    const row = document.createElement("button");
    row.className = `widget-row ${widget.id === selectedId ? "active" : ""}`;
    row.type = "button";
    row.innerHTML = `<span><strong>${widgetLabel(widget)}</strong><span>${widget.id} at ${widget.x},${widget.y}</span></span><span>${widget.visible === false ? "Off" : "On"}</span>`;
    row.addEventListener("click", () => {
      selectedId = widget.id;
      renderAll();
    });
    list.appendChild(row);
  });
}

function field(name, value, update, type = "number", options = null) {
  const wrap = document.createElement("div");
  wrap.className = "field";
  const label = document.createElement("label");
  label.textContent = name;
  wrap.appendChild(label);

  let input;
  if (options) {
    input = document.createElement("select");
    options.forEach((option) => {
      const item = document.createElement("option");
      item.value = option;
      item.textContent = option;
      input.appendChild(item);
    });
    input.value = value;
  } else {
    input = document.createElement("input");
    input.type = type;
    input.value = value;
  }
  input.addEventListener("input", () => update(input.type === "number" ? Number(input.value) : input.value));
  wrap.appendChild(input);
  return wrap;
}

function renderInspector() {
  const panel = $("inspector");
  const widget = selectedWidget();
  panel.innerHTML = "";
  $("deleteWidget").disabled = !widget;
  if (!widget) {
    panel.textContent = "No widget selected.";
    return;
  }

  panel.appendChild(field("X", widget.x, (value) => { widget.x = value; refreshFromInspector(); }));
  panel.appendChild(field("Y", widget.y, (value) => { widget.y = value; refreshFromInspector(); }));
  panel.appendChild(field("Width", widget.width, (value) => { widget.width = Math.max(1, value); refreshFromInspector(); }));
  panel.appendChild(field("Height", widget.height, (value) => { widget.height = Math.max(1, value); refreshFromInspector(); }));

  const visible = field("Visible", widget.visible === false ? "false" : "true", (value) => {
    widget.visible = value === "true";
    refreshFromInspector();
  }, "text", ["true", "false"]);
  panel.appendChild(visible);

  if (widget.type === "label") {
    const text = field("Text", widget.text || "", (value) => { widget.text = value; refreshFromInspector(); }, "text");
    text.classList.add("wide");
    panel.appendChild(text);
  }

  if (widget.type === "layerText" || widget.type === "label") {
    panel.appendChild(field("Align", widget.options.align || "left", (value) => {
      widget.options.align = value;
      refreshFromInspector();
    }, "text", ["left", "center", "right"]));
  }

  if (widget.type === "battery") {
    panel.appendChild(field("Show %", widget.options.showPercent ? "true" : "false", (value) => {
      widget.options.showPercent = value === "true";
      refreshFromInspector();
    }, "text", ["false", "true"]));
    panel.appendChild(field("Low At", widget.options.lowThreshold ?? 20, (value) => {
      widget.options.lowThreshold = value;
      refreshFromInspector();
    }));
  }

  if (widget.type === "image") {
    const asset = assetById(widget.asset);
    const name = field("Asset", asset ? asset.name : "Missing asset", () => {}, "text");
    name.classList.add("wide");
    const input = name.querySelector("input");
    input.readOnly = true;
    panel.appendChild(name);

    panel.appendChild(field("Threshold", widget.options.threshold ?? 128, (value) => {
      widget.options.threshold = Math.max(0, Math.min(255, value));
      refreshFromInspector();
    }));
    panel.appendChild(field("Invert", widget.options.invert ? "true" : "false", (value) => {
      widget.options.invert = value === "true";
      refreshFromInspector();
    }, "text", ["false", "true"]));
    panel.appendChild(field("Fit", widget.options.fit || "contain", (value) => {
      widget.options.fit = value;
      refreshFromInspector();
    }, "text", ["contain", "cover", "stretch"]));
  }
}

function renderJson() {
  $("jsonEditor").value = JSON.stringify(config, null, 2);
}

function cIdent(value) {
  return String(value).replace(/[^A-Za-z0-9_]/g, "_").replace(/^[^A-Za-z_]/, "_$&");
}

function formatByteArray(bytes) {
  const chunks = [];
  for (let i = 0; i < bytes.length; i += 12) {
    chunks.push(`    ${bytes.slice(i, i + 12).map((byte) => `0x${byte.toString(16).padStart(2, "0")}`).join(", ")}`);
  }
  return chunks.join(",\n");
}

function generateC(cfg) {
  const screen = screenSize();
  const vertical = screen.orientation === "vertical";
  const widgets = cfg.widgets.filter((widget) => widget.visible !== false).map(normalizeWidget);
  const needsBattery = widgets.some((widget) => widget.type === "battery");
  const needsLayer = widgets.some((widget) => widget.type === "layerText");
  const needsWpm = widgets.some((widget) => widget.type === "wpmGraph");
  const needsBle = widgets.some((widget) => widget.type === "bleProfiles");
  const imageWidgets = widgets.filter((widget) => widget.type === "image");
  const imageDefinitions = imageWidgets.map((widget) => {
    const bitmap = packedBitmap(widget);
    if (!bitmap) {
      return `/* Image widget ${widget.id} has no decoded asset yet. */`;
    }
    const name = cIdent(widget.id);
    return `static const uint8_t ${name}_bits[] = {
${formatByteArray(bitmap.bytes)}
};`;
  }).join("\n\n");

  const drawCalls = widgets.map((widget) => {
    if (widget.type === "battery") return `    draw_battery(${widget.x}, ${widget.y}, ${widget.width}, ${widget.height}, state.battery_level);`;
    if (widget.type === "layerText") {
      const align = widget.options.align || "left";
      return `    draw_text("${align}", ${widget.x}, ${widget.y}, ${widget.width}, state.layer_label);`;
    }
    if (widget.type === "bleProfiles") return `    draw_ble_profiles(${widget.x}, ${widget.y}, state.active_profile);`;
    if (widget.type === "wpmGraph") return `    draw_wpm_graph(${widget.x}, ${widget.y}, ${widget.width}, ${widget.height}, state.wpm);`;
    if (widget.type === "label") return `    draw_text("${widget.options.align || "left"}", ${widget.x}, ${widget.y}, ${widget.width}, "${String(widget.text || "").replace(/"/g, '\\"')}");`;
    if (widget.type === "image") {
      const bitmap = packedBitmap(widget);
      if (!bitmap) {
        return `    /* Image widget ${widget.id} skipped: asset is not decoded. */`;
      }
      return `    draw_bitmap(${widget.x}, ${widget.y}, ${bitmap.width}, ${bitmap.height}, ${cIdent(widget.id)}_bits);`;
    }
    return "";
  }).filter(Boolean).join("\n");

  const subscriptions = [
    needsBattery ? "ZMK_SUBSCRIPTION(generated_status, zmk_battery_state_changed);" : "",
    needsLayer ? "ZMK_SUBSCRIPTION(generated_status, zmk_layer_state_changed);" : "",
    needsWpm ? "ZMK_SUBSCRIPTION(generated_status, zmk_wpm_state_changed);" : "",
    needsBle ? "ZMK_SUBSCRIPTION(generated_status, zmk_ble_active_profile_changed);" : ""
  ].filter(Boolean).join("\n");

  return `/*
 * Generated by config/display-builder.
 * Copy this into a custom shield source file and include it from CMakeLists.txt.
 */

#include <lvgl.h>
#include <string.h>
#include <zephyr/kernel.h>
#include <zephyr/logging/log.h>
#include <zephyr/sys/util.h>

#include <zmk/battery.h>
#include <zmk/ble.h>
#include <zmk/display.h>
#include <zmk/event_manager.h>
#include <zmk/events/battery_state_changed.h>
#include <zmk/events/ble_active_profile_changed.h>
#include <zmk/events/layer_state_changed.h>
#include <zmk/events/wpm_state_changed.h>
#include <zmk/keymap.h>
#include <zmk/wpm.h>

LOG_MODULE_DECLARE(zmk, CONFIG_ZMK_LOG_LEVEL);

#define LOGICAL_W ${screen.width}
#define LOGICAL_H ${screen.height}
#define PHYSICAL_W ${screen.physicalWidth}
#define PHYSICAL_H ${screen.physicalHeight}
#define SCREEN_VERTICAL ${vertical ? 1 : 0}

static lv_obj_t *display_canvas;
static lv_obj_t *draw_canvas;
static lv_color_t display_cbuf[PHYSICAL_W * PHYSICAL_H];
static lv_color_t draw_cbuf[LOGICAL_W * LOGICAL_H];

static struct {
    uint8_t battery_level;
    uint8_t active_profile;
    uint8_t wpm;
    const char *layer_label;
} state = {
    .battery_level = 100,
    .active_profile = 0,
    .wpm = 0,
    .layer_label = "Base",
};

${imageDefinitions}

static void clear_canvas(void) {
    lv_draw_rect_dsc_t dsc;
    lv_draw_rect_dsc_init(&dsc);
    dsc.bg_color = lv_color_white();
    dsc.bg_opa = LV_OPA_COVER;
    lv_canvas_draw_rect(draw_canvas, 0, 0, LOGICAL_W, LOGICAL_H, &dsc);
}

static void draw_rect(int x, int y, int w, int h, bool filled) {
    lv_draw_rect_dsc_t dsc;
    lv_draw_rect_dsc_init(&dsc);
    dsc.bg_color = lv_color_black();
    dsc.bg_opa = filled ? LV_OPA_COVER : LV_OPA_TRANSP;
    dsc.border_color = lv_color_black();
    dsc.border_width = filled ? 0 : 1;
    lv_canvas_draw_rect(draw_canvas, x, y, w, h, &dsc);
}

static void draw_text(const char *align, int x, int y, int w, const char *text) {
    lv_draw_label_dsc_t dsc;
    lv_draw_label_dsc_init(&dsc);
    dsc.color = lv_color_black();
    dsc.font = &lv_font_unscii_8;
    dsc.align = LV_TEXT_ALIGN_LEFT;
    if (strcmp(align, "center") == 0) {
        dsc.align = LV_TEXT_ALIGN_CENTER;
    } else if (strcmp(align, "right") == 0) {
        dsc.align = LV_TEXT_ALIGN_RIGHT;
    }
    lv_canvas_draw_text(draw_canvas, x, y, w, &dsc, text);
}

static void draw_battery(int x, int y, int w, int h, uint8_t level) {
    int cap = 3;
    int body_w = w - cap - 1;
    int fill_w = ((body_w - 4) * level) / 100;
    draw_rect(x, y + 1, body_w, h - 2, false);
    draw_rect(x + body_w, y + (h / 3), cap, h / 3, true);
    draw_rect(x + 2, y + 3, fill_w, h - 6, true);
}

static void draw_bitmap(int x, int y, int w, int h, const uint8_t *bits) {
    for (int py = 0; py < h; py++) {
        for (int px = 0; px < w; px++) {
            int bit_index = py * w + px;
            uint8_t byte = bits[bit_index / 8];
            bool on = (byte & (1 << (7 - (bit_index % 8)))) != 0;
            if (on) {
                draw_rect(x + px, y + py, 1, 1, true);
            }
        }
    }
}

static void draw_ble_profiles(int x, int y, uint8_t active_profile) {
    static const int points[5][2] = {{8, 8}, {30, 8}, {52, 8}, {19, 26}, {41, 26}};
    lv_draw_arc_dsc_t arc;
    lv_draw_arc_dsc_init(&arc);
    arc.color = lv_color_black();
    arc.width = 1;

    for (int i = 0; i < 5; i++) {
        int cx = x + points[i][0];
        int cy = y + points[i][1];
        lv_canvas_draw_arc(draw_canvas, cx, cy, 6, 0, 360, &arc);
        if (active_profile == i) {
            lv_draw_arc_dsc_t fill;
            lv_draw_arc_dsc_init(&fill);
            fill.color = lv_color_black();
            fill.width = 5;
            lv_canvas_draw_arc(draw_canvas, cx, cy, 3, 0, 359, &fill);
        }
        char label[2] = {(char)('1' + i), '\\0'};
        draw_text("center", cx - 4, cy - 4, 8, label);
    }
}

static void draw_wpm_graph(int x, int y, int w, int h, uint8_t wpm) {
    draw_rect(x, y, w, h, false);
    int bar_w = w / 10;
    for (int i = 0; i < 10; i++) {
        int sample = (wpm * (i + 1)) / 10;
        int bar_h = (sample * (h - 3)) / 140;
        draw_rect(x + 1 + i * bar_w, y + h - 1 - bar_h, MAX(1, bar_w - 1), bar_h, true);
    }
}

static void redraw(void) {
    if (draw_canvas == NULL) {
        return;
    }
    clear_canvas();
${drawCalls || "    /* No visible widgets in config. */"}
#if SCREEN_VERTICAL
    lv_img_dsc_t img = {
        .header.cf = LV_IMG_CF_TRUE_COLOR,
        .header.w = LOGICAL_W,
        .header.h = LOGICAL_H,
        .data_size = sizeof(draw_cbuf),
        .data = (const uint8_t *)draw_cbuf,
    };
    lv_canvas_fill_bg(display_canvas, lv_color_white(), LV_OPA_COVER);
    /* If your panel is rotated the other way, change 900 to 2700. */
    lv_canvas_transform(display_canvas, &img, 900, LV_IMG_ZOOM_NONE, 0, 0, LOGICAL_W / 2,
                        LOGICAL_H / 2, true);
#endif
}

static int generated_status_listener(const zmk_event_t *eh) {
    const struct zmk_battery_state_changed *battery = as_zmk_battery_state_changed(eh);
    if (battery != NULL) {
        state.battery_level = battery->state_of_charge;
    }

    if (as_zmk_layer_state_changed(eh) != NULL) {
        zmk_keymap_layer_index_t layer = zmk_keymap_highest_layer_active();
        state.layer_label = zmk_keymap_layer_name(zmk_keymap_layer_index_to_id(layer));
        if (state.layer_label == NULL) {
            state.layer_label = "Layer";
        }
    }

    const struct zmk_wpm_state_changed *wpm = as_zmk_wpm_state_changed(eh);
    if (wpm != NULL) {
        state.wpm = wpm->state;
    }

    if (as_zmk_ble_active_profile_changed(eh) != NULL) {
        state.active_profile = zmk_ble_active_profile_index();
    }

    redraw();
    return ZMK_EV_EVENT_BUBBLE;
}

ZMK_LISTENER(generated_status, generated_status_listener);
${subscriptions || "/* Add ZMK_SUBSCRIPTION lines here when widgets bind to runtime state. */"}

lv_obj_t *zmk_display_status_screen(void) {
    lv_obj_t *screen = lv_obj_create(NULL);
    display_canvas = lv_canvas_create(screen);
    lv_canvas_set_buffer(display_canvas, display_cbuf, PHYSICAL_W, PHYSICAL_H, LV_IMG_CF_TRUE_COLOR);
    lv_obj_align(display_canvas, LV_ALIGN_TOP_LEFT, 0, 0);

#if SCREEN_VERTICAL
    draw_canvas = lv_canvas_create(screen);
    lv_canvas_set_buffer(draw_canvas, draw_cbuf, LOGICAL_W, LOGICAL_H, LV_IMG_CF_TRUE_COLOR);
    lv_obj_add_flag(draw_canvas, LV_OBJ_FLAG_HIDDEN);
#else
    draw_canvas = display_canvas;
#endif

    state.battery_level = zmk_battery_state_of_charge();
    state.active_profile = zmk_ble_active_profile_index();
    state.wpm = zmk_wpm_get_state();
    state.layer_label = "Base";

    redraw();
    return screen;
}
`;
}

function generateCmake(cfg) {
  const name = cIdent(cfg.screen.name || "generated_nice_view");
  return `if(CONFIG_ZMK_DISPLAY)
  zephyr_library_sources(${name}_status_screen.c)
endif()
`;
}

function generateConf() {
  return `CONFIG_ZMK_DISPLAY=y
CONFIG_ZMK_DISPLAY_BLANK_ON_IDLE=n
CONFIG_ZMK_DISPLAY_STATUS_SCREEN_CUSTOM=y
CONFIG_LV_FONT_UNSCII_8=y
CONFIG_ZMK_WPM=y
CONFIG_ZMK_DISPLAY_DEDICATED_THREAD_STACK_SIZE=4096
`;
}

function renderCode() {
  const outputs = {
    c: generateC(config),
    cmake: generateCmake(config),
    conf: generateConf(config)
  };
  $("codeOutput").value = outputs[outputTab];
  $("codeStatus").textContent = outputTab === "c"
    ? "Generated starter C for a custom ZMK status screen."
    : outputTab === "cmake"
      ? "Add this to the custom shield CMakeLists.txt."
      : "Add these settings to the custom shield .conf or your config .conf.";
}

function renderAll() {
  normalizeConfig(config);
  renderPreview();
  renderWidgetList();
  renderInspector();
  renderJson();
  renderCode();
}

function refreshFromInspector() {
  normalizeConfig(config);
  renderPreview();
  renderWidgetList();
  renderJson();
  renderCode();
}

function applyJson() {
  const status = $("jsonStatus");
  try {
    const next = JSON.parse($("jsonEditor").value);
    if (!next.screen || !Array.isArray(next.widgets)) {
      throw new Error("Config must include screen and widgets.");
    }
    config = normalizeConfig(next);
    selectedId = config.widgets[0]?.id || null;
    status.classList.remove("error");
    status.textContent = "Applied JSON config.";
    renderAll();
  } catch (error) {
    status.classList.add("error");
    status.textContent = error.message;
  }
}

function bindEvents() {
  document.querySelectorAll("[data-add]").forEach((button) => {
    button.addEventListener("click", () => addWidget(button.dataset.add));
  });

  $("deleteWidget").addEventListener("click", deleteSelected);
  $("addImage").addEventListener("click", () => {
    $("imageInput").click();
  });
  $("imageInput").addEventListener("change", (event) => {
    addImageFromFile(event.target.files[0]);
    event.target.value = "";
  });
  $("resetConfig").addEventListener("click", () => {
    assetCache.clear();
    config = clone(defaultConfig);
    selectedId = config.widgets[0].id;
    renderAll();
  });
  $("applyJson").addEventListener("click", applyJson);

  $("orientationState").addEventListener("input", (event) => {
    applyOrientation(event.target.value);
    renderAll();
  });

  $("batteryState").addEventListener("input", (event) => {
    state.battery.level = Number(event.target.value);
    renderPreview();
  });
  $("layerState").addEventListener("input", (event) => {
    state.layer.name = event.target.value;
    state.layer.index = ["Base", "Lower", "Raise"].indexOf(event.target.value);
    renderPreview();
  });
  $("wpmState").addEventListener("input", (event) => {
    state.wpm.current = Number(event.target.value);
    state.wpm.history.shift();
    state.wpm.history.push(state.wpm.current);
    renderPreview();
  });

  document.querySelectorAll("[data-output]").forEach((button) => {
    button.addEventListener("click", () => {
      outputTab = button.dataset.output;
      document.querySelectorAll(".tab").forEach((tab) => tab.classList.toggle("active", tab === button));
      renderCode();
    });
  });
}

bindEvents();
renderAll();
