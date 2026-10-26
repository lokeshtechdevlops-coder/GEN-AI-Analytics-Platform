# GEN-AI Analytics Platform

The metadata-driven implementation and its current setup, migration procedure, API contracts and operational limits are documented in [docs/metadata-platform.md](docs/metadata-platform.md). The older sales-focused overview below describes the original prototype; the selected-dataset HTTP paths now use reviewed semantic models and deterministic pandas/Decimal query execution.

> **Enterprise Generative AI Analytics Platform** built on **SAP BTP Cloud Foundry**, combining a **Python FastAPI** backend, a **React + Vite + TypeScript** SPA, **SAP HANA Cloud Vector Engine**, and **SAP AI Core** LLM services.

---

## Table of Contents

- [Overview](#overview)
- [Key Features](#key-features)
- [Tech Stack](#tech-stack)
- [Project Architecture](#project-architecture)
- [Directory Structure](#directory-structure)
- [Prerequisites](#prerequisites)
- [Environment Configuration](#environment-configuration)
- [Local Development Setup](#local-development-setup)
  - [Backend (FastAPI)](#1-backend-fastapi)
  - [Frontend (React)](#2-frontend-react)
- [API Reference](#api-reference)
- [Database Schema](#database-schema)
- [BTP Cloud Foundry Deployment](#btp-cloud-foundry-deployment)
- [Scripts & Utilities](#scripts--utilities)

---

## Overview

The GEN-AI Analytics Platform is a full-stack enterprise analytics solution that lets business users interact with their sales data through:

- **Natural language** queries converted to SAP HANA SQL (Text-to-SQL)
- **Generative RAG chatbot** powered by SAP AI Core LLMs and vector similarity search
- **AI-driven custom graph generation** — describe a chart in plain English and get a rendered visualization
- **Executive sales dashboards** with KPIs, revenue trends, regional breakdowns, and product performance metrics

---

## Key Features

| Feature | Description |
|---|---|
| 📊 **Executive Dashboard** | KPI cards, monthly revenue trends, regional/country breakdown, quarterly performance, top products |
| 💬 **RAG Chatbot** | Multi-turn conversational AI backed by SAP HANA Vector Engine (`REAL_VECTOR(1536)`) and SAP AI Core LLM |
| 🔍 **Natural Language Analytics** | Text-to-SQL generation against a 39-column sales table with executive insight summaries |
| 📈 **Custom Graph Agent** | 10-step Python graph agent — describe a chart → AI generates & executes Python script → returns base64 PNG |
| 📁 **File Upload & Ingestion** | Upload `.xlsx` / `.csv` sales data, auto-parse with Pandas, and store vector embeddings in HANA |
| 🔄 **Stateless Graph Generation** | Each graph request spawns a unique temp script, runs in isolation (60 s timeout), and auto-cleans up |
| 🛡️ **BTP Native Deployment** | Full MTA manifest (`mta.yaml`) for SAP BTP CF with App Router, HDI Container, Destination Service, and HTML5 Repo |

---

## Tech Stack

### Backend
| Component | Technology |
|---|---|
| API Framework | FastAPI `≥0.109.0` + Uvicorn |
| Language | Python 3.x |
| Data Processing | Pandas `≥2.2.0`, NumPy `≥1.26.0`, OpenPyXL `≥3.1.2` |
| Visualization | Matplotlib `≥3.8.0`, Seaborn `≥0.13.0` |
| Database Client | `hdbcli ≥2.19.21` (SAP HANA Cloud) |
| Config | Pydantic Settings `≥2.1.0`, python-dotenv |
| HTTP | Requests `≥2.31.0` |

### Frontend
| Component | Technology |
|---|---|
| Framework | React `18.2.0` + TypeScript `5.2.x` |
| Build Tool | Vite `5.1.x` |
| Styling | Tailwind CSS `v4` |
| Icons | Lucide React `0.330.0` |
| HTTP Client | Axios `1.18.x` |

### SAP BTP / Infrastructure
| Component | Technology |
|---|---|
| Database | SAP HANA Cloud (HDI Container, `SALES_ANALYTICS` table, `VECTOR_TABLE`) |
| LLM / Embeddings | SAP AI Core (OAuth2 token auth, LLM completions, text embeddings) |
| App Router | `@sap/approuter` (Node.js) |
| Security | XSUAA (`xs-security.json`) |
| Deployment | Cloud Foundry MTA (`mta.yaml`) — `mbt` + `cf deploy` |

---

## Project Architecture

```
                      +------------------------------------------+
                      |     React SPA (Vite + TypeScript)         |
                      | Dashboard | Analytics | Chatbot | Graph   |
                      +--------------------+---------------------+
                                           |  HTTP / REST
                                           v
                      +------------------------------------------+
                      |    SAP App Router (@sap/approuter)        |
                      |  Routes: /api/* -> FastAPI backend        |
                      +--------------------+---------------------+
                                           |
                                           v
              +----------------------------------------------------+
              |              Python FastAPI Backend                 |
              |                                                    |
              |  /api/health   /api/dashboard   /api/analytics     |
              |  /api/chat     /api/upload      /api/graph/generate|
              |                                                    |
              |  +-----------+  +----------+  +-------------+     |
              |  | RAG Engine|  | Text-SQL |  | Graph Agent |     |
              |  | (pipeline)|  |Generator |  | (10-step)   |     |
              |  +-----+-----+  +----+-----+  +------+------+     |
              +--------|--------------|--------------|-----------+
                       |              |              |
              +--------v--------------v--------------v-----------+
              |                  SAP AI Core                       |
              |   Token Auth . LLM Completions . Text Embeddings   |
              +---------------------------------------------------+
                       |
              +--------v------------------------------------------+
              |                 SAP HANA Cloud                     |
              |  SALES_ANALYTICS (39 cols)  |  VECTOR_TABLE        |
              |  Sales views / procedures   |  REAL_VECTOR(1536)   |
              +---------------------------------------------------+
```

---

## Directory Structure

```
GEN-AI_Analytics_platform/
├── mta.yaml                          # BTP Cloud Foundry MTA deployment manifest
├── package.json                      # Root NPM scripts (start, build, backend, frontend)
├── xs-security.json                  # XSUAA security descriptor
├── .env.example                      # Environment variable template
│
├── router/                           # SAP App Router (Node.js)
│   ├── server.js                     # Approuter entry point
│   └── xs-app.json                   # Route definitions
│
├── backend/
│   ├── api/                          # Python FastAPI application
│   │   ├── app.py                    # FastAPI app + CORS + router registration
│   │   ├── config.py                 # Pydantic settings (AI Core, HANA, App config)
│   │   ├── requirements.txt          # Python dependencies
│   │   ├── Procfile                  # Cloud Foundry process definition
│   │   │
│   │   ├── routes/                   # FastAPI route handlers
│   │   │   ├── health.py             # GET /api/health
│   │   │   ├── dashboard.py          # GET /api/dashboard
│   │   │   ├── analytics.py          # POST /api/analytics (Text-to-SQL)
│   │   │   ├── chat.py               # POST /api/chat (RAG chatbot)
│   │   │   ├── upload.py             # POST /api/upload (file ingestion)
│   │   │   └── graph.py              # POST /api/graph/generate (custom chart)
│   │   │
│   │   ├── services/                 # Business logic layer
│   │   │   ├── ai_core_service.py    # SAP AI Core OAuth2 + LLM + embedding calls
│   │   │   ├── analytics_service.py  # Text-to-SQL orchestration
│   │   │   ├── dashboard_service.py  # KPI aggregation and dashboard data
│   │   │   ├── embedding_service.py  # Vector embedding generation
│   │   │   ├── excel_dataset_service.py # SAC Excel parsing with Pandas
│   │   │   ├── hana_service.py       # HANA query execution wrapper
│   │   │   ├── python_graph_agent.py # 10-step AI-driven graph generation agent
│   │   │   ├── upload_service.py     # File ingestion pipeline
│   │   │   └── vector_service.py     # HANA Vector similarity search
│   │   │
│   │   ├── rag/                      # RAG pipeline components
│   │   │   ├── pipeline.py           # End-to-end RAG orchestration
│   │   │   ├── retriever.py          # Vector similarity retrieval
│   │   │   ├── prompt_builder.py     # Context-aware prompt construction
│   │   │   └── generator.py          # LLM response generation
│   │   │
│   │   ├── analytics/                # Analytics module
│   │   │   ├── sql_generator.py      # Natural language -> SAP HANA SQL
│   │   │   ├── sql_executor.py       # Query execution against HANA
│   │   │   ├── metrics.py            # KPI and metric calculations
│   │   │   └── chart_generator.py    # Chart type recommendation logic
│   │   │
│   │   ├── database/                 # Database connection layer
│   │   │   ├── connection.py         # HANA connection pool management
│   │   │   ├── hana_client.py        # hdbcli wrapper for SQL execution
│   │   │   └── vector_client.py      # Vector table CRUD operations
│   │   │
│   │   ├── embeddings/               # Embedding pipeline
│   │   │   ├── embedding_generator.py # Text -> vector embeddings via AI Core
│   │   │   ├── embedding_loader.py   # Batch loading of embeddings
│   │   │   └── vector_store.py       # HANA vector upsert operations
│   │   │
│   │   ├── models/                   # Pydantic data models
│   │   │   ├── database_models.py    # HANA table ORM models
│   │   │   ├── request_models.py     # API request schemas
│   │   │   └── response_models.py    # API response schemas
│   │   │
│   │   ├── prompts/                  # LLM prompt templates
│   │   │   ├── sql_prompt.txt        # Text-to-SQL system prompt (39-col schema)
│   │   │   ├── analytics_prompt.txt  # Analytics insights prompt
│   │   │   └── chatbot_prompt.txt    # RAG chatbot system prompt
│   │   │
│   │   └── utils/                    # Shared utilities
│   │       └── logger.py             # Structured logging helper
│   │
│   └── db/                           # SAP HANA HDI database artifacts
│       ├── schema/
│       │   ├── sales.hdbtable        # SALES_ANALYTICS table (39 columns)
│       │   ├── vector_table.hdbtable # VECTOR_TABLE (REAL_VECTOR 1536-dim)
│       │   └── indexes.hdbindex      # Performance indexes
│       ├── views/
│       │   ├── sales_view.hdbview    # Analytics-optimized sales view
│       │   └── dashboard_view.hdbview# Dashboard aggregation view
│       ├── procedures/               # Stored procedures
│       └── data/                     # Seed data artifacts
│
├── frontend/                         # React + Vite + TypeScript SPA
│   ├── index.html                    # HTML entry point
│   ├── vite.config.ts                # Vite build configuration
│   ├── tsconfig.app.json             # TypeScript config
│   └── src/
│       ├── App.tsx                   # Root component + tab-based routing
│       ├── main.tsx                  # React DOM render entry
│       ├── components/
│       │   ├── Dashboard/            # Dashboard chart components
│       │   │   ├── KPICards.tsx      # Revenue, orders, margin KPI cards
│       │   │   ├── RevenueChart.tsx  # Monthly revenue trend chart
│       │   │   ├── RegionChart.tsx   # Regional sales distribution
│       │   │   ├── CountryChart.tsx  # Country-level breakdown
│       │   │   ├── QuarterlyChart.tsx# Quarterly performance chart
│       │   │   ├── CategoryChart.tsx # Category performance chart
│       │   │   └── TopProductsChart.tsx # Top products matrix
│       │   ├── Analytics/            # NL Analytics components
│       │   │   ├── AnalyticsPage.tsx # Query input + results layout
│       │   │   ├── DynamicChart.tsx  # Auto-renders recommended chart type
│       │   │   ├── SQLResult.tsx     # Generated SQL display
│       │   │   └── Insights.tsx      # AI-generated executive insights
│       │   ├── Chatbot/              # Conversational AI components
│       │   │   ├── ChatWindow.tsx    # Chat session container
│       │   │   ├── ChatHistory.tsx   # Message history with markdown rendering
│       │   │   ├── ChatInput.tsx     # Input bar with send controls
│       │   │   └── SuggestedQuestions.tsx # Quick-start question chips
│       │   ├── Graph/                # Custom Graph Agent UI
│       │   │   └── CustomGraphPage.tsx # Prompt input -> base64 PNG display
│       │   ├── Upload/               # File upload components
│       │   ├── Layout/               # App shell and navigation
│       │   └── Common/               # Shared/reusable UI components
│       ├── pages/                    # Page-level components
│       │   ├── Dashboard.tsx         # Assembles dashboard component grid
│       │   ├── Chatbot.tsx           # Chatbot page wrapper
│       │   ├── Analytics.tsx         # Analytics page wrapper
│       │   ├── Upload.tsx            # Upload page wrapper
│       │   └── NotFound.tsx          # 404 page
│       └── services/                 # Axios API client layer
│           ├── api.ts                # Base Axios instance config
│           ├── dashboard.ts          # Dashboard API calls
│           ├── analytics.ts          # Analytics (Text-to-SQL) API calls
│           ├── chatbot.ts            # Chat API calls
│           ├── graph.ts              # Custom graph API calls
│           └── upload.ts             # File upload API calls
│
├── docs/                             # Documentation
│   ├── architecture.md               # System architecture details
│   ├── api.md                        # API endpoint reference
│   ├── setup.md                      # Local development guide
│   └── deployment.md                 # BTP Cloud Foundry deployment guide
│
└── scripts/                          # Utility & automation scripts
    ├── generate_embeddings.py         # Batch vector embedding generation
    ├── upload_data.py                 # Bulk data upload to HANA
    └── deploy.sh                     # BTP deployment shell script
```

---

## Prerequisites

| Tool | Version | Purpose |
|---|---|---|
| Python | `3.10+` | Backend runtime |
| Node.js | `18+` | Frontend + App Router |
| npm | `9+` | Package management |
| SAP BTP Account | — | Cloud Foundry space |
| SAP HANA Cloud | — | Database + Vector Engine |
| SAP AI Core | — | LLM + Embeddings |
| `mbt` (MTA Build Tool) | latest | BTP deployment build |
| `cf` CLI | v8+ | Cloud Foundry deployment |

---

## Environment Configuration

Copy `.env.example` to `.env` in the project root and fill in your credentials:

```bash
cp .env.example .env
```

| Variable | Description | Example |
|---|---|---|
| `AICORE_AUTH_URL` | SAP AI Core OAuth2 token URL | `https://<tenant>.authentication.sap.hana.ondemand.com/oauth/token` |
| `AICORE_CLIENT_ID` | AI Core service binding client ID | `sb-...` |
| `AICORE_CLIENT_SECRET` | AI Core service binding client secret | `...` |
| `AICORE_RESOURCE_GROUP` | AI Core resource group | `default` |
| `AICORE_BASE_URL` | AI Core API base URL | `https://api.ai.prod.eu-central-1.aws.ml.hana.ondemand.com/v2` |
| `HANA_ADDRESS` | SAP HANA Cloud instance hostname | `<id>.hanadb.ondemand.com` |
| `HANA_PORT` | HANA port (default SSL) | `443` |
| `HANA_USER` | HANA database user | `DBADMIN` |
| `HANA_PASSWORD` | HANA database password | `...` |
| `HANA_SCHEMA` | Target schema | `SALES_ANALYTICS` |
| `APP_ENV` | Runtime environment | `development` / `production` |
| `LOG_LEVEL` | Logging verbosity | `INFO` |
| `PORT` | Backend server port | `8000` |

---

## Local Development Setup

### 1. Backend (FastAPI)

```bash
# Navigate to the backend API directory
cd backend/api

# Create and activate a virtual environment
python -m venv venv

# Windows
venv\Scripts\activate

# Linux / macOS
source venv/bin/activate

# Install Python dependencies
pip install -r requirements.txt

# Start the FastAPI development server
uvicorn app:app --reload --port 8000
```

Swagger UI (interactive API docs): [http://localhost:8000/docs](http://localhost:8000/docs)  
ReDoc: [http://localhost:8000/redoc](http://localhost:8000/redoc)  
Health check: [http://localhost:8000/api/health](http://localhost:8000/api/health)

---

### 2. Frontend (React)

```bash
# Navigate to frontend directory
cd frontend

# Install Node.js dependencies
npm install

# Start Vite dev server
npm run dev
```

Frontend SPA: [http://localhost:5173](http://localhost:5173)

> **Note:** Ensure the backend is running on port `8000` before using the frontend.

---

### Root-level Scripts

The root `package.json` provides convenience scripts:

```bash
npm run start:backend    # Starts FastAPI backend (uvicorn, port 8000)
npm run start:frontend   # Starts Vite frontend dev server (port 5173)
npm run build:frontend   # Production build of the React SPA -> frontend/dist/
npm run build            # Alias for build:frontend
npm run start            # Starts the App Router (for BTP local testing)
```

---

## API Reference

All endpoints are prefixed with `/api`. The Swagger UI at `/docs` provides a fully interactive reference.

### `GET /api/health`
Returns connection status for HANA and AI Core.

```json
{
  "status": "healthy",
  "app_name": "GEN-AI Analytics Platform API",
  "version": "1.0.0",
  "hana_connected": true,
  "ai_core_connected": true
}
```

---

### `GET /api/dashboard`
Returns aggregated sales KPIs and chart data for the executive dashboard.

**Response includes:** `kpis`, `revenue_trend`, `region_breakdown`, `country_breakdown`, `quarterly_performance`, `top_products`

---

### `POST /api/analytics`
Natural language query -> SAP HANA SQL -> results + AI insights.

```json
// Request
{
  "query": "Show total sales revenue by region ordered from highest to lowest",
  "chart_type": "auto"
}

// Response
{
  "query": "...",
  "generated_sql": "SELECT REGION, SUM(NET_REVENUE_USD) FROM SALES_ANALYTICS GROUP BY REGION ORDER BY 2 DESC",
  "results": [...],
  "summary_insights": "North America leads with 42% of total revenue...",
  "recommended_chart": "bar"
}
```

---

### `POST /api/chat`
Multi-turn RAG chatbot powered by vector similarity search + SAP AI Core LLM.

```json
// Request
{
  "message": "What was the gross margin in Q3 for the APAC region?",
  "session_id": "session_abc123",
  "top_k": 5
}

// Response
{
  "reply": "Based on the retrieved sales records, APAC Q3 gross margin was...",
  "sources": [...],
  "session_id": "session_abc123"
}
```

---

### `POST /api/upload`
Upload `.xlsx` or `.csv` sales data. Parses with Pandas, generates vector embeddings, stores in `VECTOR_TABLE`.

- **Content-Type:** `multipart/form-data`
- **Body field:** `file` (`.xlsx` or `.csv`)
- **Response:** Row count ingested, embedding count generated, status summary.

---

### `POST /api/graph/generate`
AI-powered custom graph agent — describe a visualization in plain English.

```json
// Request
{
  "prompt": "Show a stacked bar chart of quarterly revenue by product category"
}

// Response
{
  "status": "success",
  "prompt": "Show a stacked bar chart...",
  "image_base64": "data:image/png;base64,...",
  "chart_type": "stacked_bar",
  "insights": "Revenue grew 18% QoQ in Electronics...",
  "message": "Graph generated successfully"
}
```

**Supported chart types:** `bar`, `line`, `scatter`, `pie`, `donut`, `area`, `stacked_bar`, `heatmap`, `treemap`, `waterfall`, `funnel`, `violin`, `box`

---

## Database Schema

### `SALES_ANALYTICS` Table (39 Columns)

| Column | Type | Description |
|---|---|---|
| `OrderID` | INTEGER | Unique order identifier |
| `OrderDate` | DATE | Order date |
| `Year` / `Quarter` / `MonthNum` / `MonthName` | Various | Time dimensions |
| `Category` / `Subcategory` | NVARCHAR | Product classification |
| `ProductID` / `ProductName` | NVARCHAR | Product identifiers |
| `Region` / `Country` | NVARCHAR | Geographic dimensions |
| `IndustryVertical` | NVARCHAR | Industry segment |
| `CustomerID` / `CustomerName` / `CustomerSegment` | NVARCHAR | Customer details |
| `SalesRegion` / `SalesOffice` / `SalesRepID` / `SalesRepName` / `SalesRepRole` | NVARCHAR | Sales team hierarchy |
| `Channel` / `OrderType` / `OrderStatus` / `PaymentTerms` | NVARCHAR | Transaction metadata |
| `Quantity` | INTEGER | Units ordered |
| `UnitListPriceUSD` / `DiscountPercent` / `NetUnitPriceUSD` | DECIMAL | Pricing |
| `NetRevenueUSD` / `UnitCostUSD` / `TotalCostUSD` / `GrossMarginUSD` / `GrossMarginPercent` | DECIMAL | Financial metrics |
| `TransactionCurrency` / `FXRateToUSD` / `NetRevenueLocalCurrency` | Various | Multi-currency support |

### `VECTOR_TABLE`

Stores 1536-dimensional vector embeddings (`REAL_VECTOR(1536)`) for RAG similarity search over ingested sales documents.

---

## BTP Cloud Foundry Deployment

### Prerequisites

1. Install [Cloud MTA Build Tool](https://sap.github.io/cloud-mta-build-tool/): `npm install -g mbt`
2. Install [CF CLI](https://docs.cloudfoundry.org/cf-cli/install-go-cli.html) and log in: `cf login -a <API_ENDPOINT>`
3. Ensure bound BTP services exist in your CF space.

### Build & Deploy

```bash
# 1. Build the MTA archive (compiles frontend, packages backend + router)
mbt build -t ./

# 2. Deploy to your BTP Cloud Foundry space
cf deploy GEN-AI-Analytics-Platform_1.0.0.mtar
```

### MTA Modules

| Module | Type | Path | Memory |
|---|---|---|---|
| `gen-ai-analytics-platform-router` | `approuter.nodejs` | `./router` | 128 MB |
| `gen-ai-analytics-platform-api` | `python` | `./backend/api` | 512 MB |
| `gen-ai-analytics-platform-ui` | `html5` | `./frontend` | — |
| `gen-ai-analytics-platform-app-deployer` | `html5.application-content` | `./frontend` | — |
| `gen-ai-analytics-platform-db-deployer` | `hdb` | `./backend/db` | 256 MB |

### Required BTP Services

| Service | Plan | Purpose |
|---|---|---|
| `html5-apps-repo` (host) | `app-host` | Hosts React SPA static assets |
| `html5-apps-repo` (runtime) | `app-runtime` | Serves HTML5 app at runtime |
| `destination` | `lite` | Routes API calls to FastAPI backend |
| `hdi-container` (HANA) | `hdi-shared` | SAP HANA HDI database container |

> The API backend auto-scales between **1–2 instances** based on memory utilization (>=80% scale up) and CPU usage (>=80% scale up).

---

## Scripts & Utilities

| Script | Description |
|---|---|
| `scripts/generate_embeddings.py` | Batch-generate vector embeddings for existing HANA records |
| `scripts/upload_data.py` | Bulk-upload sales data rows directly into HANA |
| `scripts/deploy.sh` | Shell helper for automated BTP build and deploy |

---

## Project Info

- **Version:** 1.0.0
- **License:** ISC
- **Author:** [tlokeshkumar1](https://github.com/tlokeshkumar1)
