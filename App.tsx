
import React, { useState, useEffect, useRef } from 'react';
import { ChatSession, Message, GroundingChunk } from './types';
import { sendMessageToGemini } from './services/geminiService';
import { PlusIcon, MenuIcon, SendIcon, FileIcon, SearchIcon, BrainIcon, XIcon, SidebarIcon, ChevronLeftIcon } from './components/Icons';

const App: React.FC = () => {
  const [sessions, setSessions] = useState<ChatSession[]>(() => {
    const saved = localStorage.getItem('xrayen_sessions');
    return saved ? JSON.parse(saved) : [];
  });
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(() => {
    return localStorage.getItem('xrayen_current_id');
  });
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth > 1024);
  const [isDeepSearch, setIsDeepSearch] = useState(false);
  const [isThinkingMode, setIsThinkingMode] = useState(false);
  const [attachments, setAttachments] = useState<{ name: string; data: string; mimeType: string }[]>([]);
  const [thinkingTimeLeft, setThinkingTimeLeft] = useState(0);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
  };

  useEffect(() => {
    localStorage.setItem('xrayen_sessions', JSON.stringify(sessions));
    if (currentSessionId) localStorage.setItem('xrayen_current_id', currentSessionId);
  }, [sessions, currentSessionId]);

  useEffect(() => {
    scrollToBottom();
  }, [sessions, isLoading]);

  useEffect(() => {
    if (sessions.length === 0) {
      const newId = Date.now().toString();
      const initialSession: ChatSession = {
        id: newId,
        title: 'New Chat',
        messages: [],
        createdAt: Date.now(),
      };
      setSessions([initialSession]);
      setCurrentSessionId(newId);
    }
  }, []);

  const currentSession = sessions.find(s => s.id === currentSessionId);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(file => {
        const reader = new FileReader();
        reader.onload = (rev) => {
          setAttachments(prev => [...prev, {
            name: file.name,
            data: rev.target?.result as string,
            mimeType: file.type
          }]);
        };
        reader.readAsDataURL(file);
      });
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };

  const handleSend = async () => {
    if ((!input.trim() && attachments.length === 0) || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: Date.now(),
      attachments: attachments.map(a => a.name)
    };

    // Update session state before API call
    setSessions(prev => prev.map(s => {
      if (s.id === currentSessionId) {
        return { 
          ...s, 
          messages: [...s.messages, userMessage],
          title: s.messages.length === 0 ? input.substring(0, 30) : s.title
        };
      }
      return s;
    }));

    setInput('');
    setIsLoading(true);

    const startTime = Date.now();
    let thinkingInterval: any;
    
    if (isThinkingMode) {
      setThinkingTimeLeft(30);
      thinkingInterval = setInterval(() => {
        setThinkingTimeLeft(prev => Math.max(0, prev - 1));
      }, 1000);
    }

    try {
      const latestSessions = JSON.parse(localStorage.getItem('xrayen_sessions') || '[]');
      const sessionToProcess = latestSessions.find((s: ChatSession) => s.id === currentSessionId);
      const messagesToProcess = sessionToProcess ? [...sessionToProcess.messages, userMessage] : [userMessage];
      
      const fileData = attachments.map(a => ({ data: a.data, mimeType: a.mimeType }));
      
      const result = await sendMessageToGemini(messagesToProcess, {
        deepSearch: isDeepSearch,
        thinking: isThinkingMode,
        fileData
      });

      if (isThinkingMode) {
        const elapsedTime = (Date.now() - startTime) / 1000;
        if (elapsedTime < 30) {
          await new Promise(resolve => setTimeout(resolve, (30 - elapsedTime) * 1000));
        }
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: result.text,
        timestamp: Date.now(),
        groundingLinks: result.groundingLinks
      };

      setSessions(prev => prev.map(s => {
        if (s.id === currentSessionId) {
          return { ...s, messages: [...s.messages, assistantMessage] };
        }
        return s;
      }));
    } catch (error) {
      console.error(error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: "Sorry, I encountered an error. Please check your connection or try again.",
        timestamp: Date.now(),
      };
      setSessions(prev => prev.map(s => {
        if (s.id === currentSessionId) {
          return { ...s, messages: [...s.messages, errorMessage] };
        }
        return s;
      }));
    } finally {
      setIsLoading(false);
      setAttachments([]);
      setThinkingTimeLeft(0);
      if (thinkingInterval) clearInterval(thinkingInterval);
    }
  };

  const createNewChat = () => {
    const newId = Date.now().toString();
    const newSession: ChatSession = {
      id: newId,
      title: 'New Chat',
      messages: [],
      createdAt: Date.now(),
    };
    setSessions(prev => [newSession, ...prev]);
    setCurrentSessionId(newId);
    if (window.innerWidth < 1024) setIsSidebarOpen(false);
  };

  const toggleSidebar = () => {
    setIsSidebarOpen(!isSidebarOpen);
  };

  return (
    <div className="flex h-screen w-full bg-[#212121] text-[#ececec] overflow-hidden">
      {/* Overlay for mobile sidebar */}
      {isSidebarOpen && window.innerWidth < 1024 && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={toggleSidebar}
        />
      )}

      {/* Sidebar */}
      <aside 
        className={`${
          isSidebarOpen ? 'w-64 translate-x-0' : 'w-0 -translate-x-full lg:translate-x-0 lg:w-0'
        } fixed lg:relative z-40 h-full bg-[#171717] transition-all duration-300 ease-in-out flex flex-col border-r border-[#303030] overflow-hidden`}
      >
        <div className="flex items-center justify-between p-3">
          <button 
            onClick={createNewChat}
            className="flex-1 flex items-center gap-3 px-3 py-3 text-sm font-medium transition-colors duration-200 border border-[#4d4d4d] rounded-lg hover:bg-[#2d2d2d]"
          >
            <PlusIcon />
            New Chat
          </button>
          <button 
            onClick={toggleSidebar}
            className="ml-2 p-2 hover:bg-[#2d2d2d] rounded-lg text-gray-400 lg:hidden"
          >
            <XIcon />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto custom-scrollbar px-3 space-y-1">
          {sessions.map(s => (
            <button
              key={s.id}
              onClick={() => {
                setCurrentSessionId(s.id);
                if (window.innerWidth < 1024) setIsSidebarOpen(false);
              }}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm truncate transition-colors duration-200 ${
                currentSessionId === s.id ? 'bg-[#2d2d2d]' : 'hover:bg-[#2d2d2d]'
              }`}
            >
              {s.title || "New Chat"}
            </button>
          ))}
        </div>

        <div className="p-3 border-t border-[#303030]">
          <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-[#2d2d2d] cursor-pointer">
            <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white font-bold">X</div>
            <span className="text-sm">User Profile</span>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col h-full relative transition-all duration-300">
        {/* Floating Sidebar Toggle (Desktop Closed State) */}
        {!isSidebarOpen && (
          <button 
            onClick={toggleSidebar}
            className="hidden lg:flex absolute top-4 left-4 z-20 p-2 bg-[#212121] border border-[#303030] rounded-lg text-gray-400 hover:text-white transition-colors"
            title="Open Sidebar"
          >
            <SidebarIcon />
          </button>
        )}

        {/* Sidebar Collapse Button (Inside main content, shown when open) */}
        {isSidebarOpen && (
          <button 
            onClick={toggleSidebar}
            className="hidden lg:flex absolute top-1/2 -left-3 z-50 p-0.5 bg-[#303030] border border-[#4d4d4d] rounded-full text-gray-400 hover:text-white transition-all transform hover:scale-110"
            style={{ marginTop: '-12px' }}
            title="Close Sidebar"
          >
            <ChevronLeftIcon />
          </button>
        )}

        {/* Header (Mobile) */}
        <header className="flex items-center justify-between h-14 px-4 lg:hidden border-b border-[#303030]">
          <button onClick={toggleSidebar} className="p-2">
            <MenuIcon />
          </button>
          <div className="font-semibold text-lg">XRayenChat</div>
          <button onClick={createNewChat} className="p-2">
            <PlusIcon />
          </button>
        </header>

        {/* Chat Area */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {!currentSession || currentSession.messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center p-4">
              <h1 className="text-3xl font-bold mb-8">What can I help with?</h1>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-2xl w-full">
                {['Explain quantum computing', 'Write a short story about a cat', 'Help me debug this code', 'Plan a travel itinerary'].map(prompt => (
                  <button 
                    key={prompt}
                    onClick={() => setInput(prompt)}
                    className="p-4 text-left border border-[#4d4d4d] rounded-xl hover:bg-[#2d2d2d] transition-colors text-sm"
                  >
                    {prompt}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="max-w-3xl mx-auto py-8 px-4 space-y-8">
              {currentSession.messages.map((msg) => (
                <div key={msg.id} className={`flex gap-4 ${msg.role === 'assistant' ? '' : 'flex-row-reverse'}`}>
                  <div className={`w-8 h-8 rounded-full flex-shrink-0 flex items-center justify-center font-bold text-xs ${msg.role === 'assistant' ? 'bg-[#19c37d] text-white shadow-sm' : 'bg-blue-600 text-white shadow-sm'}`}>
                    {msg.role === 'assistant' ? 'AI' : 'U'}
                  </div>
                  <div className={`max-w-[85%] space-y-2 ${msg.role === 'assistant' ? '' : 'text-right'}`}>
                    <div className={`p-3 rounded-2xl ${msg.role === 'assistant' ? '' : 'bg-[#2f2f2f] inline-block text-left'}`}>
                      <div className="prose prose-invert max-w-none text-[15px] leading-relaxed whitespace-pre-wrap">
                        {msg.content}
                      </div>
                    </div>
                    {msg.groundingLinks && msg.groundingLinks.length > 0 && (
                      <div className="mt-4 pt-4 border-t border-[#303030]">
                        <p className="text-xs text-gray-400 mb-2">Sources:</p>
                        <div className="flex flex-wrap gap-2">
                          {msg.groundingLinks.map((link, idx) => (
                            <a 
                              key={idx} 
                              href={link.web?.uri} 
                              target="_blank" 
                              rel="noopener noreferrer"
                              className="text-xs bg-[#2d2d2d] hover:bg-[#3d3d3d] px-2 py-1 rounded border border-[#4d4d4d] flex items-center gap-1 transition-colors"
                            >
                              <SearchIcon />
                              {link.web?.title || 'Source'}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {isLoading && (
                <div className="flex gap-4">
                  <div className="w-8 h-8 rounded-full bg-[#19c37d] flex items-center justify-center text-white text-xs font-bold">AI</div>
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-1 items-center py-2">
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-75"></div>
                      <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce delay-150"></div>
                    </div>
                    {isThinkingMode && (
                      <p className="text-xs text-gray-500 italic">
                        Deeply thinking... {thinkingTimeLeft > 0 ? `${thinkingTimeLeft}s remaining` : 'Synthesizing final answer...'}
                      </p>
                    )}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>

        {/* Input Area */}
        <div className="p-4 bg-gradient-to-t from-[#212121] via-[#212121] to-transparent z-10">
          <div className="max-w-3xl mx-auto space-y-4">
            {/* Attachments preview */}
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {attachments.map((file, i) => (
                  <div key={i} className="flex items-center gap-2 bg-[#2d2d2d] px-2 py-1.5 rounded-lg text-xs border border-[#4d4d4d]">
                    <FileIcon />
                    <span className="truncate max-w-[100px] font-medium">{file.name}</span>
                    <button onClick={() => removeAttachment(i)} className="text-gray-400 hover:text-red-400 p-0.5">
                      <XIcon />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <div className="relative bg-[#2f2f2f] rounded-2xl border border-[#4d4d4d] focus-within:border-[#676767] shadow-xl">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Message XRayenChat..."
                className="w-full bg-transparent p-4 pr-12 text-[15px] focus:outline-none resize-none max-h-40 min-h-[56px] custom-scrollbar"
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                }}
              />
              <div className="flex items-center justify-between px-4 pb-3">
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 hover:bg-[#3d3d3d] rounded-lg transition-colors group relative"
                    title="Upload File"
                  >
                    <FileIcon />
                    <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" multiple />
                  </button>
                  
                  <button 
                    onClick={() => setIsDeepSearch(!isDeepSearch)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all text-xs font-semibold ${
                      isDeepSearch ? 'bg-[#007bff22] border-[#007bff] text-[#007bff]' : 'border-[#4d4d4d] hover:bg-[#3d3d3d] text-gray-400'
                    }`}
                  >
                    <SearchIcon />
                    Deep Search
                  </button>

                  <button 
                    onClick={() => setIsThinkingMode(!isThinkingMode)}
                    className={`flex items-center gap-1.5 px-3 py-1 rounded-full border transition-all text-xs font-semibold ${
                      isThinkingMode ? 'bg-purple-900/30 border-purple-500 text-purple-400' : 'border-[#4d4d4d] hover:bg-[#3d3d3d] text-gray-400'
                    }`}
                  >
                    <BrainIcon />
                    Thinking
                  </button>
                </div>

                <button 
                  onClick={handleSend}
                  disabled={(!input.trim() && attachments.length === 0) || isLoading}
                  className={`p-2 rounded-xl transition-all ${
                    (!input.trim() && attachments.length === 0) || isLoading ? 'bg-[#1e1e1e] text-gray-600 cursor-not-allowed' : 'bg-white text-black hover:bg-gray-200'
                  }`}
                >
                  <SendIcon />
                </button>
              </div>
            </div>
            
            <p className="text-[11px] text-gray-500 text-center px-4 leading-relaxed">
              XRayenChat can make mistakes. Check important info. Deep Search powered by Google.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
