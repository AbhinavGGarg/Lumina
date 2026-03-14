# Pulse - Autonomous Penetration Testing Agent

Pulse is an intelligent, agent-driven penetration testing platform built with Next.js, FastAPI, and LangGraph. It automatically fingerprints repositories or web targets, dynamically selects the appropriate suite of security tools, and uses LLMs to interpret the raw output to generate actionable vulnerability reports.

## Prerequisites

- **Docker & Docker Compose** (Required for the backend to run security tools like `nmap`, `sqlmap`, `trufflehog`, etc.)
- **pnpm** (Required to run the frontend natively)
- **Ollama** (Required locally for the LLM inference. MacOS users must run `launchctl setenv OLLAMA_HOST "0.0.0.0"` before starting Ollama to allow Docker to connect).

## Quick Start (Development)

The backend relies on numerous Linux-based security binaries (Go tools, Ruby scripts, C packages). To ensure everything runs smoothly without contaminating your local machine, the backend runs entirely inside Docker, while you run the frontend natively for fast hot-reloading.

### 1. Start the Backend & Target Sandbox
Run this command from the root of the project to spin up the FastAPI backend and a local vulnerable target (OWASP Juice Shop) for testing:

```bash
docker compose -f docker-compose.dev.yml up -d --build
```
*The backend will be available at `http://localhost:8000`*

### 2. Start the Frontend
Run this natively on your machine:
```bash
pnpm install
pnpm dev
```
*The frontend will be available at `http://localhost:3000`*

## Docker Commands Cheat Sheet

If you modify the Python backend codebase, the changes will hot-reload automatically inside the container. 

However, if you need to manually interact with the Dockerized backend, use these commands:

```bash
# View backend live logs (press Ctrl+C to exit)
docker logs pulse-dev-backend -f

# Restart the backend container (if you change environment variables or prompts)
docker restart pulse-dev-backend

# Stop all containers when you are done working
docker compose -f docker-compose.dev.yml down
```

## Running Scans Locally

Since the backend runs inside a Docker virtual network, when you want to scan the local OWASP target container, you must use the `host.docker.internal` or container name alias in the UI:

- **Target URL:** `http://pulse-dev-target:3001` or `http://host.docker.internal:3001`
