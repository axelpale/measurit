const express = require('express');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// SQLite Connection (local file-based persistence)
const dbPath = path.join(__dirname, 'measurit.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Failed to open database measurit.db:', err);
  } else {
    console.log('Connected to SQLite database at:', dbPath);
  }
});

// Enable SQLite Foreign Key Cascading Constraints
db.run("PRAGMA foreign_keys = ON;");

/**
 * Helper: Promise-based db.run wrapper
 */
const dbRun = (sql, params = []) => new Promise((resolve, reject) => {
  db.run(sql, params, function(err) {
    if (err) reject(err);
    else resolve({ lastID: this.lastID, changes: this.changes });
  });
});

/**
 * Helper: Promise-based db.all wrapper
 */
const dbAll = (sql, params = []) => new Promise((resolve, reject) => {
  db.all(sql, params, (err, rows) => {
    if (err) reject(err);
    else resolve(rows);
  });
});

/**
 * Database Schema Initializer & Data Seeder
 */
function initializeDatabase() {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      // 1. Create Points table
      db.run(`
        CREATE TABLE IF NOT EXISTS points (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          label TEXT UNIQUE NOT NULL
        )
      `, (err) => {
        if (err) return reject(err);
      });

      // 2. Create Distances table with foreign keys & unique symmetry checks
      db.run(`
        CREATE TABLE IF NOT EXISTS distances (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          point1Id INTEGER NOT NULL,
          point2Id INTEGER NOT NULL,
          distance REAL NOT NULL,
          FOREIGN KEY (point1Id) REFERENCES points(id) ON DELETE CASCADE,
          FOREIGN KEY (point2Id) REFERENCES points(id) ON DELETE CASCADE,
          UNIQUE(point1Id, point2Id),
          CHECK(point1Id != point2Id)
        )
      `, (err) => {
        if (err) return reject(err);
      });

      // 3. Seed mock data if database is fresh and empty
      db.get("SELECT COUNT(*) as count FROM points", (err, row) => {
        if (err) return reject(err);
        
        if (row.count === 0) {
          console.log("Database measurit.db is fresh. Seeding default regular tetrahedron pyramid...");
          
          db.run("INSERT INTO points (id, label) VALUES (1, 'A'), (2, 'B'), (3, 'C'), (4, 'D')", (err) => {
            if (err) return reject(err);
            
            db.run(`
              INSERT INTO distances (point1Id, point2Id, distance) VALUES 
              (1, 2, 300),
              (2, 3, 300),
              (1, 3, 300),
              (1, 4, 250),
              (2, 4, 250),
              (3, 4, 250)
            `, (err) => {
              if (err) return reject(err);
              console.log("Seeding complete!");
              resolve();
            });
          });
        } else {
          resolve();
        }
      });
    });
  });
}

// Global cached variables for estimated coordinates
let cachedCoordinates = {};
let cachedSolveSuccess = false;

/**
 * 3D Coordinate Recovery Solver using Stress Minimization (Gradient Descent with Momentum)
 */
async function run3DCoordinateSolver() {
  try {
    const dbPoints = await dbAll("SELECT id, label FROM points");
    const dbDistances = await dbAll("SELECT id, point1Id, point2Id, distance FROM distances");

    if (dbPoints.length < 4 || dbDistances.length < 4) {
      cachedCoordinates = {};
      cachedSolveSuccess = false;
      return;
    }

    const N = dbPoints.length;
    const ids = dbPoints.map(p => p.id);
    const idToIndex = {};
    ids.forEach((id, index) => {
      idToIndex[id] = index;
    });

    // 1. Initialize point positions randomly in a 3D box
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

    // Convert SQL rows to link records
    const links = dbDistances
      .map(d => {
        const idx1 = idToIndex[d.point1Id];
        const idx2 = idToIndex[d.point2Id];
        return {
          i: idx1,
          j: idx2,
          d: d.distance
        };
      })
      .filter(link => link.i !== undefined && link.j !== undefined);

    // 2. Optimization Stress Minimizer loop (1000 iterations)
    const iterations = 1000;
    const alpha = 0.08;
    const momentum = 0.85;

    for (let iter = 0; iter < iterations; iter++) {
      const grad = Array.from({ length: N }, () => ({ x: 0, y: 0, z: 0 }));

      for (const link of links) {
        const p1 = coords[link.i];
        const p2 = coords[link.j];

        let dx = p1.x - p2.x;
        let dy = p1.y - p2.y;
        let dz = p1.z - p2.z;

        let currentDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (currentDist === 0) {
          dx = (Math.random() - 0.5) * 0.1;
          dy = (Math.random() - 0.5) * 0.1;
          dz = (Math.random() - 0.5) * 0.1;
          currentDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        }

        const diff = currentDist - link.d;
        const factor = (diff / currentDist);

        const gx = dx * factor;
        const gy = dy * factor;
        const gz = dz * factor;

        grad[link.i].x += gx;
        grad[link.i].y += gy;
        grad[link.i].z += gz;

        grad[link.j].x -= gx;
        grad[link.j].y -= gy;
        grad[link.j].z -= gz;
      }

      for (let i = 0; i < N; i++) {
        velocity[i].x = momentum * velocity[i].x + alpha * grad[i].x;
        velocity[i].y = momentum * velocity[i].y + alpha * grad[i].y;
        velocity[i].z = momentum * velocity[i].z + alpha * grad[i].z;

        coords[i].x -= velocity[i].x;
        coords[i].y -= velocity[i].y;
        coords[i].z -= velocity[i].z;
      }
    }

    // 3. Translate coordinates to align centroid at (0,0,0)
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

    // 4. Calculate stress error convergence check
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
    cachedSolveSuccess = links.length >= 4 && averageError < 15;

    if (cachedSolveSuccess) {
      cachedCoordinates = {};
      for (let i = 0; i < N; i++) {
        cachedCoordinates[ids[i]] = {
          x: Number((coords[i].x / 100).toFixed(3)), // convert cm to meters
          y: Number((coords[i].y / 100).toFixed(3)),
          z: Number((coords[i].z / 100).toFixed(3))
        };
      }
    } else {
      cachedCoordinates = {};
    }
  } catch (err) {
    console.error("3D Solver error:", err);
    cachedCoordinates = {};
    cachedSolveSuccess = false;
  }
}

// Initialize tables and run migrations
initializeDatabase()
  .then(() => {
    console.log("Database initialized successfully.");
    return run3DCoordinateSolver();
  })
  .catch(err => {
    console.error("Database initialization failed:", err);
  });

// ==========================================================================
// API REST ENDPOINTS
// ==========================================================================

// GET /api/data: Load points, distances, and run solver coordinates
app.get('/api/data', async (req, res) => {
  try {
    const dbPoints = await dbAll("SELECT id, label FROM points ORDER BY id ASC");
    const dbDistances = await dbAll("SELECT id, point1Id, point2Id, distance FROM distances ORDER BY id ASC");
    
    // Resolve coordinates dynamically
    await run3DCoordinateSolver();

    res.json({
      points: dbPoints.map(p => ({ id: String(p.id), label: p.label })),
      distances: dbDistances.map(d => ({ id: String(d.id), point1Id: String(d.point1Id), point2Id: String(d.point2Id), distance: d.distance })),
      coordinates: cachedCoordinates,
      solveSuccess: cachedSolveSuccess
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/points: Add new point
app.post('/api/points', async (req, res) => {
  const { label } = req.body;
  if (!label || typeof label !== 'string' || !label.trim()) {
    return res.status(400).json({ error: 'Point label is required' });
  }

  const trimmedLabel = label.trim();

  try {
    // Label unique check
    const exists = await dbAll("SELECT id FROM points WHERE LOWER(label) = LOWER(?)", [trimmedLabel]);
    if (exists.length > 0) {
      return res.status(400).json({ error: 'Point label must be unique' });
    }

    const result = await dbRun("INSERT INTO points (label) VALUES (?)", [trimmedLabel]);
    
    res.status(201).json({
      message: 'Point added successfully',
      point: { id: String(result.lastID), label: trimmedLabel }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/points/rename: Rename an existing point
app.post('/api/points/rename', async (req, res) => {
  const { id, label } = req.body;
  if (!id || !label || typeof label !== 'string' || !label.trim()) {
    return res.status(400).json({ error: 'Valid point ID and label are required' });
  }

  const trimmedLabel = label.trim();
  const pointId = Number(id);

  try {
    // Unique check excluding itself
    const exists = await dbAll("SELECT id FROM points WHERE LOWER(label) = LOWER(?) AND id != ?", [trimmedLabel, pointId]);
    if (exists.length > 0) {
      return res.status(400).json({ error: 'Point label must be unique' });
    }

    const result = await dbRun("UPDATE points SET label = ? WHERE id = ?", [trimmedLabel, pointId]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Point not found' });
    }

    res.json({
      message: 'Point renamed successfully',
      point: { id: String(pointId), label: trimmedLabel }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/points/delete: Delete point (cascades distance removals)
app.post('/api/points/delete', async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Point ID is required' });
  }

  const pointId = Number(id);

  try {
    const result = await dbRun("DELETE FROM points WHERE id = ?", [pointId]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Point not found' });
    }

    // Solve new 3D system state
    await run3DCoordinateSolver();

    res.json({
      message: 'Point and associated distances deleted successfully',
      solveSuccess: cachedSolveSuccess
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/distances: Record distance between points
app.post('/api/distances', async (req, res) => {
  const { point1Id, point2Id, distance } = req.body;

  if (!point1Id || !point2Id || distance === undefined) {
    return res.status(400).json({ error: 'All fields (point1Id, point2Id, distance) are required' });
  }

  const p1Id = Number(point1Id);
  const p2Id = Number(point2Id);
  
  if (p1Id === p2Id) {
    return res.status(400).json({ error: 'A distance must connect two distinct points' });
  }

  const distVal = Number(distance);
  if (isNaN(distVal) || distVal <= 0) {
    return res.status(400).json({ error: 'Distance must be a positive number' });
  }

  // Standardize point order: point1Id < point2Id to enforce symmetry constraints in SQL UNIQUE index
  const uP1 = Math.min(p1Id, p2Id);
  const uP2 = Math.max(p1Id, p2Id);

  try {
    // Validate both points exist
    const pts = await dbAll("SELECT id FROM points WHERE id IN (?, ?)", [uP1, uP2]);
    if (pts.length < 2) {
      return res.status(400).json({ error: 'Both connected points must exist' });
    }

    // Check if measurement already exists
    const exists = await dbAll("SELECT id FROM distances WHERE point1Id = ? AND point2Id = ?", [uP1, uP2]);
    let recordId;
    let isUpdate = false;

    if (exists.length > 0) {
      recordId = exists[0].id;
      await dbRun("UPDATE distances SET distance = ? WHERE id = ?", [distVal, recordId]);
      isUpdate = true;
    } else {
      const result = await dbRun("INSERT INTO distances (point1Id, point2Id, distance) VALUES (?, ?, ?)", [uP1, uP2, distVal]);
      recordId = result.lastID;
    }

    // Re-solve 3D geometry coordinates
    await run3DCoordinateSolver();

    res.status(isUpdate ? 200 : 201).json({
      message: isUpdate ? 'Distance measurement updated successfully' : 'Distance recorded successfully',
      distance: {
        id: String(recordId),
        point1Id: String(uP1),
        point2Id: String(uP2),
        distance: distVal
      },
      solveSuccess: cachedSolveSuccess
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/distances/delete: Delete distance record
app.post('/api/distances/delete', async (req, res) => {
  const { id } = req.body;
  if (!id) {
    return res.status(400).json({ error: 'Distance record ID is required' });
  }

  const distId = Number(id);

  try {
    const result = await dbRun("DELETE FROM distances WHERE id = ?", [distId]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Distance record not found' });
    }

    // Re-solve 3D geometry coordinates
    await run3DCoordinateSolver();

    res.json({
      message: 'Distance record deleted successfully',
      solveSuccess: cachedSolveSuccess
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/clear: Resets/drops database elements
app.post('/api/clear', async (req, res) => {
  try {
    await dbRun("DELETE FROM distances");
    await dbRun("DELETE FROM points");
    // Reset autoincrement sequence counters in SQLite
    await dbRun("DELETE FROM sqlite_sequence WHERE name IN ('points', 'distances')");

    cachedCoordinates = {};
    cachedSolveSuccess = false;

    res.json({
      message: 'All points and distance records cleared successfully',
      solveSuccess: cachedSolveSuccess
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Measurit 3D Land Mapper (SQLite) running at http://localhost:${PORT}`);
});
