// State variables
let points = [];
let distances = [];
let coordinates = {};
let solveSuccess = false;

// 3D Camera Orbit controls state
let yaw = 0.6;   // horizontal rotation angle in radians
let pitch = 0.35; // vertical rotation angle in radians
let zoom = 1.0;
let isDragging = false;
let startX = 0;
let startY = 0;

// Dynamic active edit trackers
let activeEditPointId = null;

// DOM Elements
const pointsList = document.getElementById('pointsList');
const pointsCount = document.getElementById('pointsCount');
const addPointForm = document.getElementById('addPointForm');
const newPointLabel = document.getElementById('newPointLabel');

const recordDistanceForm = document.getElementById('recordDistanceForm');
const firstPointSelect = document.getElementById('firstPointSelect');
const secondPointSelect = document.getElementById('secondPointSelect');
const distanceInput = document.getElementById('distanceInput');
const distancesCount = document.getElementById('distancesCount');
const distancesTableBody = document.getElementById('distancesTableBody');
const tableEmptyState = document.getElementById('tableEmptyState');
const recordBtn = document.getElementById('recordBtn');
const clearAllBtn = document.getElementById('clearAllBtn');
const distanceSuggestionsContainer = document.getElementById('distanceSuggestionsContainer');
const distanceSuggestionsList = document.getElementById('distanceSuggestionsList');

// 3D Canvas Elements
const mapCanvas = document.getElementById('mapCanvas');
const ctx = mapCanvas.getContext('2d');
const canvasPlaceholder = document.getElementById('canvasPlaceholder');
const canvasControls = document.getElementById('canvasControls');
const placeholderStatus = document.getElementById('placeholderStatus');
const solveBadge = document.getElementById('solveBadge');
const downloadSvgBtn = document.getElementById('downloadSvgBtn');

/**
 * Fetch latest state from Node server and update views
 */
async function fetchData(selectFirstSuggestion = false, alignCameraToPCAFlag = false) {
  try {
    const response = await fetch('/api/data');
    if (!response.ok) throw new Error('Failed to fetch data');
    
    const data = await response.json();
    points = data.points;
    distances = data.distances;
    coordinates = data.coordinates;
    solveSuccess = data.solveSuccess;
    
    if (alignCameraToPCAFlag && solveSuccess) {
      alignCameraToPCA();
    }
    
    renderPointsUI();
    renderDistanceFormDropdowns();
    renderDistanceLogsTable();
    updateCanvasDisplay();
    updateDistanceSuggestions(selectFirstSuggestion);
  } catch (err) {
    console.error('Error fetching system state:', err);
  }
}

/**
 * Render Point List with inline rename and delete controls
 */
function renderPointsUI() {
  pointsCount.textContent = `${points.length} point${points.length === 1 ? '' : 's'}`;
  pointsList.innerHTML = '';
  
  // Render points with the most recent first
  const reversedPoints = [...points].reverse();
  reversedPoints.forEach((pt) => {
    const index = points.indexOf(pt);
    const li = document.createElement('li');
    li.className = 'point-item';
    li.dataset.id = pt.id;
    
    const isEditing = activeEditPointId === pt.id;
    
    if (isEditing) {
      // Inline Editing DOM Node
      li.innerHTML = `
        <div class="point-label-section">
          <span class="point-index-bullet">${index + 1}</span>
          <input type="text" class="inline-edit-input" id="editInput_${pt.id}" value="${escapeHTML(pt.label)}" required autofocus autocomplete="off">
        </div>
        <div class="point-actions">
          <button class="btn btn-primary btn-sm save-edit-btn" style="padding: 4px 10px; font-size: 0.75rem;">Save</button>
          <button class="btn btn-secondary btn-sm cancel-edit-btn" style="padding: 4px 10px; font-size: 0.75rem;">Cancel</button>
        </div>
      `;
      
      // Save listener
      li.querySelector('.save-edit-btn').addEventListener('click', () => saveRename(pt.id));
      // Cancel listener
      li.querySelector('.cancel-edit-btn').addEventListener('click', () => {
        activeEditPointId = null;
        renderPointsUI();
      });
      // Handle keyboard press
      li.querySelector('.inline-edit-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          saveRename(pt.id);
        } else if (e.key === 'Escape') {
          activeEditPointId = null;
          renderPointsUI();
        }
      });
    } else {
      // Normal display Mode Node
      li.innerHTML = `
        <div class="point-label-section">
          <span class="point-index-bullet">${index + 1}</span>
          <span class="point-name" title="${escapeHTML(pt.label)}">${escapeHTML(pt.label)}</span>
        </div>
        <div class="point-actions">
          <button class="btn-danger-icon edit-point-btn" title="Rename Landmark">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round" style="color: var(--text-secondary)"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
          </button>
          <button class="btn-danger-icon delete-point-btn" title="Delete Landmark">
            <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
          </button>
        </div>
      `;
      
      // Edit triggers
      li.querySelector('.edit-point-btn').addEventListener('click', () => {
        activeEditPointId = pt.id;
        renderPointsUI();
      });
      // Delete triggers
      li.querySelector('.delete-point-btn').addEventListener('click', () => deletePoint(pt.id));
    }
    
    pointsList.appendChild(li);
  });
}

/**
 * Handle Inline Rename post submission
 */
async function saveRename(pointId) {
  const input = document.getElementById(`editInput_${pointId}`);
  const newLabel = input.value.trim();
  
  if (!newLabel) return;

  try {
    const response = await fetch('/api/points/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pointId, label: newLabel })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to rename point');

    activeEditPointId = null;
    fetchData(); // reload
  } catch (err) {
    alert(err.message);
  }
}

/**
 * Handle point deletion
 */
async function deletePoint(pointId) {
  if (!confirm('Are you sure you want to delete this landmark? This will also remove any distances connected to it.')) return;

  try {
    const response = await fetch('/api/points/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: pointId })
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to delete point');
    }

    fetchData();
  } catch (err) {
    alert(err.message);
  }
}

/**
 * Populate Distance dropdown Selectors
 */
function renderDistanceFormDropdowns() {
  const currentSel1 = firstPointSelect.value;
  const currentSel2 = secondPointSelect.value;

  firstPointSelect.innerHTML = '<option value="" disabled selected>Select Point...</option>';
  secondPointSelect.innerHTML = '<option value="" disabled selected>Select Point...</option>';

  points.forEach(pt => {
    const opt1 = document.createElement('option');
    opt1.value = pt.id;
    opt1.textContent = pt.label;
    firstPointSelect.appendChild(opt1);

    const opt2 = document.createElement('option');
    opt2.value = pt.id;
    opt2.textContent = pt.label;
    secondPointSelect.appendChild(opt2);
  });

  // Restore selection if they still exist
  if (points.some(p => p.id === currentSel1)) firstPointSelect.value = currentSel1;
  if (points.some(p => p.id === currentSel2)) secondPointSelect.value = currentSel2;
}

/**
 * Update the UI showing suggestions for missing point pairs
 * Sorted by ID number difference in ascending order
 */
function updateDistanceSuggestions(selectFirst = false) {
  if (points.length < 2) {
    distanceSuggestionsContainer.classList.add('hidden');
    return;
  }
  
  const suggestions = [];
  const seenPairs = new Set();
  const getPairKey = (id1, id2) => {
    return Number(id1) < Number(id2) ? `${id1}-${id2}` : `${id2}-${id1}`;
  };

  // 1. Add top-3 high stress connections for remeasuring
  const topStressedIds = getTopStressedDistanceIds();
  distances.forEach(d => {
    if (topStressedIds.has(d.id)) {
      const p1 = points.find(p => p.id === d.point1Id);
      const p2 = points.find(p => p.id === d.point2Id);
      if (p1 && p2) {
        const key = getPairKey(p1.id, p2.id);
        if (!seenPairs.has(key)) {
          seenPairs.add(key);
          suggestions.push({ p1, p2, isRemeasure: true, diff: 0 });
        }
      }
    }
  });

  // 2. Add missing point pairs
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 1; j < points.length; j++) {
      const p1 = points[i];
      const p2 = points[j];
      
      const key = getPairKey(p1.id, p2.id);
      if (seenPairs.has(key)) continue;

      // Check if connection already exists in either direction
      const exists = distances.some(d => 
        (d.point1Id === p1.id && d.point2Id === p2.id) ||
        (d.point1Id === p2.id && d.point2Id === p1.id)
      );
      
      if (!exists) {
        seenPairs.add(key);
        const id1 = Number(p1.id);
        const id2 = Number(p2.id);
        const diff = Math.abs(id1 - id2);
        suggestions.push({ p1, p2, isRemeasure: false, diff });
      }
    }
  }
  
  if (suggestions.length === 0) {
    distanceSuggestionsContainer.classList.add('hidden');
    return;
  }
  
  // Sort suggestions: Missing pairs (preferred) first sorted by ID difference, then Remeasures at the bottom
  suggestions.sort((a, b) => {
    if (a.isRemeasure && !b.isRemeasure) return 1;
    if (!a.isRemeasure && b.isRemeasure) return -1;
    if (a.isRemeasure && b.isRemeasure) return 0;
    return a.diff - b.diff;
  });
  
  distanceSuggestionsContainer.classList.remove('hidden');
  distanceSuggestionsList.innerHTML = '';
  
  // Take up to 4 most suitable suggestions
  const topSuggestions = suggestions.slice(0, 4);
  topSuggestions.forEach(s => {
    const btn = document.createElement('button');
    btn.type = 'button';
    if (s.isRemeasure) {
      btn.className = 'suggestion-badge remeasure';
      btn.innerHTML = `${escapeHTML(s.p1.label)} &harr; ${escapeHTML(s.p2.label)} <span class="diff-badge" style="color: #f87171; background: rgba(220, 38, 38, 0.15);">Remeasure</span>`;
    } else {
      btn.className = 'suggestion-badge';
      btn.innerHTML = `${escapeHTML(s.p1.label)} &harr; ${escapeHTML(s.p2.label)}`;
    }
    btn.addEventListener('click', () => {
      firstPointSelect.value = s.p1.id;
      secondPointSelect.value = s.p2.id;
      distanceInput.focus();
    });
    distanceSuggestionsList.appendChild(btn);
  });

  // Automatically select the first suggestion if requested
  if (selectFirst && topSuggestions.length > 0) {
    const s = topSuggestions[0];
    firstPointSelect.value = s.p1.id;
    secondPointSelect.value = s.p2.id;
    distanceInput.focus();
  }
}

/**
 * Helper: Find the IDs of the top 3 distance records with the highest stress (> 1.0 cm)
 */
function getTopStressedDistanceIds() {
  const stressedList = [];
  if (solveSuccess) {
    distances.forEach(d => {
      const pt1 = coordinates[d.point1Id];
      const pt2 = coordinates[d.point2Id];
      if (pt1 && pt2) {
        const dx = pt1.x - pt2.x;
        const dy = pt1.y - pt2.y;
        const dz = pt1.z - pt2.z;
        const reconstructedDistance = Math.sqrt(dx*dx + dy*dy + dz*dz) * 100;
        const stressVal = Math.abs(reconstructedDistance - d.distance);
        if (stressVal > 1.0) {
          stressedList.push({ id: d.id, stressVal });
        }
      }
    });
  }
  
  // Sort descending by stressVal
  stressedList.sort((a, b) => b.stressVal - a.stressVal);
  
  // Take top 3
  const topIds = new Set(stressedList.slice(0, 3).map(item => item.id));
  return topIds;
}

/**
 * Render table log of recorded distances
 */
function renderDistanceLogsTable() {
  distancesCount.textContent = `${distances.length} record${distances.length === 1 ? '' : 's'}`;
  distancesTableBody.innerHTML = '';
  
  if (distances.length === 0) {
    tableEmptyState.classList.remove('hidden');
    return;
  }
  
  tableEmptyState.classList.add('hidden');

  const topStressedIds = getTopStressedDistanceIds();

  distances.forEach(d => {
    const p1 = points.find(p => p.id === d.point1Id);
    const p2 = points.find(p => p.id === d.point2Id);
    
    const label1 = p1 ? p1.label : `[Unknown #${d.point1Id}]`;
    const label2 = p2 ? p2.label : `[Unknown #${d.point2Id}]`;
    
    // Calculate stress if solved
    let stressBadgeHTML = '<span style="color: var(--text-muted); font-size: 0.8rem;">-</span>';
    let isStressed = false;
    
    if (solveSuccess) {
      const pt1 = coordinates[d.point1Id];
      const pt2 = coordinates[d.point2Id];
      if (pt1 && pt2) {
        const dx = pt1.x - pt2.x;
        const dy = pt1.y - pt2.y;
        const dz = pt1.z - pt2.z;
        const reconstructedDistance = Math.sqrt(dx*dx + dy*dy + dz*dz) * 100;
        const difference = reconstructedDistance - d.distance;
        
        isStressed = topStressedIds.has(d.id);
        
        const diffSign = difference > 0 ? '+' : '';
        const diffText = `${diffSign}${difference.toFixed(1)} cm`;
        
        if (isStressed) {
          stressBadgeHTML = `<span class="stress-badge warning">${diffText}</span>`;
        } else {
          stressBadgeHTML = `<span class="stress-badge clean">${diffText}</span>`;
        }
      }
    }
    
    const tr = document.createElement('tr');
    if (isStressed) {
      tr.className = 'stressed-row';
    }
    
    tr.innerHTML = `
      <td style="font-weight: 500;">${escapeHTML(label1)}</td>
      <td style="font-weight: 500;">${escapeHTML(label2)}</td>
      <td class="text-right" style="font-weight: 500; ${isStressed ? 'color: #f87171;' : ''}">${d.distance.toLocaleString()} cm</td>
      <td class="text-right" style="padding-right: 16px;">${stressBadgeHTML}</td>
      <td class="text-center">
        <button class="btn-danger-icon delete-distance-btn" title="Delete distance measurement">
          <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
        </button>
      </td>
    `;

    tr.querySelector('.delete-distance-btn').addEventListener('click', () => deleteDistance(d.id));
    distancesTableBody.appendChild(tr);
  });
}

/**
 * Handle distance connection deletion
 */
async function deleteDistance(distId) {
  if (!confirm('Remove this distance record?')) return;

  try {
    const response = await fetch('/api/distances/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: distId })
    });

    if (!response.ok) {
      const data = await response.json();
      throw new Error(data.error || 'Failed to delete distance');
    }

    fetchData();
  } catch (err) {
    alert(err.message);
  }
}

/**
 * Handle new point submissions
 */
addPointForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const label = newPointLabel.value.trim();
  if (!label) return;

  try {
    const response = await fetch('/api/points', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ label })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to add point');

    newPointLabel.value = '';
    fetchData(false, true);
  } catch (err) {
    alert(err.message);
  }
});

/**
 * Handle distance recording submissions
 */
recordDistanceForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const pt1 = firstPointSelect.value;
  const pt2 = secondPointSelect.value;
  const dist = parseFloat(distanceInput.value);

  if (!pt1 || !pt2 || isNaN(dist) || dist <= 0) return;

  try {
    const response = await fetch('/api/distances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ point1Id: pt1, point2Id: pt2, distance: dist })
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Failed to record distance');

    distanceInput.value = '';
    fetchData(true);
  } catch (err) {
    alert(err.message);
  }
});

/**
 * Reset whole system
 */
clearAllBtn.addEventListener('click', async () => {
  if (!confirm('Are you absolutely sure you want to reset the system? This will clear all labeled points and measurements!')) return;

  try {
    const response = await fetch('/api/clear', { method: 'POST' });
    if (!response.ok) throw new Error('Reset failed');

    resetCanvasState();
    fetchData();
  } catch (err) {
    alert(err.message);
  }
});

/**
 * Update the 3D projection canvas display
 */
function updateCanvasDisplay() {
  if (solveSuccess && points.length >= 4) {
    // Unlock the Canvas Orbit rendering
    canvasPlaceholder.classList.add('hidden');
    canvasControls.classList.remove('hidden');
    downloadSvgBtn.classList.remove('hidden');
    
    solveBadge.className = 'badge solved';
    solveBadge.textContent = '3D Reconstructed';
    
    // Draw the 3D scene
    requestAnimationFrame(draw3DScene);
  } else {
    // Lock viewport and show overlay placeholder
    canvasPlaceholder.classList.remove('hidden');
    canvasControls.classList.add('hidden');
    downloadSvgBtn.classList.add('hidden');
    
    solveBadge.className = 'badge unsolved';
    solveBadge.textContent = 'Awaiting Data';
    
    placeholderStatus.innerHTML = `
      Active Points: <strong>${points.length}</strong>/4 • Logged Distances: <strong>${distances.length}</strong>/4
    `;
  }
}

/**
 * Core Canvas 3D Rendering Projection loop
 */
function draw3DScene() {
  const topStressedIds = getTopStressedDistanceIds();
  // Sync HTML bounds
  const rect = mapCanvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  
  if (mapCanvas.width !== width || mapCanvas.height !== height) {
    mapCanvas.width = width;
    mapCanvas.height = height;
  }

  // Clear Canvas with sleek space space background
  ctx.fillStyle = '#040507';
  ctx.fillRect(0, 0, width, height);

  const cx = width / 2;
  const cy = height / 2;

  // 1. Recover projected point coordinates
  const projected = {};
  const ids = Object.keys(coordinates);
  
  if (ids.length === 0) return;

  // Calc sizing box (bounding box) to automatically scale points to fill canvas beautifully
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  // First pass coordinates rotation
  const rotatedTemp = [];
  ids.forEach(id => {
    const pt = coordinates[id];
    
    // Rotate Y-axis (Yaw)
    const x1 = pt.x * Math.cos(yaw) - pt.z * Math.sin(yaw);
    const z1 = pt.x * Math.sin(yaw) + pt.z * Math.cos(yaw);
    
    // Rotate X-axis (Pitch)
    const y2 = pt.y * Math.cos(pitch) - z1 * Math.sin(pitch);
    const z2 = pt.y * Math.sin(pitch) + z1 * Math.cos(pitch);

    rotatedTemp.push({ id, x1, y2, z2 });
    
    minX = Math.min(minX, x1);
    maxX = Math.max(maxX, x1);
    minY = Math.min(minY, y2);
    maxY = Math.max(maxY, y2);
  });

  // Determine ideal scale factor to fit boundaries nicely with comfort margin
  const dx = Math.max(0.1, maxX - minX);
  const dy = Math.max(0.1, maxY - minY);
  const fitScale = Math.min(width / dx, height / dy) * 0.45;
  const finalScale = fitScale * zoom;

  // Projected 2D point mapping
  rotatedTemp.forEach(item => {
    projected[item.id] = {
      px: cx + item.x1 * finalScale,
      py: cy - item.y2 * finalScale, // invert screen Y axis
      zDepth: item.z2 // saved for sorting depth later
    };
  });

  // 2. Draw axes grid lines at the origin (High tech relative compass)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.03)';
  ctx.lineWidth = 1;
  
  // draw circular grids
  const gridRadii = [1, 2.5, 5, 10]; // radial rings in meters
  gridRadii.forEach(r => {
    ctx.beginPath();
    ctx.arc(cx, cy, r * finalScale * 0.5, 0, 2 * Math.PI);
    ctx.stroke();
  });

  // 3. Draw recorded distances as glowing vectors
  distances.forEach(d => {
    const pt1 = projected[d.point1Id];
    const pt2 = projected[d.point2Id];
    if (!pt1 || !pt2) return;

    // Calculate stress to identify potential measurement error
    let isStressed = false;
    let stressVal = 0;
    let difference = 0;
    const c1 = coordinates[d.point1Id];
    const c2 = coordinates[d.point2Id];
    if (c1 && c2) {
      const dx = c1.x - c2.x;
      const dy = c1.y - c2.y;
      const dz = c1.z - c2.z;
      const reconstructedDistance = Math.sqrt(dx*dx + dy*dy + dz*dz) * 100;
      stressVal = Math.abs(reconstructedDistance - d.distance);
      difference = reconstructedDistance - d.distance;
      isStressed = topStressedIds.has(d.id);
    }

    // Glowing style (Red for stressed edges to draw focus)
    ctx.shadowBlur = isStressed ? 10 : 6;
    ctx.shadowColor = isStressed ? 'rgba(239, 68, 68, 0.75)' : 'rgba(124, 58, 237, 0.5)';
    ctx.strokeStyle = isStressed ? 'rgba(239, 68, 68, 0.9)' : 'rgba(124, 58, 237, 0.65)';
    ctx.lineWidth = isStressed ? 3.5 : 2.5;

    ctx.beginPath();
    ctx.moveTo(pt1.px, pt1.py);
    ctx.lineTo(pt2.px, pt2.py);
    ctx.stroke();

    // Disable shadows for text
    ctx.shadowBlur = 0;

    // Draw numeric distance labels in the middle of vector line
    const midX = (pt1.px + pt2.px) / 2;
    const midY = (pt1.py + pt2.py) / 2;
    
    let distText = `${d.distance.toLocaleString()} cm`;
    if (isStressed) {
      const diffSign = difference > 0 ? '+' : '';
      distText += ` (Diff: ${diffSign}${difference.toFixed(1)} cm)`;
    }
    
    ctx.font = isStressed ? 'bold 9px "Inter", sans-serif' : '500 9px "Inter", sans-serif';
    
    // Pill backdrop for readability
    const textWidth = ctx.measureText(distText).width;
    ctx.fillStyle = 'rgba(16, 18, 27, 0.85)';
    ctx.fillRect(midX - textWidth / 2 - 4, midY - 6, textWidth + 8, 12);
    
    ctx.fillStyle = isStressed ? '#f87171' : '#a78bfa';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(distText, midX, midY);
  });

  // 4. Draw Point Spheres (sorted by depth so closer spheres render on top)
  const sortedPoints = points
    .filter(pt => projected[pt.id] !== undefined)
    .map(pt => ({
      ...pt,
      proj: projected[pt.id]
    }))
    .sort((a, b) => b.proj.zDepth - a.proj.zDepth); // Back to front depth sorting

  sortedPoints.forEach(pt => {
    const { px, py } = pt.proj;
    const radius = 10;

    // Sphere radial gradient highlights
    const grad = ctx.createRadialGradient(px - 3, py - 3, 2, px, py, radius);
    grad.addColorStop(0, '#c084fc');
    grad.addColorStop(0.3, '#7c3aed');
    grad.addColorStop(1, '#1e1b4b');

    ctx.shadowBlur = 10;
    ctx.shadowColor = 'rgba(124, 58, 237, 0.6)';
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, radius, 0, 2 * Math.PI);
    ctx.fill();

    // Outer thin glowing ring
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(px, py, radius + 1, 0, 2 * Math.PI);
    ctx.stroke();

    // Draw point label overlay text pill
    ctx.font = 'bold 10px "Inter", sans-serif';
    const nameText = pt.label;
    const labelWidth = ctx.measureText(nameText).width;
    
    ctx.fillStyle = 'rgba(8, 9, 13, 0.8)';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    
    // Pill drawing
    roundRect(ctx, px - labelWidth / 2 - 6, py - 26, labelWidth + 12, 14, 4, true, true);

    ctx.fillStyle = '#f9fafb';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(nameText, px, py - 19);
  });
}

/**
 * Utility: draw smooth rounded rectangle
 */
function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  if (fill) ctx.fill();
  if (stroke) ctx.stroke();
}

/**
 * Reset local camera defaults
 */
function resetCanvasState() {
  yaw = 0.6;
  pitch = 0.35;
  zoom = 1.0;
}

/**
 * HTML Escaper helper
 */
function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, 
    tag => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      "'": '&#39;',
      '"': '&quot;'
    }[tag] || tag)
  );
}

// ==========================================================================
// Mouse Orbit Controls Listeners
// ==========================================================================
mapCanvas.addEventListener('mousedown', (e) => {
  isDragging = true;
  startX = e.clientX;
  startY = e.clientY;
});

window.addEventListener('mousemove', (e) => {
  if (!isDragging) return;
  
  const dx = e.clientX - startX;
  const dy = e.clientY - startY;
  
  startX = e.clientX;
  startY = e.clientY;

  yaw += dx * 0.007;
  pitch += dy * 0.007;

  // Clamp vertical pitch to avoid flipping camera upside down
  pitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, pitch));

  requestAnimationFrame(draw3DScene);
});

window.addEventListener('mouseup', () => {
  isDragging = false;
});

// Scroll Wheel zooming
mapCanvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  
  // Calculate zoom updates
  zoom -= e.deltaY * 0.0008;
  zoom = Math.max(0.2, Math.min(3.5, zoom)); // keep between safe scale bounds

  requestAnimationFrame(draw3DScene);
}, { passive: false });

// Support resize event redraws
window.addEventListener('resize', () => {
  if (solveSuccess) requestAnimationFrame(draw3DScene);
});

// ==========================================================================
// 2D Optimal PCA Projection & Minimal B&W SVG Export
// ==========================================================================

/**
 * Perform power iteration with Gram-Schmidt orthogonalization to solve for eigenvectors
 */
function getEigenvector(A, excludeV = null) {
  const seeds = [
    [1.0, 2.0, 3.0],
    [-1.0, 1.0, -1.0],
    [0.1, -0.9, 0.4]
  ];
  let bestV = [1.0, 0.0, 0.0];
  let bestVal = -1.0;
  
  for (const seed of seeds) {
    let v = [...seed];
    if (excludeV) {
      // Project seed to be orthogonal to excludeV
      const dot = v[0] * excludeV[0] + v[1] * excludeV[1] + v[2] * excludeV[2];
      v = [
        v[0] - dot * excludeV[0],
        v[1] - dot * excludeV[1],
        v[2] - dot * excludeV[2]
      ];
    }
    const len = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
    if (len < 1e-6) continue;
    v = [v[0] / len, v[1] / len, v[2] / len];
    
    for (let iter = 0; iter < 100; iter++) {
      let w = [
        A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2],
        A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2],
        A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2]
      ];
      if (excludeV) {
        // Maintain strict numerical orthogonality
        const dot = w[0] * excludeV[0] + w[1] * excludeV[1] + w[2] * excludeV[2];
        w = [
          w[0] - dot * excludeV[0],
          w[1] - dot * excludeV[1],
          w[2] - dot * excludeV[2]
        ];
      }
      const wLen = Math.sqrt(w[0]*w[0] + w[1]*w[1] + w[2]*w[2]);
      if (wLen < 1e-12) break;
      const nextV = [w[0] / wLen, w[1] / wLen, w[2] / wLen];
      const dotV = v[0] * nextV[0] + v[1] * nextV[1] + v[2] * nextV[2];
      if (Math.abs(dotV) > 0.9999999) {
        v = nextV;
        break;
      }
      v = nextV;
    }
    
    const Av = [
      A[0][0] * v[0] + A[0][1] * v[1] + A[0][2] * v[2],
      A[1][0] * v[0] + A[1][1] * v[1] + A[1][2] * v[2],
      A[2][0] * v[0] + A[2][1] * v[1] + A[2][2] * v[2]
    ];
    const eigenvalue = v[0] * Av[0] + v[1] * Av[1] + v[2] * Av[2];
    if (eigenvalue > bestVal) {
      bestVal = eigenvalue;
      bestV = v;
    }
  }
  return bestV;
}

/**
 * Automatically orient camera yaw and pitch so that the point cloud lies flat
 * on its 2D PCA plane of maximum spread, and set zoom to 1.0 to fit cleanly.
 */
function alignCameraToPCA() {
  if (!solveSuccess || points.length < 4) return;

  // 1. Gather solved 3D point coordinates
  const coordsList = points.map(p => {
    const coord = coordinates[p.id];
    return {
      x: coord ? coord.x : 0,
      y: coord ? coord.y : 0,
      z: coord ? coord.z : 0
    };
  }).filter(p => coordinates[p.id] !== undefined);

  if (coordsList.length < 4) return;

  // 2. Center coordinates around 3D centroid
  const n = coordsList.length;
  let meanX = 0, meanY = 0, meanZ = 0;
  for (const p of coordsList) {
    meanX += p.x;
    meanY += p.y;
    meanZ += p.z;
  }
  meanX /= n;
  meanY /= n;
  meanZ /= n;

  const centered = coordsList.map(p => ({
    x: p.x - meanX,
    y: p.y - meanY,
    z: p.z - meanZ
  }));

  // 3. Compute Covariance Matrix
  let Cxx = 0, Cxy = 0, Cxz = 0;
  let Cyy = 0, Cyz = 0, Czz = 0;
  for (const p of centered) {
    Cxx += p.x * p.x;
    Cxy += p.x * p.y;
    Cxz += p.x * p.z;
    Cyy += p.y * p.y;
    Cyz += p.y * p.z;
    Czz += p.z * p.z;
  }
  Cxx /= n;
  Cxy /= n;
  Cxz /= n;
  Cyy /= n;
  Cyz /= n;
  Czz /= n;

  const Cov = [
    [Cxx, Cxy, Cxz],
    [Cxy, Cyy, Cyz],
    [Cxz, Cyz, Czz]
  ];

  // 4. Solve for first two principal components
  const v1 = getEigenvector(Cov);
  const v2 = getEigenvector(Cov, v1);

  // 5. Compute PC3 as the normal to the PCA plane
  let v3 = [
    v1[1]*v2[2] - v1[2]*v2[1],
    v1[2]*v2[0] - v1[0]*v2[2],
    v1[0]*v2[1] - v1[1]*v2[0]
  ];
  const len3 = Math.sqrt(v3[0]*v3[0] + v3[1]*v3[1] + v3[2]*v3[2]);
  if (len3 > 1e-6) {
    v3 = [v3[0]/len3, v3[1]/len3, v3[2]/len3];
  }

  // 6. Set camera look vector w = v3 or -v3 to look perpendicular to the PCA plane
  let w = [...v3];
  // Clamped Math.asin prevents tiny float-precision errors from causing NaN
  let wY = Math.max(-1.0, Math.min(1.0, w[1]));
  let newPitch = Math.asin(wY);
  let newYaw = Math.atan2(w[0], w[2]);

  // Choose the sign of w that ensures the horizontal axis has a positive dot product with PC1 (v1)
  // This keeps the direction of maximum spread pointing neatly to the right
  const u1 = [Math.cos(newYaw), 0, -Math.sin(newYaw)];
  const dot = u1[0]*v1[0] + u1[1]*v1[1] + u1[2]*v1[2];
  if (dot < 0) {
    w = [-w[0], -w[1], -w[2]];
    wY = Math.max(-1.0, Math.min(1.0, w[1]));
    newPitch = Math.asin(wY);
    newYaw = Math.atan2(w[0], w[2]);
  }

  // Update controls and reset zoom to neatly fit point cloud inside width/height
  yaw = newYaw;
  pitch = Math.max(-Math.PI / 2.1, Math.min(Math.PI / 2.1, newPitch));
  zoom = 1.0;
}

/**
 * Perform 3D to 2D PCA projection and generate an ultra-minimal black-and-white SVG
 */
function generateMinimalSVGString() {
  // 1. Filter and center coordinates
  const coordsList = points.map(p => {
    const coord = coordinates[p.id];
    return {
      id: p.id,
      label: p.label,
      x: coord ? coord.x : 0,
      y: coord ? coord.y : 0,
      z: coord ? coord.z : 0
    };
  }).filter(p => coordinates[p.id] !== undefined);

  if (coordsList.length < 4) return null;

  // 2. Center coordinates around 3D centroid
  const n = coordsList.length;
  let meanX = 0, meanY = 0, meanZ = 0;
  for (const p of coordsList) {
    meanX += p.x;
    meanY += p.y;
    meanZ += p.z;
  }
  meanX /= n;
  meanY /= n;
  meanZ /= n;

  const centered = coordsList.map(p => ({
    id: p.id,
    label: p.label,
    x: p.x - meanX,
    y: p.y - meanY,
    z: p.z - meanZ
  }));

  // 3. Compute 3x3 Covariance Matrix
  let Cxx = 0, Cxy = 0, Cxz = 0;
  let Cyy = 0, Cyz = 0, Czz = 0;
  for (const p of centered) {
    Cxx += p.x * p.x;
    Cxy += p.x * p.y;
    Cxz += p.x * p.z;
    Cyy += p.y * p.y;
    Cyz += p.y * p.z;
    Czz += p.z * p.z;
  }
  Cxx /= n;
  Cxy /= n;
  Cxz /= n;
  Cyy /= n;
  Cyz /= n;
  Czz /= n;

  const Cov = [
    [Cxx, Cxy, Cxz],
    [Cxy, Cyy, Cyz],
    [Cxz, Cyz, Czz]
  ];

  const v1 = getEigenvector(Cov);
  const v2 = getEigenvector(Cov, v1);

  // 5. Project centered coordinates onto 2D plane
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;

  const projectedPoints = centered.map(p => {
    const px = p.x * v1[0] + p.y * v1[1] + p.z * v1[2];
    const py = p.x * v2[0] + p.y * v2[1] + p.z * v2[2];
    
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
    
    return { id: p.id, label: p.label, px, py };
  });

  const svgW = 600;
  const svgH = 600;
  const padding = 80;

  const dx = maxX - minX;
  const dy = maxY - minY;

  const scaleX = dx > 1e-6 ? (svgW - padding * 2) / dx : 1;
  const scaleY = dy > 1e-6 ? (svgH - padding * 2) / dy : 1;
  const finalScale = Math.min(scaleX, scaleY);

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;

  projectedPoints.forEach(p => {
    p.svgX = svgW / 2 + (p.px - cx) * finalScale;
    p.svgY = svgH / 2 - (p.py - cy) * finalScale; // Invert Cartesian Y for SVG screens
  });

  const projMap = {};
  projectedPoints.forEach(p => {
    projMap[p.id] = p;
  });

  // 6. Build the ultra-minimalist B&W SVG
  let svg = `<?xml version="1.0" encoding="UTF-8" standalone="no"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgW} ${svgH}" width="100%" height="100%">
  <!-- Transparent background -->
  <rect width="${svgW}" height="${svgH}" fill="none"/>

  <!-- Distance Connections (Thin black lines) -->
  <g id="connections">`;

  distances.forEach(d => {
    const p1 = projMap[d.point1Id];
    const p2 = projMap[d.point2Id];
    if (!p1 || !p2) return;

    svg += `
    <line x1="${p1.svgX.toFixed(2)}" y1="${p1.svgY.toFixed(2)}" x2="${p2.svgX.toFixed(2)}" y2="${p2.svgY.toFixed(2)}" stroke="#000000" stroke-width="1.5" stroke-linecap="round"/>`;
  });

  svg += `
  </g>

  <!-- Distance Value Text Labels (Clean, minimal masks) -->
  <g id="distance-labels">`;

  distances.forEach(d => {
    const p1 = projMap[d.point1Id];
    const p2 = projMap[d.point2Id];
    if (!p1 || !p2) return;

    const midX = (p1.svgX + p2.svgX) / 2;
    const midY = (p1.svgY + p2.svgY) / 2;
    const distText = `${d.distance.toLocaleString()} cm`;
    const labelW = distText.length * 5.5 + 4;
    const labelH = 10;

    svg += `
    <!-- Mask and label for connection between ${escapeHTML(p1.label)} and ${escapeHTML(p2.label)} -->
    <rect x="${(midX - labelW/2).toFixed(2)}" y="${(midY - 5).toFixed(2)}" width="${labelW.toFixed(2)}" height="${labelH}" fill="#ffffff"/>
    <text x="${midX.toFixed(2)}" y="${(midY + 3).toFixed(2)}" font-family="system-ui, -apple-system, sans-serif" font-size="8.5" fill="#000000" text-anchor="middle">${distText}</text>`;
  });

  svg += `
  </g>

  <!-- Point Landmark Dots (Simple solid black dots) -->
  <g id="points">`;

  projectedPoints.forEach(pt => {
    svg += `
    <circle cx="${pt.svgX.toFixed(2)}" cy="${pt.svgY.toFixed(2)}" r="6" fill="#000000"/>`;
  });

  svg += `
  </g>

  <!-- Point Landmark Labels (Simple black text centered slightly above) -->
  <g id="point-labels">`;

  projectedPoints.forEach(pt => {
    svg += `
    <text x="${pt.svgX.toFixed(2)}" y="${(pt.svgY - 12).toFixed(2)}" font-family="system-ui, -apple-system, sans-serif" font-size="11" font-weight="bold" fill="#000000" text-anchor="middle">${escapeHTML(pt.label)}</text>`;
  });

  svg += `
  </g>
</svg>
`;

  return svg;
}

/**
 * Trigger download of the minimal B&W SVG projection
 */
function downloadSVG() {
  const svgContent = generateMinimalSVGString();
  if (!svgContent) {
    alert("Cannot generate 2D projection. Please make sure the 3D model is reconstructed.");
    return;
  }
  
  const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.href = url;
  link.download = `measurit-projection-${new Date().toISOString().slice(0, 10)}.svg`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Bind download button click event
downloadSvgBtn.addEventListener('click', downloadSVG);

// ==========================================================================
// Initial Boot Trigger
// ==========================================================================
fetchData(false, true);
// Periodically poll for changes (optional, but standard fetch on boot is robust)
