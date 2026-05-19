const express = require('express');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware to parse JSON payloads
app.use(express.json());

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

/**
 * Calculates Automated Readability Index (ARI)
 * Returns score and corresponding US school grade level / description
 */
function calculateReadability(chars, words, sentences) {
  if (words === 0 || sentences === 0) return { score: 0, level: 'N/A' };
  
  const score = 4.71 * (chars / words) + 0.5 * (words / sentences) - 21.43;
  const rounded = Math.max(1, Math.min(14, Math.round(score)));
  
  const levels = {
    1: 'Kindergarten / 1st Grade (Easy)',
    2: '2nd Grade (Easy)',
    3: '3rd Grade (Easy)',
    4: '4th Grade (Easy)',
    5: '5th Grade (Moderate)',
    6: '6th Grade (Moderate)',
    7: '7th Grade (Moderate)',
    8: '8th Grade (Moderate)',
    9: '9th Grade / High School',
    10: '10th Grade / High School',
    11: '11th Grade / High School',
    12: '12th Grade / High School',
    13: 'College Student (Difficult)',
    14: 'College Graduate (Very Difficult)'
  };
  
  return {
    score: score.toFixed(1),
    level: levels[rounded] || 'Professional / Academic'
  };
}

// POST endpoint for measuring text metrics
app.post('/api/measure', (req, res) => {
  const { text } = req.body;
  
  if (typeof text !== 'string') {
    return res.status(400).json({ error: 'Invalid input. "text" must be a string.' });
  }

  const trimmedText = text.trim();
  
  if (!trimmedText) {
    return res.json({
      characters: 0,
      charactersNoSpaces: 0,
      words: 0,
      sentences: 0,
      avgWordLength: '0.0',
      readingTime: '0.0 min',
      readability: { score: '0.0', level: 'Empty Text' }
    });
  }

  // Calculations
  const characters = trimmedText.length;
  const charactersNoSpaces = trimmedText.replace(/\s+/g, '').length;
  
  // Split words by standard whitespace, filter out empty elements
  const wordsArray = trimmedText.split(/\s+/).filter(word => word.length > 0);
  const words = wordsArray.length;
  
  // Sentences split by ., !, or ? (ignoring consecutive punctuation and ensuring not empty)
  const sentencesArray = trimmedText.split(/[.!?]+/).filter(s => s.trim().length > 0);
  const sentences = sentencesArray.length || 1; // default to at least 1 sentence if words exist

  const avgWordLength = (words > 0 ? (charactersNoSpaces / words) : 0).toFixed(1);
  
  // Reading time based on 200 WPM
  const readingTimeVal = words / 200;
  let readingTime = '';
  if (readingTimeVal < 0.1) {
    readingTime = '< 10 sec';
  } else if (readingTimeVal < 1) {
    readingTime = `${Math.round(readingTimeVal * 60)} sec`;
  } else {
    readingTime = `${readingTimeVal.toFixed(1)} min`;
  }

  // Calculate Automated Readability Index
  const readability = calculateReadability(charactersNoSpaces, words, sentences);

  res.json({
    characters,
    charactersNoSpaces,
    words,
    sentences,
    avgWordLength,
    readingTime,
    readability
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Measureit server running at http://localhost:${PORT}`);
});
