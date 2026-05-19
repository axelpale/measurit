const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// In-Memory Database
let nextPointId = 5;
let nextDistanceId = 7;

let points = [
  { id: '1', label: 'A' },
  { id: '2', label: 'B' },
  { id: '3', label: 'C' },
  { id: '4', label: 'D' }
];

let distances = [
  { id: 'd1', point1Id: '1', point2Id: '2', distance: 300 }, // A-B
  { id: 'd2', point1Id: '2', point2Id: '3', distance: 300 }, // B-C
  { id: 'd3', point1Id: '3', point2Id: '1', distance: 300 }, // C-A
  { id: 'd4', point1Id: '1', point2Id: '4', distance: 250 }, // A-D
  { id: 'd5', point1Id: '2', point2Id: '4', distance: 250 }, // B-D
  { id: 'd6', point1Id: '3', point2Id: '4', distance: 250 }  // C-D
];

let coordinates = {};
let solveSuccess = false;

/**
 * 3D Coordinate Recovery Solver using Stress Minimization (Gradient Descent with Momentum)
 */
function solve3DCoordinates() {
  if (points.length < 4 || distances.length < 4) {
    coordinates = {};
    solveSuccess = false;
    return;
  }

  const N = points.length;
  const ids = points.map(p => p.id);
  const idToIndex = {};
  ids.forEach((id, index) => {
    idToIndex[id] = index;
  });

  // 1. Initialize coordinates randomly in a 3D box
  const coords = [];
  const velocity = [];
  for (let i = 0; i < N; i++) {
    coords.push({
      x: (Math.random() - 0.5) * 100,
      y: (Math.random() - 0.5) * 100,
      z: (Math.random() - 0.5) * 100
    });
    velocity.push({ x: 0, y: 0, z: 0 });
  }

  // Convert distance records to simplified links for solving
  const links = distances
    .map(d => {
      const idx1 = idToIndex[d.point1Id];
      const idx2 = idToIndex[d.point2Id];
      return {
        i: idx1,
        j: idx2,
        d: d.distance // distance in cm
      };
    })
    .filter(link => link.i !== undefined && link.j !== undefined);

  // 2. Gradient Descent Loop (Stress Majorization approximation)
  const iterations = 1000;
  const alpha = 0.08; // Learning rate
  const momentum = 0.85; // Momentum factor

  for (let iter = 0; iter < iterations; iter++) {
    // Array to accumulate gradients for each point
    const grad = Array.from({ length: N }, () => ({ x: 0, y: 0, z: 0 }));

    // Calculate gradients based on measured links
    for (const link of links) {
      const p1 = coords[link.i];
      const p2 = coords[link.j];

      let dx = p1.x - p2.x;
      let dy = p1.y - p2.y;
      let dz = p1.z - p2.z;

      let currentDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (currentDist === 0) {
        // Disturb slightly to avoid division by zero
        dx = (Math.random() - 0.5) * 0.1;
        dy = (Math.random() - 0.5) * 0.1;
        dz = (Math.random() - 0.5) * 0.1;
        currentDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      }

      // Stress gradient term: 2 * (currentDist - targetDist) * unitVector
      const diff = currentDist - link.d;
      const factor = (diff / currentDist);

      const gx = dx * factor;
      const gy = dy * factor;
      const gz = dz * factor;

      // Accumulate forces (opposite directions)
      grad[link.i].x += gx;
      grad[link.i].y += gy;
      grad[link.i].z += gz;

      grad[link.j].x -= gx;
      grad[link.j].y -= gy;
      grad[link.j].z -= gz;
    }

    // Apply updates using momentum
    for (let i = 0; i < N; i++) {
      velocity[i].x = momentum * velocity[i].x + alpha * grad[i].x;
      velocity[i].y = momentum * velocity[i].y + alpha * grad[i].y;
      velocity[i].z = momentum * velocity[i].z + alpha * grad[i].z;

      coords[i].x -= velocity[i].x;
      coords[i].y -= velocity[i].y;
      coords[i].z -= velocity[i].z;
    }
  }

  // 3. Post-solve alignments
  // A. Shift centroid to (0,0,0)
  let cx = 0, cy = 0, cz = 0;
  for (const c of coords) {
    cx += c.x;
    cy += c.y;
    cz += c.z;
  }
  cx /= N;
  cy /= N;
  cz /= N;

  for (let i = 0; i < N; i++) {
    coords[i].x -= cx;
    coords[i].y -= cy;
    coords[i].z -= cz;
  }

  // B. Calculate residual stress error to verify success
  let totalError = 0;
  for (const link of links) {
    const p1 = coords[link.i];
    const p2 = coords[link.j];
    const dx = p1.x - p2.x;
    const dy = p1.y - p2.y;
    const dz = p1.z - p2.z;
    const currentDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
    totalError += Math.abs(currentDist - link.d);
  }

  const averageError = links.length > 0 ? (totalError / links.length) : 0;
  
  // If average error per distance is less than 15cm, we declare a success
  solveSuccess = links.length >= 4 && averageError < 15;

  if (solveSuccess) {
    // Save to global coordinates mapping
    coordinates = {};
    for (let i = 0; i < N; i++) {
      coordinates[ids[i]] = {
        x: Number((coords[i].x / 100).toFixed(3)), // convert cm to meters
        y: Number((coords[i].y / 100).toFixed(3)),
        z: Number((coords[i].z / 100).toFixed(3))
      };
    }
  } else {
    coordinates = {};
  }
}

// Perform initial solve on boot
solve3DCoordinates();

// API GET: Fetch points, distances, and solved 3D coordinates
app.get('/api/data', (req, res) => {
  res.json({
    points,
    distances,
    coordinates,
    solveSuccess
  });
});

// API POST: Add a new point label
app.post('/api/points', (req, res) => {
  const { label } = req.body;
  if (!label || typeof label !== 'string' || !label.trim()) {
    return res.status(400).json({ error: 'Point label is required' });
  }

  const trimmedLabel = label.trim();
  const labelExists = points.some(p => p.label.toLowerCase() === trimmedLabel.toLowerCase());
  
  if (labelExists) {
    return res.status(400).json({ error: 'Point label must be unique' });
  }

  const newId = String(nextPointId++);
  points.push({ id: newId, label: trimmedLabel });

  // Re-solve 3D coordinates as points listing changed
  solve3DCoordinates();

  res.status(201).json({
    message: 'Point added successfully',
    point: { id: newId, label: trimmedLabel },
    solveSuccess
  });
});

// API POST: Rename a point label
app.post('/api/points/rename', (req, res) => {
  const { id, label } = req.body;
  if (!id || !label || typeof label !== 'string' || !label.trim()) {
    return res.status(400).json({ error: 'Valid point ID and label are required' });
  }

  const trimmedLabel = label.trim();
  const point = points.find(p => p.id === String(id));
  
  if (!point) {
    return res.status(404).json({ error: 'Point not found' });
  }

  // Check uniqueness excluding itself
  const labelExists = points.some(p => p.id !== point.id && p.label.toLowerCase() === trimmedLabel.toLowerCase());
  if (labelExists) {
    return res.status(400).json({ error: 'Point label must be unique' });
  }

  point.label = trimmedLabel;

  res.json({
    message: 'Point renamed successfully',
    point
  });
});

// API POST: Delete a point and all associated distances
app.post('/api/points/delete', (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Point ID is required' });
  }

  const targetId = String(id);
  const pointIndex = points.findIndex(p => p.id === targetId);

  if (pointIndex === -1) {
    return res.status(404).json({ error: 'Point not found' });
  }

  // Remove the point
  points.splice(pointIndex, 1);

  // Remove all connected distances
  distances = distances.filter(d => d.point1Id !== targetId && d.point2Id !== targetId);

  // Re-solve 3D coordinates
  solve3DCoordinates();

  res.json({
    message: 'Point and associated distances deleted successfully',
    solveSuccess
  });
});

// API POST: Record distance connection
app.post('/api/distances', (req, res) => {
  const { point1Id, point2Id, distance } = req.body;

  if (!point1Id || !point2Id || distance === undefined) {
    return res.status(400).json({ error: 'All fields (point1Id, point2Id, distance) are required' });
  }

  if (point1Id === point2Id) {
    return res.status(400).json({ error: 'A distance must connect two distinct points' });
  }

  const distVal = Number(distance);
  if (isNaN(distVal) || distVal <= 0) {
    return res.status(400).json({ error: 'Distance must be a positive number' });
  }

  const p1 = points.some(p => p.id === String(point1Id));
  const p2 = points.some(p => p.id === String(point2Id));

  if (!p1 || !p2) {
    return res.status(400).json({ error: 'Both connected points must exist' });
  }

  // Check if link already exists (direction agnostic)
  const linkExists = distances.some(
    d => (d.point1Id === String(point1Id) && d.point2Id === String(point2Id)) ||
         (d.point1Id === String(point2Id) && d.point2Id === String(point1Id))
  );

  if (linkExists) {
    return res.status(400).json({ error: 'A distance measurement already exists between these points' });
  }

  const newId = 'd' + nextDistanceId++;
  const newDistance = {
    id: newId,
    point1Id: String(point1Id),
    point2Id: String(point2Id),
    distance: distVal
  };

  distances.push(newDistance);

  // Re-solve 3D coordinates
  solve3DCoordinates();

  res.status(201).json({
    message: 'Distance recorded successfully',
    distance: newDistance,
    solveSuccess
  });
});

// API POST: Delete a distance connection
app.post('/api/distances/delete', (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Distance record ID is required' });
  }

  const targetId = String(id);
  const distIndex = distances.findIndex(d => d.id === targetId);

  if (distIndex === -1) {
    return res.status(404).json({ error: 'Distance record not found' });
  }

  distances.splice(distIndex, 1);

  // Re-solve 3D coordinates
  solve3DCoordinates();

  res.json({
    message: 'Distance record deleted successfully',
    solveSuccess
  });
});

// API POST: Clear all database structures
app.post('/api/clear', (req, res) => {
  points = [];
  distances = [];
  coordinates = {};
  solveSuccess = false;
  
  nextPointId = 1;
  nextDistanceId = 1;

  res.json({
    message: 'All points and distance records cleared successfully',
    solveSuccess
  });
});

app.listen(PORT, () => {
  console.log(`Measureit 3D Land Mapper running at http://localhost:${PORT}`);
});
