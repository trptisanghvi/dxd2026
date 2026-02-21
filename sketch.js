/* eslint-env browser */
/* global p5 */

// Ridership-derived hourly brightness (0–255), index = hour 0–23
const BRIGHTNESS_123 = [34, 16, 9, 6, 7, 25, 60, 114, 161, 126, 99, 102, 112, 124, 144, 182, 216, 255, 202, 137, 106, 100, 96, 59];
const BRIGHTNESS_456 = [21, 9, 5, 4, 6, 16, 35, 70, 95, 71, 60, 66, 76, 87, 106, 139, 162, 193, 148, 97, 71, 56, 48, 35];
const BRIGHTNESS_NQR = [32, 16, 9, 6, 7, 19, 43, 78, 110, 93, 78, 86, 97, 110, 132, 170, 201, 241, 191, 132, 104, 95, 86, 56];

let flock123, flock456, flockNQR;
let wanderer;
let wandererHistory = [];
let pctFree = 1;
let bezOffset = 0.2;
let size = 8;
let birdMaxSpeed = 3;
let birdMaxForce = 0.04;
let birdStroke = 1.5;
let numBirds = 90;
let mtaCardImg;
let cardWidth = 22;
let cardHeight = 14;
let wandererHistoryCount = 200;
/** Top of page only; boids below this wrap back in from another edge (map panel area) */
let flyZoneBottom = 0;

if (window.innerWidth < 600) {
  size = 6;
  wandererHistoryCount = 140;
  birdMaxSpeed = 2;
  birdStroke = 1;
  numBirds = Math.floor(numBirds * 0.6);
  cardWidth = 16;
  cardHeight = 10;
} else if (window.innerWidth > 1800) {
  size = 10;
  wandererHistoryCount = 240;
  birdStroke = 2;
  cardWidth = 28;
  cardHeight = 18;
}

function preload() {
  mtaCardImg = loadImage('assets/mta-card.png');
}

function getRidershipBrightness(lineId) {
  const h = new Date().getHours();
  const arr = lineId === '123' ? BRIGHTNESS_123 : lineId === '456' ? BRIGHTNESS_456 : BRIGHTNESS_NQR;
  const b = arr[h];
  const m = new Date().getMinutes();
  const next = arr[(h + 1) % 24];
  return b + (next - b) * (m / 60);
}

function setup() {
  const container = document.getElementById('canvas-container');
  const w = container ? container.offsetWidth : window.innerWidth;
  const h = container ? container.offsetHeight : window.innerHeight;
  const canvas = createCanvas(w, h);
  canvas.parent('canvas-container');
  frameRate(60);

  flyZoneBottom = h;

  // Resize canvas when container size changes (e.g. mobile layout / orientation)
  const containerEl = document.getElementById('canvas-container');
  if (containerEl && typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(function () {
      windowResized();
    });
    ro.observe(containerEl);
  }

  wanderer = new Wanderer();
  for (let i = 0; i < wandererHistoryCount; i++) {
    wanderer.update();
  }

  const ctrMult = 0.1;
  const sepMult = 2;
  const cohMult = 0.5;

  flock123 = new Flock('123', ctrMult, sepMult, cohMult);
  flock456 = new Flock('456', ctrMult, sepMult, cohMult);
  flockNQR = new Flock('nqr', ctrMult, sepMult, cohMult);

  [flock123, flock456, flockNQR].forEach((flock, idx) => {
    const centerX = width / 2 + (idx - 1) * (width * 0.08);
    const centerY = flyZoneBottom / 2 + (idx - 1) * (flyZoneBottom * 0.03);
    const radius = min((width + flyZoneBottom) / 8, flyZoneBottom / 2 - 20);
    for (let i = 0; i < numBirds; i++) {
      const angle = random(TWO_PI);
      const r = sqrt(random()) * radius;
      const x = centerX + r * cos(angle);
      const y = centerY + r * sin(angle);
      flock.addBoid(new Boid(x, y, ctrMult, sepMult, cohMult, flock.lineId));
    }
  });
}

function draw() {
  background(10, 14, 18);
  const bright123 = getRidershipBrightness('123');
  const bright456 = getRidershipBrightness('456');
  const brightNQR = getRidershipBrightness('nqr');

  wanderer.update();
  flock123.run(bright123);
  flock456.run(bright456);
  flockNQR.run(brightNQR);
}

// --- Flock ---
function Flock(lineId, ctrMult, sepMult, cohMult) {
  this.boids = [];
  this.lineId = lineId;
  this.ctrMult = ctrMult;
  this.sepMult = sepMult;
  this.cohMult = cohMult;
}

Flock.prototype.run = function (brightness) {
  for (let i = 0; i < this.boids.length; i++) {
    this.boids[i].run(this.boids, brightness);
  }
};

Flock.prototype.addBoid = function (b) {
  this.boids.push(b);
};

// --- Boid ---
function Boid(x, y, ctrMult, sepMult, cohMult, lineId) {
  this.acceleration = createVector(0, 0);
  this.velocity = createVector(random(-1, 1), random(-1, 1));
  this.position = createVector(x, y);
  this.r = 3;
  this.maxspeed = birdMaxSpeed;
  this.maxforce = birdMaxForce;
  this.wingDown = true;
  this.angle = random(PI / 18, PI / 3);
  this.tilt = 0;
  this.flapSpeed = 0.1;
  this.type = random() > pctFree ? 'free' : 'murm';
  this.ctrMult = ctrMult;
  this.sepMult = sepMult;
  this.cohMult = cohMult;
  this.borderz = true;
  this.lineId = lineId;
  this.delay = Math.floor(random(wandererHistoryCount));
}

Boid.prototype.run = function (boids, brightness) {
  this.flock(boids);
  this.update();
  if (this.borderz) this.borders();
  this.flap();
  this.render(brightness);
};

Boid.prototype.applyForce = function (force) {
  this.acceleration.add(force);
};

Boid.prototype.flock = function (boids) {
  let sep = this.separate(boids);
  let coh = this.cohesion(boids);
  let ctr = this.center();
  sep.mult(this.sepMult);
  coh.mult(this.cohMult);
  ctr.mult(this.ctrMult);
  this.applyForce(sep);
  if (this.type === 'murm') {
    this.applyForce(coh);
    this.applyForce(ctr);
  }
  if (random() > 0.995) {
    this.type = this.type === 'murm' ? 'free' : 'murm';
  }
};

Boid.prototype.update = function () {
  this.velocity.add(this.acceleration);
  this.angle += this.acceleration.mag();
  if (this.velocity.y < 0) this.angle -= this.flapSpeed * (this.velocity.y * 0.2);
  this.velocity.limit(this.maxspeed);
  this.position.add(this.velocity);
  this.acceleration.mult(0);
  if (random() > 0.9995) this.delay = Math.floor(random(wandererHistoryCount));
};

Boid.prototype.flap = function () {}

Boid.prototype.seek = function (target) {
  let desired = p5.Vector.sub(target, this.position);
  desired.normalize();
  desired.mult(this.maxspeed);
  let steer = p5.Vector.sub(desired, this.velocity);
  steer.limit(this.maxforce);
  return steer;
};

Boid.prototype.getColor = function (brightness) {
  const t = brightness / 255;
  if (this.lineId === '123') return [255 * t, 60 * t, 53 * t];   // red
  if (this.lineId === '456') return [67 * t, 160 * t, 71 * t];  // green
  return [249 * t, 168 * t, 37 * t];                             // yellow (NQR)
};

/** Alpha for card tint so text stays readable (0–255). */
const CARD_TINT_ALPHA = 155;

Boid.prototype.render = function (brightness) {
  push();
  translate(this.position.x, this.position.y);
  this.tilt += random(-0.01, 0.01);
  this.tilt = constrain(this.tilt, -0.04, 0.04);
  rotate(map(this.velocity.x, -1, 1, -0.01, 0.01) + this.tilt);

  if (mtaCardImg && mtaCardImg.width > 0) {
    imageMode(CENTER);
    const c = this.getColor(brightness);
    const alpha = CARD_TINT_ALPHA * (0.6 + 0.4 * (brightness / 255));
    tint(c[0], c[1], c[2], alpha);
    image(mtaCardImg, 0, 0, cardWidth, cardHeight);
    noTint();
  } else {
    noFill();
    stroke(this.getColor(brightness));
    strokeWeight(birdStroke);
    strokeJoin(ROUND);
    let delta = size * sin(this.angle);
    let deltaFlap = size * sin(this.angle + 0.5) * 0.5 - size / 4;
    let flapX = size * 0.5;
    let wing = size;
    delta *= min(1.5, 1.05 - this.velocity.y / this.maxspeed);
    wing += max(0.1, 0.6 * size * this.velocity.y / this.maxspeed);
    let centerY = 4;
    beginShape();
    vertex(-wing, delta);
    bezierVertex(-flapX, deltaFlap, 0, centerY, 0, centerY);
    bezierVertex(0, centerY, flapX, deltaFlap, wing, delta);
    endShape();
  }
  pop();
};

Boid.prototype.borders = function () {
  // Horizontal wrap
  if (this.position.x < -width / 4) this.position.x = width + this.r;
  if (this.position.x > width + width / 4) this.position.x = -this.r;
  // Keep flock in top of page (above truncated map); wrap back in from another edge
  if (this.position.y > flyZoneBottom) {
    const edge = Math.floor(random(3));
    if (edge === 0) {
      this.position.y = random(0, 40);
      this.position.x = random(0, width);
    } else if (edge === 1) {
      this.position.x = random(0, 30);
      this.position.y = random(0, flyZoneBottom);
    } else {
      this.position.x = random(width - 30, width);
      this.position.y = random(0, flyZoneBottom);
    }
  }
  if (this.position.y < 0) {
    this.position.y = flyZoneBottom - random(0, 30);
    this.position.x = constrain(this.position.x, 0, width);
  }
};

Boid.prototype.separate = function (boids) {
  let desiredseparation = size * 4;
  let steer = createVector(0, 0);
  let count = 0;
  for (let i = 0; i < boids.length; i++) {
    let d = p5.Vector.dist(this.position, boids[i].position);
    if (d > 0 && d < desiredseparation) {
      let diff = p5.Vector.sub(this.position, boids[i].position);
      diff.normalize();
      diff.div(d);
      steer.add(diff);
      count++;
    }
  }
  if (count > 0) steer.div(count);
  if (steer.mag() > 0) {
    steer.normalize();
    steer.mult(this.maxspeed);
    steer.sub(this.velocity);
    steer.limit(this.maxforce);
  }
  return steer;
};

Boid.prototype.center = function () {
  let center;
  if (wandererHistory.length > this.delay) {
    center = wandererHistory[this.delay];
  } else {
    center = wanderer.position;
  }
  let diff = p5.Vector.sub(this.position, center);
  diff.normalize();
  diff.mult(-1);
  return diff;
};

Boid.prototype.cohesion = function (boids) {
  let neighbordist = 50;
  let sum = createVector(0, 0);
  let count = 0;
  for (let i = 0; i < boids.length; i++) {
    let d = p5.Vector.dist(this.position, boids[i].position);
    if (d > 0 && d < neighbordist) {
      sum.add(boids[i].position);
      count++;
    }
  }
  if (count > 0) {
    sum.div(count);
    return this.seek(sum);
  }
  return createVector(0, 0);
};

// --- Wanderer ---
function Wanderer() {
  this.position = createVector(width / 3, flyZoneBottom / 2);
  this.velocity = createVector(0, 0);
  this.acceleration = createVector(0, 0);
  this.maxSpeed = 6;
  this.maxForce = 0.05;
  this.boxWidth = 0.66 * width;
  this.boxHeight = 0.4 * flyZoneBottom;
  this.centerX = width / 3;
  this.centerY = flyZoneBottom / 2;
}

Wanderer.prototype.update = function () {
  let angle = noise(this.position.x * 0.01, this.position.y * 0.01, frameCount * 0.01) * TWO_PI * 2;
  let newForce = p5.Vector.fromAngle(angle);
  newForce.setMag(this.maxForce);
  this.acceleration.add(newForce);
  this.stayInBox();
  this.velocity.add(this.acceleration);
  this.velocity.limit(this.maxSpeed);
  this.position.add(this.velocity);
  this.acceleration.mult(0);
  wandererHistory.push(this.position.copy());
  if (wandererHistory.length > wandererHistoryCount) wandererHistory.shift();
};

Wanderer.prototype.stayInBox = function () {
  let edgeForce = createVector(0, 0);
  let efScale = 2;
  if (this.position.x < this.centerX - this.boxWidth / 2) edgeForce.x = this.maxForce * efScale;
  else if (this.position.x > this.centerX + this.boxWidth / 2) edgeForce.x = -this.maxForce * efScale;
  if (this.position.y < this.centerY - this.boxHeight / 2) edgeForce.y = this.maxForce * efScale;
  else if (this.position.y > this.centerY + this.boxHeight / 2) edgeForce.y = -this.maxForce * efScale;
  this.acceleration.add(edgeForce);
};

// p5 resize: use canvas container dimensions (left column in vertical layout)
function windowResized() {
  const container = document.getElementById('canvas-container');
  const w = container ? container.offsetWidth : window.innerWidth;
  const h = container ? container.offsetHeight : window.innerHeight;
  resizeCanvas(w, h);
  flyZoneBottom = h;
}
