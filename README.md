---
title: Knowledge Assistant RAG
emoji: 📚
colorFrom: blue
colorTo: green
sdk: docker
pinned: false
app_port: 8000
---

# Knowledge Assistant RAG Backend

This is the backend server for the Knowledge Assistant RAG application.

It provides API endpoints for:
- User authentication (register, login)
- Document upload, processing, and embedding
- Answering questions using a Retrieval-Augmented Generation (RAG) pipeline with Google Gemini.

### **Deployment**

This application is configured to be deployed on Hugging Face Spaces using a Docker container.

**Required Secrets (Environment Variables):**
- `DATABASE_URL`: The connection string for the external PostgreSQL database (e.g., from Neon or Supabase). Format: `postgresql+asyncpg://...`
- `QDRANT_URL`: The URL for your Qdrant Cloud cluster.
- `QDRANT_API_KEY`: The API key for your Qdrant Cloud cluster.
- `GEMINI_API_KEY`: Your Google Gemini API key.
- `JWT_SECRET`: A long, random string for signing JWTs.
- `CORS_ORIGINS`: The URL of the deployed frontend (e.g., `https://knowlege-assistant-frontend.vercel.app`).