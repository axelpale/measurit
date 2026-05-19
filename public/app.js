// DOM Elements
const textInput = document.getElementById('textInput');
const measureBtn = document.getElementById('measureBtn');
const clearBtn = document.getElementById('clearBtn');
const charCountdown = document.getElementById('charCountdown');

// Metric Display Elements
const valWords = document.getElementById('valWords');
const valCharacters = document.getElementById('valCharacters');
const valCharNoSpaces = document.getElementById('valCharNoSpaces');
const valSentences = document.getElementById('valSentences');
const valAvgWordLength = document.getElementById('valAvgWordLength');
const valReadingTime = document.getElementById('valReadingTime');
const valReadabilityScore = document.getElementById('valReadabilityScore');
const valReadabilityLevel = document.getElementById('valReadabilityLevel');

// Update character countdown as user types (local immediate feedback)
textInput.addEventListener('input', () => {
  const count = textInput.value.length;
  charCountdown.textContent = `${count.toLocaleString()} character${count === 1 ? '' : 's'}`;
});

// Reset dashboard to zero values
function resetDashboard() {
  updateMetric(valWords, '0');
  updateMetric(valCharacters, '0');
  updateMetric(valCharNoSpaces, '0 without spaces');
  updateMetric(valSentences, '0');
  updateMetric(valAvgWordLength, '0.0');
  updateMetric(valReadingTime, '< 10 sec');
  updateMetric(valReadabilityScore, '0.0');
  
  valReadabilityLevel.textContent = 'Ready to measure';
  valReadabilityLevel.style.background = 'rgba(255, 255, 255, 0.05)';
  valReadabilityLevel.style.color = 'var(--text-secondary)';
}

// Clear Action
clearBtn.addEventListener('click', () => {
  textInput.value = '';
  charCountdown.textContent = '0 characters';
  resetDashboard();
  textInput.focus();
});

// Update value with micro-animation pulse
function updateMetric(element, value) {
  if (element.textContent !== value) {
    element.textContent = value;
    element.classList.remove('pulse-highlight');
    // Trigger reflow to restart animation
    void element.offsetWidth; 
    element.classList.add('pulse-highlight');
  }
}

// Style readability badge based on complexity score
function styleReadabilityBadge(level, score) {
  valReadabilityLevel.textContent = level;
  const scoreNum = parseFloat(score);

  if (scoreNum === 0) {
    valReadabilityLevel.style.background = 'rgba(255, 255, 255, 0.05)';
    valReadabilityLevel.style.color = 'var(--text-secondary)';
  } else if (scoreNum <= 4) {
    // Easy reading (Green theme)
    valReadabilityLevel.style.background = 'rgba(16, 185, 129, 0.15)';
    valReadabilityLevel.style.color = 'var(--accent-green)';
  } else if (scoreNum <= 8) {
    // Moderate reading (Teal/Orange theme)
    valReadabilityLevel.style.background = 'rgba(20, 184, 166, 0.15)';
    valReadabilityLevel.style.color = 'var(--accent-teal)';
  } else if (scoreNum <= 12) {
    // High School (Orange theme)
    valReadabilityLevel.style.background = 'rgba(245, 158, 11, 0.15)';
    valReadabilityLevel.style.color = 'var(--accent-orange)';
  } else {
    // College level (Purple / Red theme)
    valReadabilityLevel.style.background = 'rgba(139, 92, 246, 0.15)';
    valReadabilityLevel.style.color = 'var(--accent-purple)';
  }
}

// Send input to Node.js backend for measurement
async function performMeasurement() {
  const text = textInput.value;

  // Set loading state
  measureBtn.disabled = true;
  const originalBtnHTML = measureBtn.innerHTML;
  measureBtn.innerHTML = `
    <span>Measuring...</span>
    <svg class="btn-icon spin" viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round" style="animation: spin 1s linear infinite;"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="7.76" x2="19.07" y2="4.93"></line></svg>
  `;

  // Inject dynamic keyframe for spinner if not present
  if (!document.getElementById('spin-style')) {
    const style = document.createElement('style');
    style.id = 'spin-style';
    style.textContent = '@keyframes spin { 100% { transform: rotate(360deg); } }';
    document.head.appendChild(style);
  }

  try {
    const response = await fetch('/api/measure', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      throw new Error(`Server returned error: ${response.status}`);
    }

    const data = await response.json();

    // Render results with smooth pulse animations
    updateMetric(valWords, data.words.toLocaleString());
    updateMetric(valCharacters, data.characters.toLocaleString());
    updateMetric(valCharNoSpaces, `${data.charactersNoSpaces.toLocaleString()} without spaces`);
    updateMetric(valSentences, data.sentences.toLocaleString());
    updateMetric(valAvgWordLength, data.avgWordLength);
    updateMetric(valReadingTime, data.readingTime);
    updateMetric(valReadabilityScore, data.readability.score);
    styleReadabilityBadge(data.readability.level, data.readability.score);

  } catch (error) {
    console.error('Measurement failed:', error);
    alert('Oops! Could not connect to the measurement server. Please make sure the backend is running.');
  } finally {
    // Restore button state
    measureBtn.disabled = false;
    measureBtn.innerHTML = originalBtnHTML;
  }
}

// Button Trigger
measureBtn.addEventListener('click', performMeasurement);

// Keyboard combination Cmd/Ctrl + Enter triggers measurement
textInput.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
    e.preventDefault();
    performMeasurement();
  }
});
