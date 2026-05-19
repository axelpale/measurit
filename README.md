# measurit 📏

[Insert introduction here]

---

## ✨ Features

[Insert features here]

---

## 🛠️ Tech Stack

Node.js, Express, HTML5, CSS3, JS (ES6)

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (Version 18.11.0+ recommended for native `--watch` capabilities)
- npm (Node Package Manager)

### Installation

1. Clone or navigate to the project directory:
   ```bash
   cd /Users/xeli/Build/measurit
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

### Running the Application

To start the server with the hot-reloading development script:
```bash
npm run dev
```

To run in standard production mode:
```bash
npm start
```

The application will start, listening on port `3000`. Open your browser and navigate to:
**[http://localhost:3000](http://localhost:3000)**

---

## 📁 Project Structure

```text
measurit/
├── public/                 # Static Frontend Assets
│   ├── index.html          # Dynamic HTML Layout
│   ├── style.css           # Custom Premium Design System
│   └── app.js              # Client-side Logic & DOM manipulation
├── server.js               # Node.js Express server & Text analysis algorithms
├── package.json            # Configuration and script definition
└── .gitignore              # Environment configurations & Ignored folders
```

---

## 🔌 API Endpoints

### `POST /api/measure`

Analyzes textual inputs and returns completed text statistics.

* **Headers**: `Content-Type: application/json`
* **Request Payload**:
  ```json
  {
    "text": "Your textual analysis content here."
  }
  ```
* **Response Payload (200 OK)**:
  ```json
  {
    "characters": 35,
    "charactersNoSpaces": 30,
    "words": 5,
    "sentences": 1,
    "avgWordLength": "6.0",
    "readingTime": "< 10 sec",
    "readability": {
      "score": "6.4",
      "level": "6th Grade (Moderate)"
    }
  }
  ```

---

## 📄 License

This project is licensed under the ISC License.
