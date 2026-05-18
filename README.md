
<div align="center">

<!-- TODO: Inserir a logo do projeto aqui -->
<!-- <img src="assets/logo.png" width="150" alt="GML Assistant Logo" /> -->

# GML Assistant
### AI Workspace Companion for GameMaker Studio 2

<p>
Context-aware AI tooling focused on large GML projects, debugging, refactoring, and accelerated implementation workflows.
</p>

<img src="https://img.shields.io/badge/Open%20Source-Yes-3fb950?style=for-the-badge" />
<img src="https://img.shields.io/badge/License-MIT-blue?style=for-the-badge" />
<img src="https://img.shields.io/badge/Platform-Windows-0078D6?style=for-the-badge" />

<br/>

<img src="https://img.shields.io/badge/Frontend-React-20232A?style=flat-square&logo=react&logoColor=61DAFB" />
<img src="https://img.shields.io/badge/Desktop-Electron-191970?style=flat-square&logo=electron&logoColor=white" />
<img src="https://img.shields.io/badge/Runtime-Node.js-43853D?style=flat-square&logo=node.js&logoColor=white" />
<img src="https://img.shields.io/badge/AI-llama.cpp-black?style=flat-square" />
<img src="https://img.shields.io/badge/Inference-GGUF-red?style=flat-square" />
<img src="https://img.shields.io/badge/CUDA-Supported-76B900?style=flat-square&logo=nvidia&logoColor=white" />

</div>

---

> **Philosophy:** AI should enhance engineering workflows, not replace engineering discipline. This is not an autonomous game generator; it is a collaborative technical accelerator.

## 📖 Table of Contents
- [Overview](#-overview)
- [Key Features](#-key-features)
- [Local & Cloud AI Support](#-local--cloud-ai-support)
- [Installation & Setup](#-installation--setup)
- [Recommended Workflow](#-recommended-workflow)
- [Disclaimer & Contributing](#-disclaimer--contributing)

---

## 🔍 Overview

**GML Assistant** is an open-source desktop application created specifically for GameMaker Studio 2 developers working with medium to large `.yyp` projects. 

Instead of behaving like a generic browser chatbot disconnected from your code, this application acts as a **workspace companion**. It understands your project structure, retrieves relevant files, analyzes relationships between scripts and objects, and provides context-aware assistance focused on actual engineering tasks.

Copy-pasting fragments of code into a web chat quickly becomes inefficient as a project scales. GML Assistant solves this by reducing the friction involved in maintaining large GML codebases, debugging complex interactions, and accelerating boilerplate generation.

<!-- TODO: Inserir uma screenshot geral da UI aqui -->
<!-- ![GML Assistant UI](docs/screenshot_main.png) -->

---

## ✨ Key Features

* 🕸️ **Visual Relationship Workspace:** Automatically maps your project's architecture into a node-based "solar system" graph. Instantly see which scripts call which functions, where `global` variables are shared, and how shaders are linked.
* 🧠 **Smart Context Retrieval (RAG):** You don't need to manually paste dozens of files. The AI automatically weights and fetches the most relevant scripts and dependencies based on what you are currently editing.
* ⚖️ **Diff Review System:** Rather than blindly injecting generated code, modifications are presented in a dedicated comparison viewer. Inspect the old code, the AI's proposal, and the reasoning behind it before applying.
* 🔄 **Auto-Registration:** When the AI creates a new script, object, or shader, it automatically registers the asset into your `.yyp` file. GameMaker will detect the new item instantly without drag-and-drop.
* 🛡️ **AI Artifact Sanitizer:** LLMs sometimes produce hidden characters (zero-width spaces) that silently break GML compilation. The app features a built-in scanner to sanitize your project automatically.
* 💾 **Safe Execution:** Automatic `.bak` backups are created before any destructive edits are applied to your codebase.

<!-- TODO: Inserir um GIF do Diff Viewer ou do Grafo Visual -->
<!-- ![Visual Workspace Demo](docs/graph_demo.gif) -->

---

## 🤖 Local & Cloud AI Support

GML Assistant is built to be flexible, allowing you to choose between maximum privacy or maximum reasoning power.

### Local Inference (Offline & Private)
The application integrates with `llama.cpp` and `node-llama-cpp` to run **GGUF models** directly on your hardware.
* **100% Offline:** Your privacy-sensitive projects never leave your machine.
* **Zero Costs:** Unlimited prompting and experimentation.
* **Optimized for VRAM:** Supports dynamic GPU offloading and KV cache quantization (`f16`, `q8_0`, `q4_0`), allowing you to run massive context windows even on consumer GPUs.
* **Built-in Model Hub:** Download and manage models (Qwen, Llama, DeepSeek, Mistral) directly inside the app.

### Cloud API Support
If you lack powerful local hardware or need access to frontier reasoning models, the app supports OpenAI-compatible APIs.
* Supported providers include **OpenAI, Google Gemini, Groq, DeepSeek, and OpenRouter**.
* Switch seamlessly between local iterative debugging and cloud-based architectural discussions.

---

## ⚙️ Installation & Setup

Because the application relies on Electron, Node.js, and native bindings for GPU acceleration, the setup requires specific build tools.

### Prerequisites (Windows Recommended)
1. **Node.js:** v18 or newer.
2. **Visual Studio Community:** Must be installed with the **“Desktop development with C++”** workload enabled (Required to compile `node-llama-cpp`).
3. **NVIDIA Users (Optional but Highly Recommended):** Install the [CUDA Toolkit](https://developer.nvidia.com/cuda-toolkit) and ensure your drivers are updated. Verify by running `nvcc --version` in your terminal.

### Build Instructions

```bash
# 1. Clone the repository
git clone https://github.com/yourusername/gml-assistant.git
```
```bash
# 2. Navigate to the folder
cd gml-assistant
```
```bash
# 3. Install dependencies (This will compile native C++ bindings, which may take a few minutes)
npm install
```
```bash
# 4. Start the application
npm run dev
```

---

## 🛠️ Recommended Workflow

This tool is **not designed for "vibe coding"**. It will not magically produce a complete game from a vague prompt. Attempting to use it that way usually leads to poor project structure.

**The intended workflow is collaborative:**
1. **You** define the architecture, mechanics, rules, and system boundaries.
2. **The AI** assists with implementation, iteration, refactoring, finding obscure edge cases, and boilerplate generation.
3. **Review & Iterate:** Use the Diff Viewer to manually validate generated logic before integrating changes into production systems. 

**Best Use Cases:** Long debugging sessions, shader experimentation, movement logic, save/inventory systems, dialogue frameworks, and general refactoring.

---

## ⚠️ Disclaimer

Let's be honest: **I am not a senior software engineer.** I built GML Assistant because I needed it for my own GameMaker projects, and it eventually evolved into something genuinely useful worth sharing. 

Because of this, the codebase is a reflection of a solo developer figuring things out as they go. There are certainly areas that can be optimized, refactored, or rewritten entirely.

**Use the software at your own risk.** Always maintain proper version control (Git) before allowing any automated system to modify your project files. AI systems can produce incorrect logic, hallucinated APIs, or destructive edits. The assistant should be treated as a development aid, not an infallible authority.

---

## 🤝 Contributing: I Need Your Help!

Because this is a 100% free, passion-driven, and open-source project, **I highly encourage developers with more experience to jump in and help.** 

If you are a seasoned engineer looking for a cool open-source project to contribute to, your expertise is extremely welcome here. I am totally open to PRs that refactor bad code, improve performance, or rethink architectural decisions.

**Areas where help is highly appreciated:**
* ⚛️ **React & Electron Devs:** Improving UI rendering performance (especially the Visual Graph), state management, and component refactoring.
* 🧠 **AI / RAG Enthusiasts:** Tweaking the context retrieval math, optimizing token budgets, and improving prompt engineering for local models.
* 🎮 **GameMaker Experts:** Better parsing of `.yyp` files, handling edge cases in GML syntax, and improving the Auto-Registration features.
* 🐛 **General Bug Fixing:** Finding and fixing edge cases that break the app or the Diff Viewer.

Don't be shy! Whether it's a massive architecture overhaul, a performance tweak, or just fixing a typo, feel free to open an **Issue** or a **Pull Request**. Let's build the ultimate GameMaker AI companion together.

---

## 📄 License

This project is distributed under the **MIT License**. You are free to use, modify, distribute, and adapt the software according to the terms of the license.

