const BUCKET = "diwali-photos";
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_SOURCE_BYTES = 24 * 1024 * 1024;
const MAX_IMAGE_EDGE = 1600;
const REFRESH_MS = 25000;
const TEXT_CLEARANCE = 12;
const CARD_CLEARANCE = 10;

const toast = document.getElementById("toast");
const photoPicker = document.getElementById("photoPicker");
const rsvpButton = document.getElementById("rsvpButton");
const rsvpSection = document.getElementById("rsvp");
const galleryStatus = document.getElementById("galleryStatus");
const cards = new Map();
let supabaseClient = null;
let visitorId = null;
let setupError = null;
let isUploading = false;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.setTimeout(() => toast.classList.remove("show"), 3200);
}

function setStatus(message) {
  if (galleryStatus.textContent === message) return;
  galleryStatus.textContent = message;
  if (cards.size) resizePhotosToFit();
}

function configured() {
  const config = window.DIWALI_CONFIG || {};
  return Boolean(
    config.supabaseUrl &&
    config.supabasePublishableKey &&
    !config.supabaseUrl.includes("YOUR-PROJECT-REF") &&
    !config.supabasePublishableKey.includes("YOUR_")
  );
}

function getCardBounds(card) {
  const margin = 18;
  return {
    margin,
    maxX: Math.max(margin, rsvpSection.clientWidth - card.offsetWidth - margin),
    maxY: Math.max(margin, rsvpSection.clientHeight - card.offsetHeight - margin)
  };
}

function getProtectedTextRects() {
  const sectionRect = rsvpSection.getBoundingClientRect();
  const elements = rsvpSection.querySelectorAll(".rsvp-content h2, .rsvp-content p, .rsvp-content button");
  const protectedRects = [];

  for (const element of elements) {
    const rects = [];
    if (element.matches("button")) {
      rects.push(element.getBoundingClientRect());
    } else {
      const range = document.createRange();
      range.selectNodeContents(element);
      rects.push(...range.getClientRects());
      range.detach();
    }

    for (const rect of rects) {
      if (!rect.width || !rect.height) continue;
      protectedRects.push({
        left: rect.left - sectionRect.left - TEXT_CLEARANCE,
        top: rect.top - sectionRect.top - TEXT_CLEARANCE,
        right: rect.right - sectionRect.left + TEXT_CLEARANCE,
        bottom: rect.bottom - sectionRect.top + TEXT_CLEARANCE
      });
    }
  }
  return protectedRects;
}

function overlapsProtectedText(x, y, card, protectedRects = getProtectedTextRects()) {
  const left = x - CARD_CLEARANCE;
  const top = y - CARD_CLEARANCE;
  const right = x + card.offsetWidth + CARD_CLEARANCE;
  const bottom = y + card.offsetHeight + CARD_CLEARANCE;
  return protectedRects.some((rect) =>
    left < rect.right && right > rect.left && top < rect.bottom && bottom > rect.top
  );
}

function findNearestClearPosition(card, preferredX, preferredY, protectedRects = getProtectedTextRects()) {
  const { margin, maxX, maxY } = getCardBounds(card);
  let best = null;
  let bestDistance = Infinity;
  const step = 14;

  for (let y = margin; y <= maxY; y += step) {
    for (let x = margin; x <= maxX; x += step) {
      if (overlapsProtectedText(x, y, card, protectedRects)) continue;
      const distance = (x - preferredX) ** 2 + (y - preferredY) ** 2;
      if (distance < bestDistance) {
        best = { x, y };
        bestDistance = distance;
      }
    }
  }
  return best;
}

function placeCardRandomly(card) {
  const { margin, maxX, maxY } = getCardBounds(card);
  const protectedRects = getProtectedTextRects();
  let position = null;
  for (let attempt = 0; attempt < 500; attempt++) {
    const x = margin + Math.random() * Math.max(0, maxX - margin);
    const y = margin + Math.random() * Math.max(0, maxY - margin);
    if (!overlapsProtectedText(x, y, card, protectedRects)) {
      position = { x, y };
      break;
    }
  }
  if (!position) position = findNearestClearPosition(card, margin, margin);
  card.style.left = `${position?.x ?? margin}px`;
  card.style.top = `${position?.y ?? margin}px`;
  card.style.setProperty("--tilt", `${(Math.random() * 12 - 6).toFixed(1)}deg`);
}

function makeDraggable(card) {
  let startX = 0;
  let startY = 0;
  let originX = 0;
  let originY = 0;

  card.addEventListener("pointerdown", (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    event.preventDefault();
    card.setPointerCapture(event.pointerId);
    card.classList.add("is-dragging");
    startX = event.clientX;
    startY = event.clientY;
    originX = parseFloat(card.style.left) || 0;
    originY = parseFloat(card.style.top) || 0;
  });

  card.addEventListener("pointermove", (event) => {
    if (!card.hasPointerCapture(event.pointerId)) return;
    const { margin, maxX, maxY } = getCardBounds(card);
    card.style.left = `${Math.max(margin, Math.min(maxX, originX + event.clientX - startX))}px`;
    card.style.top = `${Math.max(margin, Math.min(maxY, originY + event.clientY - startY))}px`;
  });

  const stopDragging = (event) => {
    card.classList.remove("is-dragging");
    if (card.hasPointerCapture(event.pointerId)) card.releasePointerCapture(event.pointerId);
    const currentX = parseFloat(card.style.left) || 0;
    const currentY = parseFloat(card.style.top) || 0;
    if (overlapsProtectedText(currentX, currentY, card)) {
      const clearPosition = findNearestClearPosition(card, currentX, currentY);
      if (clearPosition) {
        card.style.left = `${clearPosition.x}px`;
        card.style.top = `${clearPosition.y}px`;
      }
      showToast("Polaroids stay clear of the RSVP text.");
    }
  };
  card.addEventListener("pointerup", stopDragging);
  card.addEventListener("pointercancel", stopDragging);

  card.addEventListener("keydown", (event) => {
    const directions = {
      ArrowLeft: [-1, 0],
      ArrowRight: [1, 0],
      ArrowUp: [0, -1],
      ArrowDown: [0, 1]
    };
    const direction = directions[event.key];
    if (!direction) return;
    event.preventDefault();
    const { margin, maxX, maxY } = getCardBounds(card);
    const step = event.shiftKey ? 25 : 10;
    const nextX = Math.max(margin, Math.min(maxX, (parseFloat(card.style.left) || 0) + direction[0] * step));
    const nextY = Math.max(margin, Math.min(maxY, (parseFloat(card.style.top) || 0) + direction[1] * step));
    if (!overlapsProtectedText(nextX, nextY, card)) {
      card.style.left = `${nextX}px`;
      card.style.top = `${nextY}px`;
    } else {
      const clearPosition = findNearestClearPosition(card, nextX, nextY);
      if (clearPosition) {
        card.style.left = `${clearPosition.x}px`;
        card.style.top = `${clearPosition.y}px`;
      }
    }
  });
}

function addPhotoCard(fileName, publicUrl) {
  const card = document.createElement("article");
  card.className = "polaroid";
  card.tabIndex = 0;
  card.setAttribute("role", "group");
  card.setAttribute("aria-label", "A shared Diwali Polaroid. Drag to arrange it, or use the arrow keys.");

  const image = document.createElement("img");
  image.src = publicUrl;
  image.alt = "A photo shared on the Diwali memory wall";
  image.draggable = false;
  image.decoding = "async";
  image.referrerPolicy = "no-referrer";
  image.addEventListener("error", () => {
    card.remove();
    cards.delete(fileName);
    setStatus("One photo could not be loaded. The shared wall will keep refreshing.");
  }, { once: true });

  const caption = document.createElement("span");
  caption.className = "polaroid-caption";
  caption.textContent = "Diwali memories ✳";
  card.append(image, caption);
  rsvpSection.appendChild(card);
  placeCardRandomly(card);
  makeDraggable(card);
  cards.set(fileName, card);
}

function updateGalleryStatus(count) {
  const ownFileName = visitorId ? `${visitorId}.webp` : "";
  const hasOwnPhoto = Boolean(ownFileName && cards.has(ownFileName));
  if (count === 0) {
    setStatus("No RSVPs yet. Be the first to add your Polaroid!");
  } else if (hasOwnPhoto) {
    setStatus(`${count} ${count === 1 ? "Polaroid RSVP" : "Polaroid RSVPs"} on the guest wall · your RSVP is counted`);
  } else {
    setStatus(`${count} ${count === 1 ? "Polaroid RSVP" : "Polaroid RSVPs"} on the guest wall · add yours with “Count me in”`);
  }
}

async function loadSharedPhotos(quiet = false) {
  try {
    const allFiles = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await supabaseClient.storage.from(BUCKET).list("", {
        limit: 1000,
        offset,
        sortBy: { column: "created_at", order: "asc" }
      });
      if (error) throw error;
      const page = (data || []).filter((file) => file.name && file.name.endsWith(".webp"));
      allFiles.push(...page);
      if (!data || data.length < 1000) break;
    }

    const visibleNames = new Set(allFiles.map((file) => file.name));
    for (const [name, card] of cards) {
      if (!visibleNames.has(name)) {
        card.remove();
        cards.delete(name);
      }
    }

    // Shuffle only on a fresh page load; periodic refreshes add newcomers without moving existing photos.
    const newFiles = allFiles.filter((file) => !cards.has(file.name));
    for (let i = newFiles.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [newFiles[i], newFiles[j]] = [newFiles[j], newFiles[i]];
    }
    for (const file of newFiles) {
      const { data } = supabaseClient.storage.from(BUCKET).getPublicUrl(file.name);
      addPhotoCard(file.name, data.publicUrl);
    }
    updateGalleryStatus(cards.size);
  } catch (error) {
    console.error("Could not load the shared Diwali photos:", error);
    if (!quiet || cards.size === 0) setStatus("Could not connect to the shared photo wall. Check the setup and try refreshing.");
  }
}

function resizePhotosToFit() {
  const protectedRects = getProtectedTextRects();
  for (const card of cards.values()) {
    const { margin, maxX, maxY } = getCardBounds(card);
    let x = Math.max(margin, Math.min(maxX, parseFloat(card.style.left) || margin));
    let y = Math.max(margin, Math.min(maxY, parseFloat(card.style.top) || margin));
    if (overlapsProtectedText(x, y, card, protectedRects)) {
      const clearPosition = findNearestClearPosition(card, x, y, protectedRects);
      if (clearPosition) ({ x, y } = clearPosition);
    }
    card.style.left = `${x}px`;
    card.style.top = `${y}px`;
  }
}

function canvasBlob(canvas, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("This browser could not prepare the photo."));
    }, "image/webp", quality);
  });
}

async function convertToWebp(file) {
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file for your Polaroid.");
  if (file.size > MAX_SOURCE_BYTES) throw new Error("Please choose a photo smaller than 24 MB.");
  if (!window.createImageBitmap) throw new Error("This browser cannot prepare the photo. Try a recent version of Chrome, Safari, Firefox, or Edge.");

  const bitmap = await createImageBitmap(file);
  try {
    const scale = Math.min(1, MAX_IMAGE_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("This browser could not prepare the photo.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    for (const quality of [0.84, 0.74, 0.64, 0.54]) {
      const blob = await canvasBlob(canvas, quality);
      if (blob.type !== "image/webp") throw new Error("This browser cannot convert photos to WebP. Try a recent browser.");
      if (blob.size <= MAX_UPLOAD_BYTES) return blob;
    }
    throw new Error("That photo is still too large after compression. Try a smaller image.");
  } finally {
    bitmap.close();
  }
}

function celebrateUpload() {
  const holder = document.getElementById("confetti");
  const colors = ["#f3c849", "#ed4938", "#153f32", "#f45c88", "#fff0cb", "#16376c"];
  for (let i = 0; i < 55; i++) {
    const piece = document.createElement("i");
    piece.className = "confetto";
    piece.style.left = `${Math.random() * 100}%`;
    piece.style.background = colors[Math.floor(Math.random() * colors.length)];
    piece.style.animationDelay = `${Math.random() * 0.7}s`;
    piece.style.transform = `rotate(${Math.random() * 360}deg)`;
    holder.appendChild(piece);
    window.setTimeout(() => piece.remove(), 3400);
  }
}

async function uploadPhoto(file) {
  if (!visitorId) throw new Error("The shared photo wall is still connecting. Please try again in a moment.");
  const fileName = `${visitorId}.webp`;
  if (cards.has(fileName)) throw new Error("You already added a Polaroid from this browser.");

  const photo = await convertToWebp(file);
  const { error } = await supabaseClient.storage.from(BUCKET).upload(fileName, photo, {
    cacheControl: "3600",
    contentType: "image/webp",
    upsert: false
  });
  if (error) {
    if (error.message && /already exists|duplicate/i.test(error.message)) {
      throw new Error("You already added a Polaroid from this browser.");
    }
    throw error;
  }
  await loadSharedPhotos(true);
  showToast("Your RSVP is on the guest wall! Drag your Polaroid to find its spot.");
  celebrateUpload();
}

async function initialize() {
  if (!configured()) {
    setupError = "Add your Supabase URL and publishable key in config.js, then follow README.md.";
    setStatus("Shared photo wall setup needed · see README.md");
    return;
  }
  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    setupError = "The Supabase browser library could not be loaded. Check your internet connection and refresh.";
    setStatus(setupError);
    return;
  }

  try {
    const { supabaseUrl, supabasePublishableKey } = window.DIWALI_CONFIG;
    supabaseClient = window.supabase.createClient(supabaseUrl, supabasePublishableKey);
    setStatus("Connecting to the shared photo wall…");
    let { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    if (!data.session) {
      ({ data, error } = await supabaseClient.auth.signInAnonymously());
      if (error) throw error;
    }
    visitorId = data.session?.user?.id || data.user?.id || null;
    if (!visitorId) throw new Error("The visitor session could not be created.");

    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    await loadSharedPhotos();
    window.setInterval(() => {
      if (document.visibilityState === "visible") loadSharedPhotos(true);
    }, REFRESH_MS);
  } catch (error) {
    console.error("Could not initialize the shared Diwali photo wall:", error);
    setStatus("Could not start the shared wall. Check Supabase setup and refresh the page.");
  }
}

rsvpButton.addEventListener("click", () => {
  if (setupError) {
    showToast(setupError);
    return;
  }
  if (isUploading) return;
  if (!visitorId) {
    showToast("The shared photo wall is still connecting. Please try again in a moment.");
    return;
  }
  if (cards.has(`${visitorId}.webp`)) {
    showToast("Your RSVP is already on the guest wall from this browser.");
    return;
  }
  photoPicker.click();
});

photoPicker.addEventListener("change", async () => {
  const file = photoPicker.files && photoPicker.files[0];
  photoPicker.value = "";
  if (!file) return;

  isUploading = true;
  rsvpButton.disabled = true;
  const originalLabel = rsvpButton.textContent;
  rsvpButton.textContent = "Adding your photo…";
  try {
    await uploadPhoto(file);
  } catch (error) {
    console.error("Could not share this photo:", error);
    showToast(error.message || "Could not upload the photo. Please try again.");
  } finally {
    isUploading = false;
    rsvpButton.disabled = false;
    rsvpButton.textContent = originalLabel;
  }
});

window.addEventListener("resize", resizePhotosToFit);
document.querySelectorAll(".check input").forEach((input) => input.addEventListener("change", () => {
  const count = [...document.querySelectorAll(".check input:checked")].length;
  if (count === 6) showToast("Fully packed. Main character status unlocked.");
  else showToast(`${count} / 6 packed. You’re getting there.`);
}));

initialize();
