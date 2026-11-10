/* ------------------------------------------------------------------ */
/* WHAT'S ON THE PAGE ROUND THE 3D VIEW: the title screen, the heart   */
/* wipe between zones, the zone's name, the controls hint, the "click  */
/* to look around" hint, the letter window and the mute button. The    */
/* markup is in index.html and the styling in ui.css.                  */
/* ------------------------------------------------------------------ */
const HINT_TIME = 10;    // seconds the controls hint stays up
const FLOATING_HEARTS = 16;

const $ = (id) => document.getElementById(id);

/* ------------------------------------------------------------------ */
/* TITLE SCREEN                                                         */
/* ------------------------------------------------------------------ */
const titleEl = $('title'), titleFill = $('title-fill');
let shownProgress = 0, targetProgress = 0;

for (let i = 0; i < FLOATING_HEARTS; i++) {
  const heart = document.createElement('span');
  heart.textContent = '♥';
  heart.style.left = `${Math.random() * 100}%`;
  heart.style.fontSize = `${0.8 + Math.random() * 1.8}rem`;
  heart.style.animationDuration = `${9 + Math.random() * 10}s`;
  heart.style.animationDelay = `${-Math.random() * 15}s`;
  $('title-hearts').append(heart);
}

// The heart eases up toward the real progress (0..1), so it never jumps
function fillHeart() {
  shownProgress += (targetProgress - shownProgress) * 0.12;
  titleFill.setAttribute('y', 100 * (1 - shownProgress));
  titleFill.setAttribute('height', 100 * shownProgress);
  if (!titleEl.hidden) requestAnimationFrame(fillHeart);
}
fillHeart();

export function setTitleProgress(fraction) {
  targetProgress = Math.max(targetProgress, Math.min(1, fraction));
}

// Everything's loaded: wait for a key press or click, then call `onBegin`
export function titleReady(onBegin) {
  targetProgress = 1;
  titleEl.classList.remove('loading');
  const begin = (e) => {
    if (e.type === 'keydown' && (e.ctrlKey || e.altKey || e.metaKey || e.key === 'Tab' || e.key === 'Escape' || /^F\d+$/.test(e.key))) return;
    removeEventListener('keydown', begin);
    removeEventListener('pointerdown', begin);
    onBegin();
  };
  // On the window, like audio.js's listeners, which were added first: the sound has to be up by then
  addEventListener('keydown', begin);
  addEventListener('pointerdown', begin);
}

export function hideTitle() {
  titleEl.hidden = true;
}

/* ------------------------------------------------------------------ */
/* THE HEART WIPE                                                       */
/* ------------------------------------------------------------------ */
const wipeEl = $('wipe'), wipeHeart = $('wipe-heart'), wipeFill = $('wipe-fill');

// 0 = clear, 1 = the heart has closed and the screen is fully covered. It closes on
// the middle of the screen, which is where the character stands
export function setWipe(amount, color) {
  wipeEl.toggleAttribute('hidden', amount <= 0); // it's an SVG, which has no .hidden
  if (amount <= 0) return;
  if (color !== undefined) wipeFill.setAttribute('fill', `#${color.toString(16).padStart(6, '0')}`);
  // Radius 26 of the heart's 100-unit box fits inside it, so this is big enough to clear the corners
  const cover = Math.hypot(innerWidth, innerHeight) / 2 / 26;
  const scale = cover * (1 - amount) ** 2.3;
  wipeHeart.setAttribute('transform', `translate(${innerWidth / 2} ${innerHeight / 2}) scale(${scale}) translate(-50 -47)`);
}

// Runs the wipe on its own, for when the game loop isn't going yet (the title screen)
export function closeWipe(seconds, color) {
  return new Promise((resolve) => {
    const start = performance.now();
    const step = (now) => {
      const amount = Math.min(1, (now - start) / 1000 / seconds);
      setWipe(amount, color);
      if (amount < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

/* ------------------------------------------------------------------ */
/* THE ZONE'S NAME AND THE CONTROLS HINT                                */
/* ------------------------------------------------------------------ */
const zoneNameEl = $('zone-name');
export function showZoneName(text) {
  zoneNameEl.textContent = text;
  zoneNameEl.hidden = true;
  void zoneNameEl.offsetWidth; // restart the animation
  zoneNameEl.hidden = false;
}
zoneNameEl.addEventListener('animationend', () => { zoneNameEl.hidden = true; });

export function showHint() {
  const hint = $('hint');
  hint.hidden = false;
  setTimeout(() => {
    hint.classList.add('gone');
    setTimeout(() => { hint.hidden = true; }, 900);
  }, HINT_TIME * 1000);
}

export function showPrompt(show) {
  $('prompt').hidden = !show;
}

// "Click to look around", while the mouse isn't turning the camera. It waits while the zone's name is up (see ui.css)
export function showLookHint(show) {
  $('look-hint').hidden = !show;
}

/* ------------------------------------------------------------------ */
/* MUTE BUTTON                                                          */
/* ------------------------------------------------------------------ */
const muteEl = $('mute');
export function setMuted(muted) {
  muteEl.classList.toggle('muted', muted);
  muteEl.setAttribute('aria-label', muted ? 'Unmute sound (M)' : 'Mute sound (M)');
  muteEl.title = muted ? 'Unmute sound (M)' : 'Mute sound (M)';
}
export function showMuteButton(onClick) {
  muteEl.hidden = false;
  muteEl.addEventListener('click', () => {
    onClick();
    muteEl.blur(); // or Space would press it again instead of jumping
  });
}

/* ------------------------------------------------------------------ */
/* THE LETTER                                                           */
/* ------------------------------------------------------------------ */
const letterEl = $('message');

// A blank line in `text` starts a new paragraph. `aside` moves it out of the middle (the party's finale)
export function openLetter(title, text, aside = false) {
  letterEl.classList.remove('closing');
  letterEl.classList.toggle('finale', aside);
  letterEl.querySelector('h2').textContent = title;
  letterEl.querySelector('.body').replaceChildren(...text.split(/\n\s*\n/).map((para, i) => {
    const p = document.createElement('p');
    p.textContent = para.trim();
    p.style.setProperty('--line', i);
    return p;
  }));
  letterEl.hidden = true;
  void letterEl.offsetWidth; // restart the animation
  letterEl.hidden = false;
}
export function closeLetter() {
  letterEl.classList.add('closing');
}
// The mouse wheel scrolls a long letter wherever the pointer is
addEventListener('wheel', (e) => {
  if (!letterEl.hidden && !letterEl.contains(e.target)) letterEl.querySelector('.body').scrollTop += e.deltaY;
}, { passive: true });
letterEl.addEventListener('animationend', (e) => {
  if (e.target === letterEl && letterEl.classList.contains('closing')) letterEl.hidden = true;
});
