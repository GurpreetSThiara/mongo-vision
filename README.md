# MongoVision 🚀

**MongoVision** is an advanced, full-stack MongoDB database visualization and management tool designed to provide a superior experience compared to traditional tools like MongoDB Compass.

## ✨ Features

- **Connection Manager**: Effortlessly connect to any MongoDB URI (local, Atlas, etc.).
- **Database Explorer**: Intuitive sidebar navigation with database and collection trees.
- **Document Viewer**: High-performance virtualized table with JSON tree expansion, inline editing, and smart filtering.
- **Schema Analyzer**: Automatically infers schemas from sample documents with prevalence detection and inconsistency alerts.
- **Query Builder**: Raw JSON editor, aggregation pipeline support, and real-time result preview.
- **Index Manager**: Comprehensive tools to view, create, and drop indexes with usage statistics.
- **Performance Insights**: Dedicated explain plan viewer and index suggestions to optimize your queries.
- **Data Visualization**: Dynamic charts (Bar, Line, Pie) powered by Recharts.
- **Import/Export**: Seamless data movement via JSON and CSV support.

## 🛠️ Tech Stack

- **Monorepo**: pnpm workspaces
- **Backend**: Express 5 (Node.js) with MongoDB Native Driver
- **Frontend**: React 19 + Vite + TailwindCSS 4
- **State Management**: TanStack Query (React Query)
- **UI Components**: Radix UI + Lucide Icons + Framer Motion
- **Editor**: Monaco Editor for JSON/Query building

## 🪄 The Creation Story (Vibe Coding)

This project was built purely using **Vibe Coding** — a methodology where humans and AI stay in a high-synchronicity creative flow to rapidly iterate from idea to production-grade software.

It started its life in **Replit AI** and was brought to completion using **Google Antigravity**. Every line of code, every component, and every logic block was evolved through this deep human-AI partnership.

---

## 🚀 Getting Started

### Prerequisites

- Node.js 24+
- pnpm

### Installation

```bash
# Clone the repository
git clone https://github.com/GurpreetSThiara/mongo-vision.git

# Install dependencies
pnpm install

# Run the development environment
pnpm dev
```

### Development

The project is structured as a pnpm monorepo:
- `artifacts/mongo-vision`: The React frontend.
- `artifacts/api-server`: The Express backend.
- `lib/*`: Shared libraries and configurations.

---

Developed with ❤️ and 🤖.
