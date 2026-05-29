
# 🎮 Playful (v8.0 Unicorn Edition)

> **Turn your words into worlds.** Playful is an enterprise-grade, secure, prompt-to-game engine designed specifically for the mobile creator economy. It automates the entire pipeline from a text prompt to an interactive 3D browser sandbox and a fully compiled, monetized Android APK.

---

## 👁️ Our Vision

We believe that the next generation of massive gaming franchises won't be built by sprawling studios with multi-million dollar budgets—they will be created by solo dreamers, student side-hustlers, and independent creators working straight from their phones. 

The traditional game development pipeline is broken. It forces creators to spend months learning complex math, node graphs, coding languages, and rendering systems just to get a basic prototype running. 

**Playful is the ultimate equalizer.** By combining the raw power of advanced LLMs with clean, decoupled, industry-standard open-source schemas (like Babylon.js, LDtk, and Yarn Spinner), we collapse the time-to-market from 6 months to 60 seconds. Our vision is to democratize game creation, providing a seamless factory that takes you from a raw spark of imagination straight to a fully monetized, production-ready mobile asset on the Google Play Store. We aren't just building a game tool; we are building the infrastructure for the decentralized mobile creator economy.

---

## 🚀 Core Architecture & Features

Unlike generic web-based prompt-to-game builders, Playful is engineered around a decoupled, modular pipeline built on professional studio standards:

* **Secure Gateway:** FastAPI backend protected by strict CORS domain locks, Pydantic input validation, and automatic API rate-limiting.
* **Persistent State Management:** Live generation and APK build states are tracked securely via Supabase. If a connection drops, your progress resumes seamlessly.
* **The Decoupled V3 Pipeline:** * **LDtk / Tiled Grid Schemas:** Level layouts are parsed into optimized matrix data, drastically cutting down AI token costs.
    * **Yarn Spinner Logic:** Dialogue trees are decoupled from the engine logic, reading screenplays like an actual script.
    * **Procedural Rendering:** Connects to asset pipelines to fetch CC0-licensed 3D models and generate textures dynamically.
* **1-Click Mobile Factory:** Automatically dispatches builds to GitHub Actions using Capacitor to compile fully signed, native Android (`.apk`) packages.
* **Instant Auto-Monetization:** Seamlessly injects custom Google AdMob Banner and Interstitial IDs right into the native code during compilation.

---

## 🛠️ Tech Stack

* **Backend:** Python, FastAPI, Uvicorn, SlowAPI
* **AI Models:** Gemini 1.5 Pro (Game Core Assembly), Gemini 1.5 Flash (Keyword Extraction)
* **Database & Auth:** Supabase (PostgreSQL)
* **Frontend Runtime:** Babylon.js (WebGL 3D Engine)
* **CI/CD & Mobile Compilation:** GitHub Actions, Capacitor, Android Gradle Pipeline

---
