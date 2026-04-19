"use client"

import type React from "react"

import { useState, useEffect, useCallback } from "react"
import { UserAuth } from "@/context/auth-context" // Import UserAuth
import AuthForm from "../auth-form" // Import AuthForm
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/config/firebase";
import { AssistantConfigData, UserSettings } from "./assistant-types";
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Plus, Settings, Camera, FileImage, Upload, Globe, X, ChevronDown, ShieldAlert } from "lucide-react" // Import ShieldAlert
import StarryBackground from "@/components/ui/starry-background/starry-background"
import { Badge } from "@/components/ui/badge" // Import Badge
import LoadingSpinner from "@/components/loading-spinner" // Import LoadingSpinner
import CodeEditor from "./code-editor/code-editor"
import Canvas from "./canvas/canvas"
import ChatPanel from "./chat-panel/chat-panel"
import ProjectSidebar from "./project-sidebar/project-sidebar"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import PictureInPicture from "@/components/ui/picture-in-picture"
import AssistantNavBar from "./assistant-nav-bar"

 interface Model {
   id: string;
  name: string;
  provider: string;
}

interface ChatInterfaceProps {
  isPublic?: boolean;
  unavailableMessage?: string;
}

export default function ChatInterface({ isPublic: propIsPublic, unavailableMessage: propUnavailableMessage }: ChatInterfaceProps) {
  const { user, userClaims, loading } = UserAuth() as any; // Get user, userClaims, and loading state
  const [inputValue, setInputValue] = useState("")
  const [code, setCode] = useState(`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Graviton — AI Code Generator</title>
  <meta name="description" content="Welcome to Graviton — the AI code generator for developers and teams. Beautiful, modern standalone demo app." />
  <!-- Tailwind CDN for quick standalone styling -->
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;600;800&display=swap" rel="stylesheet">
  <style>
    :root{--glass: rgba(255,255,255,0.06);--glass-2: rgba(255,255,255,0.04);}
    body{font-family:Inter,ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial}
    .frost{backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);}
    /* subtle code block styling */
    pre.code{white-space:pre-wrap;word-wrap:break-word;border-radius:12px;padding:16px;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Roboto Mono,monospace;font-size:13px}
    /* floating hotkey hint */
    .kbd{background:rgba(0,0,0,0.5);border-radius:6px;padding:4px 8px;font-weight:600}
  </style>
</head>
<body class="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#07113a] to-[#041127] text-slate-100">
  <div class="max-w-7xl mx-auto px-6 py-10">
    <header class="flex items-center justify-between">
      <a href="#" class="flex items-center gap-3">
        <div class="w-10 h-10 rounded-2xl bg-gradient-to-r from-pink-500 via-indigo-500 to-cyan-400 flex items-center justify-center shadow-2xl">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12 2L15 8L22 9L17 14L18 21L12 18L6 21L7 14L2 9L9 8L12 2Z" fill="white"/></svg>
        </div>
        <div>
          <div class="text-lg font-extrabold tracking-tight">Graviton</div>
          <div class="text-xs text-slate-400 -mt-1">AI code generator</div>
        </div>
      </a>
      <nav class="hidden md:flex items-center gap-6 text-sm text-slate-300">
        <a href="#features" class="hover:text-white">Features</a>
        <a href="#demo" class="hover:text-white">Demo</a>
        <a href="#pricing" class="hover:text-white">Pricing</a>
        <button id="ctaTop" class="ml-2 bg-white text-[#061028] font-semibold px-4 py-2 rounded-lg shadow">Start free</button>
      </nav>
    </header>

    <main class="mt-12 grid grid-cols-1 md:grid-cols-2 gap-10 items-start">
      <section>
        <h1 class="text-4xl md:text-5xl font-extrabold leading-tight">Welcome to <span class="text-transparent bg-clip-text bg-gradient-to-r from-pink-400 via-indigo-400 to-cyan-300">Graviton</span>,<br class="hidden sm:inline"/> the AI code generator.</h1>
        <p class="mt-4 text-lg text-slate-300 max-w-prose">Write prompts, generate production-ready code, scaffold apps, and iterate faster — all inside a sleek, SaaS-style interface. Perfect for devs, startups, and teams.</p>

        <div class="mt-6 flex gap-3 items-center">
          <input id="prompt" class="flex-1 bg-[#071238] border border-slate-800 rounded-lg px-4 py-3 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="E.g. "Build a responsive navbar in Tailwind and vanilla JS"" />
          <button id="generate" class="bg-gradient-to-r from-pink-500 to-indigo-600 px-4 py-3 rounded-lg font-semibold shadow hover:scale-[1.01] transition">Generate</button>
        </div>

        <div class="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="p-4 rounded-2xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.03)] frost">
            <div class="text-xs text-slate-400">Model</div>
            <div class="mt-2 font-semibold">graviton-2.1</div>
            <div class="mt-3 text-sm text-slate-300">Optimized for code generation, fast inference, and helpful explanations.</div>
          </div>
          <div class="p-4 rounded-2xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.03)] frost">
            <div class="text-xs text-slate-400">Output</div>
            <div class="mt-2 font-semibold">JavaScript • HTML • CSS</div>
            <div class="mt-3 text-sm text-slate-300">Choose languages, frameworks and style level in your prompt.</div>
          </div>
        </div>

        <div class="mt-8 flex items-center gap-3">
          <span class="kbd">⌘K</span>
          <div class="text-sm text-slate-400">Quick search • Type a prompt and press <span class="font-semibold text-slate-200">Generate</span></div>
        </div>
      </section>

      <section id="demo" class="space-y-4">
        <div class="rounded-3xl p-4 border border-[rgba(255,255,255,0.04)] bg-gradient-to-b from-[rgba(255,255,255,0.02)] to-transparent shadow-xl">
          <div class="flex justify-between items-center mb-3">
            <div class="text-sm text-slate-400">Live Preview</div>
            <div class="text-xs text-slate-500">AI · Sandbox</div>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div>
              <label class="text-xs text-slate-400">Prompt</label>
              <textarea id="promptArea" rows="5" class="mt-2 w-full rounded-xl bg-[#05112a] border border-slate-800 p-3 placeholder:text-slate-500"></textarea>

              <div class="mt-3 flex gap-2">
                <button id="genCode" class="px-3 py-2 rounded-lg bg-indigo-600 font-semibold">Generate Code</button>
                <button id="copyBtn" class="px-3 py-2 rounded-lg bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.04)]">Copy</button>
                <button id="clearBtn" class="px-3 py-2 rounded-lg bg-[rgba(255,255,255,0.03)] border">Clear</button>
              </div>
            </div>

            <div>
              <label class="text-xs text-slate-400">Output</label>
              <pre id="output" class="code bg-[#021025] mt-2 text-slate-200 overflow-auto h-56">// Generated code will appear here — try a prompt like:
// "Create a responsive hero section in Tailwind with a CTA button"
</pre>
            </div>
          </div>
        </div>

        <div class="text-sm text-slate-400">This is a demo UI — connect Graviton's backend to power real generation.</div>
      </section>
    </main>

    <section id="features" class="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
      <div class="p-6 rounded-2xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.03)]">
        <h3 class="font-semibold">Scaffold Apps</h3>
        <p class="mt-2 text-sm text-slate-300">Scaffold components, routing, tests, and deployment configs in seconds.</p>
      </div>
      <div class="p-6 rounded-2xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.03)]">
        <h3 class="font-semibold">Explain & Refactor</h3>
        <p class="mt-2 text-sm text-slate-300">Ask for explanations, refactors, and step-by-step migration guides.</p>
      </div>
      <div class="p-6 rounded-2xl bg-[rgba(255,255,255,0.02)] border border-[rgba(255,255,255,0.03)]">
        <h3 class="font-semibold">Workflows</h3>
        <p class="mt-2 text-sm text-slate-300">Create custom generation workflows and team presets for consistent outputs.</p>
      </div>
    </section>

    <section id="pricing" class="mt-12">
      <h2 class="text-2xl font-extrabold">Pricing</h2>
      <div class="mt-6 flex gap-4 flex-col sm:flex-row">
        <div class="flex-1 p-6 rounded-2xl bg-gradient-to-b from-[rgba(255,255,255,0.02)] to-transparent border border-[rgba(255,255,255,0.04)]">
          <div class="text-sm text-slate-400">Starter</div>
          <div class="mt-2 text-3xl font-extrabold">Free</div>
          <div class="mt-3 text-sm text-slate-300">Limited tokens • Great for trying it out</div>
          <button class="mt-6 bg-white text-[#061028] px-4 py-2 rounded-lg font-semibold">Get started</button>
        </div>
        <div class="flex-1 p-6 rounded-2xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.04)]">
          <div class="text-sm text-slate-400">Pro</div>
          <div class="mt-2 text-3xl font-extrabold">$29/mo</div>
          <div class="mt-3 text-sm text-slate-300">Priority generation • Team features</div>
          <button class="mt-6 bg-gradient-to-r from-pink-500 to-indigo-600 px-4 py-2 rounded-lg font-semibold">Upgrade</button>
        </div>
      </div>
    </section>

    <footer class="mt-12 border-t border-slate-800 pt-6 text-center text-slate-500 text-sm">
      © <span id="year"></span> Graviton · Built with AI ❤️
    </footer>
  </div>

  <script>
    // small UI behaviors for the standalone demo
    const yearSpan = document.getElementById('year');
    if (yearSpan) {
      yearSpan.textContent = new Date().getFullYear().toString();
    }

    const sampleResponses = [
      \`<!-- Responsive hero (Tailwind) -->\\n<section class="bg-white/5 p-12 rounded-xl">\\n  <h1 class="text-3xl font-bold">Your product</h1>\\n  <p class="mt-2 text-slate-300">A short tagline that explains the value.</p>\\n  <button class="mt-6 bg-gradient-to-r from-pink-500 to-indigo-600 text-white px-4 py-2 rounded">Get started</button>\\n</section>\`,
      \`// simple fetch helper\\nexport async function fetchJson(url){\\n  const r = await fetch(url);\\n  if(!r.ok) throw new Error('Network error');\\n  return r.json();\\n}\`,
      \`// small component in vanilla JS\\nfunction Counter(el){\\n  let n = 0;\\n  const btn = el.querySelector('button');\\n  if(btn) { btn.addEventListener('click', ()=>{ n++; btn.innerText = 'Clicked ' + n; }); }\\n}\`
    ];

    function simulateTyping(target, text, speed=10){
      let i = 0;
      if(target) target.textContent = '';
      const iv = setInterval(()=>{
        if(target) target.textContent += text[i++] || '';
        if(target) target.scrollTop = target.scrollHeight;
        if(i >= text.length) clearInterval(iv);
      }, speed);
    }

    const generateBtn = document.getElementById('generate');
    if (generateBtn) {
      generateBtn.addEventListener('click', ()=>{
        const p = (document.getElementById('prompt') as HTMLInputElement)?.value.trim();
        const out = document.getElementById('output');
        if (!out) return;
        const idx = Math.floor(Math.random()*sampleResponses.length);
        out.textContent = '// Generating...\\n';
        setTimeout(()=> simulateTyping(out, p ? \`// Prompt: \${p}\\n\\n\` + sampleResponses[idx] : sampleResponses[idx], 8), 600);
      });
    }

    const genCodeBtn = document.getElementById('genCode');
    if (genCodeBtn) {
      genCodeBtn.addEventListener('click', ()=>{
        const prompt = (document.getElementById('promptArea') as HTMLTextAreaElement)?.value.trim();
        const out = document.getElementById('output');
        if (!out) return;
        const idx = Math.floor(Math.random()*sampleResponses.length);
        out.textContent = '// Generating...\\n';
        setTimeout(()=> simulateTyping(out, prompt ? \`// Prompt: \${prompt}\\n\\n\` + sampleResponses[idx] : sampleResponses[idx], 8), 600);
      });
    }

    const copyBtn = document.getElementById('copyBtn');
    if (copyBtn) {
      copyBtn.addEventListener('click', async ()=>{
        const out = document.getElementById('output')?.textContent;
        if (out) {
          try{ await navigator.clipboard.writeText(out); alert('Copied to clipboard'); }catch(e){ alert('Unable to copy — select and copy manually.'); }
        }
      });
    }

    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
      clearBtn.addEventListener('click', ()=>{
        const out = document.getElementById('output');
        if (out) {
          out.textContent = ''
        }
      });
    }

    // keyboard quick actions
    document.addEventListener('keydown', (e)=>{
      if((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k'){ e.preventDefault(); (document.getElementById('prompt') as HTMLInputElement)?.focus(); }
      if(e.key === 'Enter' && (document.activeElement === document.getElementById('prompt') || document.activeElement === document.getElementById('promptArea'))){
        e.preventDefault(); (document.getElementById('generate') as HTMLButtonElement)?.click();
      }
    });
  </script>
</body>
</html>`);
  const [isBuildMode, setIsBuildMode] = useState(false);
  const [isCodeEditorVisible, setIsCodeEditorVisible] = useState(true);
  const [isCanvasVisible, setIsCanvasVisible] = useState(true)
  const [isProjectSidebarVisible, setIsProjectSidebarVisible] = useState(false);
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(true)
  const [isPublic, setIsPublic] = useState(propIsPublic ?? true);
  const [unavailableMessage, setUnavailableMessage] = useState(propUnavailableMessage ?? "");
  const [models, setModels] = useState<Model[]>([])
  const [selectedModel, setSelectedModel] = useState<string>("")
  const [isTestMode, setIsTestMode] = useState(false);
  const [userSettings, setUserSettings] = useState<UserSettings | null>(null);
  const [debouncedCode, setDebouncedCode] = useState(code);

  const assistantConfigData = userSettings ? userSettings.profiles[userSettings.activeProfile] : null;

  const fetchAssistantConfig = useCallback(async () => {
    if (!user) return;
    try {
      const userSettingsDocRef = doc(db, "assistant-settings", user.uid);
      const docSnap = await getDoc(userSettingsDocRef);

      if (docSnap.exists()) {
        setUserSettings(docSnap.data() as UserSettings);
      } else {
        const mainSettingsDocRef = doc(db, "assistant-settings", "main");
        const mainDocSnap = await getDoc(mainSettingsDocRef);
        if (mainDocSnap.exists()) {
          const mainSettings = mainDocSnap.data() as AssistantConfigData;
          const defaultUserSettings: UserSettings = {
            activeProfile: 'default',
            profiles: {
              'default': mainSettings,
            },
          };
          await setDoc(userSettingsDocRef, defaultUserSettings);
          setUserSettings(defaultUserSettings);
        } else {
          console.error("Main assistant configuration not found.");
        }
      }
    } catch (error) {
      console.error("Error fetching assistant config:", error);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchAssistantConfig();
    }

    const fetchAllData = async () => {
      try {
        const configResponse = await fetch(`${window.location.origin}/api/assistant/public-config`, { cache: 'no-store' });
        if (configResponse.ok) {
          const config = await configResponse.json();
          setIsPublic(config.isPublic);
          setUnavailableMessage(config.unavailableMessage);
        }
      } catch (error) {
        console.error('Failed to fetch client config:', error);
      }

      try {
        const modelsResponse = await fetch(`${window.location.origin}/api/admin/available-models`, { cache: 'no-store' });
        if (modelsResponse.ok) {
          const modelsData = await modelsResponse.json();
          setModels(modelsData);
          if (modelsData.length > 0) {
            setSelectedModel(modelsData.id);
          }
        }
      } catch (error) {
        console.error('Failed to fetch models:', error);
      }
    };

    fetchAllData();
  }, [user, fetchAssistantConfig]);

// Debounced auto-save and code execution effect
useEffect(() => {
  const handler = setTimeout(() => {
    setDebouncedCode(code);
  }, 1000); // 1 second delay

  return () => {
    clearTimeout(handler);
  };
}, [code]);

useEffect(() => {
  if (!user || !debouncedCode) return;

  const autoSave = async () => {
    try {
      const userSettingsDocRef = doc(db, "assistant-settings", user.uid);
      // More efficient: update only the 'code' field of the active profile
      await setDoc(userSettingsDocRef, {
        profiles: {
          [userSettings?.activeProfile || 'default']: {
            code: debouncedCode
          }
        }
      }, { merge: true });
      console.log("Code auto-saved successfully");
    } catch (error) {
      console.error("Error auto-saving code:", error);
    }
  };

  autoSave();
}, [debouncedCode, user, userSettings?.activeProfile]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!inputValue.trim()) return

    // Handle the input submission here
    console.log("Submitted:", inputValue)
    setInputValue("")
  }

  const actionButtons = [
    { icon: Camera, label: "Clone a Screenshot" },
    { icon: FileImage, label: "Import from Figma" },
    { icon: Upload, label: "Upload a Project" },
    { icon: Globe, label: "Landing Page" },
  ]

  const isAdminOrOwner = !!userClaims?.admin || !!userClaims?.owner;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-black">
        <LoadingSpinner />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-screen w-screen bg-black flex items-center justify-center">
        <div className="w-full max-w-md">
          <AuthForm />
        </div>
      </div>
    );
  }

  const isAdminAndEditorVisible = isAdminOrOwner && isCodeEditorVisible;


  return (
    <div className="max-h-screen h-screen  w-screen bg-black relative">
      <StarryBackground className="absolute top-0 left-0 w-full h-full z-0" />
      <div className="absolute top-0 left-0 w-full h-full z-10 flex flex-col">
        {isBuildMode && (
          <AssistantNavBar
            isProjectSidebarVisible={isProjectSidebarVisible}
            onToggleProjectSidebar={() => setIsProjectSidebarVisible(!isProjectSidebarVisible)}
            isAdminOrOwner={isAdminOrOwner}
            isCodeEditorVisible={isCodeEditorVisible}
            onToggleCodeEditor={() => setIsCodeEditorVisible(!isCodeEditorVisible)}
            isCanvasVisible={isCanvasVisible}
            onToggleCanvas={() => setIsCanvasVisible(!isCanvasVisible)}
            isTestMode={isTestMode}
            onToggleTestMode={() => setIsTestMode(!isTestMode)}
          />
        )}
        <div className="flex-grow relative pt-16">
          {isBuildMode && (
            <ProjectSidebar
              isOpen={isProjectSidebarVisible}
              onClose={() => setIsProjectSidebarVisible(false)}
              userSettings={userSettings}
              setUserSettings={setUserSettings}
            />
          )}
          <div
            className="grid h-full transition-all duration-500 ease-in-out"
            style={{
              gridTemplateColumns: isBuildMode
                ? `1fr ${isAdminAndEditorVisible ? '1fr' : '0fr'} ${isCanvasVisible ? '1fr' : '0fr'}`
                : '1fr 0fr 0fr',
            }}
          >
            {/* Column 1: Chat Panel */}
            <div className="h-full border-r border-gray-700 overflow-hidden">
              <ChatPanel
                user={user}
                userClaims={userClaims}
                loading={loading}
                isPublic={isPublic}
                unavailableMessage={unavailableMessage}
                models={models}
                selectedModel={selectedModel}
                setSelectedModel={setSelectedModel}
                isBuildMode={isBuildMode}
                toggleBuildMode={() => setIsBuildMode(!isBuildMode)}
                isCodeEditorVisible={isCodeEditorVisible}
                toggleCodeEditor={() => setIsCodeEditorVisible(!isCodeEditorVisible)}
                isProjectSidebarVisible={isProjectSidebarVisible}
                toggleProjectSidebar={() => setIsProjectSidebarVisible(!isProjectSidebarVisible)}
              />
            </div>

            {/* Column 2: Code Editor */}
            <div className={`h-full border-r border-gray-700 overflow-hidden transition-opacity duration-500 ${isAdminAndEditorVisible && isBuildMode ? 'opacity-100' : 'opacity-0'}`}>
              {isAdminAndEditorVisible && <CodeEditor code={code} setCode={setCode} />}
            </div>

            {/* Column 3: Canvas */}
            <div className={`h-full overflow-hidden transition-opacity duration-500 ${isCanvasVisible && isBuildMode ? 'opacity-100' : 'opacity-0'}`}>
              {isCanvasVisible && <Canvas code={debouncedCode} />}
            </div>
          </div>
        </div>
      </div>

      {/* Test Mode Picture-in-Picture */}
      {isTestMode && (
        <PictureInPicture
          isOpen={isTestMode}
          onClose={() => setIsTestMode(false)}
          tabs={[
            {
              id: 'server-logs',
              label: 'Server Logs',
              content: (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium">Server-side Logs</h3>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => console.log('Clearing logs...')}
                    >
                      Clear
                    </Button>
                  </div>
                  <div className="bg-black/50 rounded-md p-3 font-mono text-xs text-green-400 max-h-60 overflow-y-auto">
                    <div className="space-y-1">
                      <div>[INFO] Assistant initialized</div>
                      <div>[INFO] Loading user preferences</div>
                      <div>[INFO] Connected to Firebase</div>
                      <div>[INFO] Models loaded successfully</div>
                      <div>[WARN] Cache miss for user settings</div>
                      <div>[INFO] Build mode enabled</div>
                    </div>
                  </div>
                </div>
              ),
            },
            {
              id: 'tools-testing',
              label: 'Tools Testing',
              content: (
                <div className="space-y-3">
                  <h3 className="text-sm font-medium">Available Tools</h3>
                  <div className="space-y-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => console.log('Testing Firebase tool...')}
                    >
                      🗄️ Test Firebase Tool
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => console.log('Testing API tool...')}
                    >
                      🔌 Test API Tool
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => console.log('Testing File tool...')}
                    >
                      📁 Test File Tool
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => console.log('Testing Code tool...')}
                    >
                      💻 Test Code Tool
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="w-full justify-start"
                      onClick={() => console.log('Testing Image tool...')}
                    >
                      🖼️ Test Image Tool
                    </Button>
                  </div>
                  <div className="mt-4 p-3 bg-blue-500/10 rounded-md">
                    <p className="text-xs text-blue-200">
                      Click any tool to run a test and see the results in the Server Logs tab.
                    </p>
                  </div>
                </div>
              ),
            },
          ]}
        />
      )}
    </div>
  );
}