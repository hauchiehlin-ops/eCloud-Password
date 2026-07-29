# PAC (Project Autonomic Core) Usage Guide

This directory contains the **Digital Immune Hub** for this project.

## How to Deploy to a New Project
1. Copy the `.pac/` folder to the root of your new project.
2. Run the initialization script:
   ```bash
   bash .pac/scripts/init.sh
   ```

## How to Trigger PAC in Antigravity
Simply mention **"Activate PAC"** or **"Run PAC Diagnosis"** in your request. Antigravity will:
1. Load `.pac/core.md` as its behavioral protocol.
2. Respect the boundaries set in `.pac/config.json`.
3. Log all autonomic decisions in `.pac/memory/`.

## Key Files
- `core.md`: The MAPE-K protocol (Do not edit).
- `config.json`: Project-specific settings (Adjust paths here).
- `memory/`: This is where PAC stores its "Knowledge" (K).

## Safety First
PAC is equipped with a **Circuit Breaker**. If it cannot fix a problem within 5 attempts, or if the change is too large, it will automatically stop and ask for your help.
