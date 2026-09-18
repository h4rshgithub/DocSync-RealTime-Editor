import React, { useEffect, useRef, useState } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import io from 'socket.io-client';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { db, auth } from './firebase';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { signOut, onAuthStateChanged } from 'firebase/auth';
import _ from 'lodash';

const TOOLBAR_OPTIONS = [
  [{ header: [1, 2, 3, 4, 5, 6, false] }],
  [{ font: [] }],
  [{ size: ['small', false, 'large', 'huge'] }],
  ['bold', 'italic', 'underline', 'strike'],
  [{ color: [] }, { background: [] }],
  [{ script: 'sub' }, { script: 'super' }],
  ['blockquote', 'code-block'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  [{ indent: '-1' }, { indent: '+1' }],
  [{ align: [] }],
  ['link', 'image'],
  ['clean'],
];

const rawBackendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:5000';
const BACKEND_URL = rawBackendUrl.replace(/\/$/, '');

const socket = io(BACKEND_URL, {
  reconnection: true,
  reconnectionAttempts: 10,
  reconnectionDelay: 1000,
  transports: ['polling', 'websocket'],
  withCredentials: true,
});

const Editor = () => {
  const { docId } = useParams();
  const navigate = useNavigate();
  const editorRef = useRef(null);
  const quillRef = useRef(null);
  const fileInputRef = useRef(null);
  const [user, setUser] = useState(null);
  const [userLoading, setUserLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [shareEmail, setShareEmail] = useState('');
  const [allowLinkAccess, setAllowLinkAccess] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [docName, setDocName] = useState('');
  const [saveStatus, setSaveStatus] = useState('saved'); // 'saving' | 'saved' | 'error'
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [shareLoading, setShareLoading] = useState(false);
  const [sharedWith, setSharedWith] = useState([]);
  const [linkCopied, setLinkCopied] = useState(false);
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const lastSentDelta = useRef(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setUserLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const updateStats = (quill) => {
    if (!quill) return;
    const text = quill.getText().trim();
    const words = text ? text.split(/\s+/).filter(Boolean).length : 0;
    setWordCount(words);
    setCharCount(text.length);
  };

  const shareWithUser = async (email) => {
    if (!email.trim()) return;
    setShareLoading(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/share`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          docId,
          email: email.trim(),
          docName,
          sharedByName: user?.displayName || user?.email,
          docLink: `${window.location.origin}/doc/${docId}`,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSharedWith(prev => prev.includes(email.trim()) ? prev : [...prev, email.trim()]);
        setShareEmail('');
        alert(data.emailSent ? `✓ Shared with ${email.trim()} — email notification sent!` : `✓ Shared with ${email.trim()}`);
      } else {
        alert('Failed to share: ' + data.error);
      }
    } catch (error) {
      console.error('Share error:', error);
      alert('Failed to share document. Check connection.');
    } finally {
      setShareLoading(false);
    }
  };

  const toggleLinkAccess = async () => {
    const docRef = doc(db, 'docs', docId);
    try {
      await setDoc(docRef, { allowLinkAccess: !allowLinkAccess }, { merge: true });
      setAllowLinkAccess(!allowLinkAccess);
    } catch (error) {
      console.error('Error toggling link access:', error);
    }
  };

  // Import Document (.docx, .txt, .html)
  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !quillRef.current) return;

    try {
      const extension = file.name.split('.').pop().toLowerCase();
      if (extension === 'txt' || extension === 'md' || extension === 'html') {
        const text = await file.text();
        if (extension === 'html') {
          quillRef.current.clipboard.dangerouslyPasteHTML(text);
        } else {
          quillRef.current.setText(text);
        }
      } else {
        // Fallback for docx/other text binary files
        const text = await file.text();
        const cleanText = text.replace(/[^\x20-\x7E\n\r\t]/g, ' ').replace(/\s+/g, ' ');
        quillRef.current.setText(cleanText);
      }
      setSaveStatus('saving');
      saveDoc(docId, quillRef.current);
      updateStats(quillRef.current);
    } catch (err) {
      alert('Could not parse file. Inserted raw text.');
    }
    e.target.value = '';
  };

  // Export Document (.html, .txt, .docx)
  const handleExport = (type) => {
    if (!quillRef.current) return;
    setExportDropdownOpen(false);
    const content = quillRef.current.root.innerHTML;
    const rawText = quillRef.current.getText();

    let blob, filename;
    if (type === 'html') {
      blob = new Blob([`<!DOCTYPE html><html><head><title>${docName}</title></head><body>${content}</body></html>`], { type: 'text/html' });
      filename = `${docName.replace(/\s+/g, '_')}.html`;
    } else if (type === 'docx') {
      // Clean HTML wrapper formatted for Word/DOCX reader compatibility
      const docxHeader = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${docName}</title></head><body>${content}</body></html>`;
      blob = new Blob([docxHeader], { type: 'application/msword' });
      filename = `${docName.replace(/\s+/g, '_')}.docx`;
    } else {
      blob = new Blob([rawText], { type: 'text/plain' });
      filename = `${docName.replace(/\s+/g, '_')}.txt`;
    }

    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const sendChanges = useRef(
    _.debounce((docId, delta) => {
      const deltaString = JSON.stringify(delta);
      if (lastSentDelta.current === deltaString) return;
      lastSentDelta.current = deltaString;
      socket.emit('send-changes', { docId, delta });
    }, 300, { leading: false, trailing: true })
  ).current;

  const saveDoc = useRef(
    _.debounce((docId, quill) => {
      const deltaString = JSON.stringify(quill.getContents());
      setDoc(doc(db, 'docs', docId), { content: deltaString, updatedAt: new Date().toISOString() }, { merge: true })
        .then(() => setSaveStatus('saved'))
        .catch(() => setSaveStatus('error'));
    }, 1500, { leading: false, trailing: true })
  ).current;

  useEffect(() => {
    if (userLoading) return;
    if (!user) { navigate('/login'); return; }
    if (!editorRef.current) return;

    const checkAccess = async () => {
      const docRef = doc(db, 'docs', docId);
      try {
        const docSnap = await getDoc(docRef);
        if (!docSnap.exists()) { setAccessDenied(true); return; }

        const data = docSnap.data();
        const ownerCheck = data.ownerId === user.uid;
        setIsOwner(ownerCheck);
        setAllowLinkAccess(data.allowLinkAccess || false);
        setDocName(data.name || 'Untitled Document');
        setSharedWith(data.sharedWith || []);

        const isShared = data.sharedWith?.includes(user.email);
        const isLinkAccessible = data.allowLinkAccess === true;
        if (!ownerCheck && !isShared && !isLinkAccessible) { setAccessDenied(true); return; }

        if (!quillRef.current) {
          quillRef.current = new Quill(editorRef.current, {
            theme: 'snow',
            modules: { toolbar: TOOLBAR_OPTIONS },
            placeholder: 'Type or upload a document to begin editing...',
          });
        }

        if (socket.connected) socket.emit('join-doc', docId);
        socket.on('connect', () => socket.emit('join-doc', docId));

        const content = data.content;
        const delta = content ? JSON.parse(content) : { ops: [] };
        quillRef.current.setContents(delta, 'api');
        updateStats(quillRef.current);

        socket.on('receive-changes', (delta) => {
          if (quillRef.current) {
            quillRef.current.updateContents(delta, 'api');
            updateStats(quillRef.current);
          }
        });

        quillRef.current.on('text-change', (delta, oldDelta, source) => {
          if (source !== 'user') return;
          setSaveStatus('saving');
          sendChanges(docId, delta);
          saveDoc(docId, quillRef.current);
          updateStats(quillRef.current);
        });
      } catch (error) {
        console.error('Error loading document:', error.message);
        setAccessDenied(true);
      }
    };

    checkAccess();

    return () => {
      socket.off('receive-changes');
      socket.off('connect');
      sendChanges.cancel();
      saveDoc.cancel();
      if (quillRef.current) {
        quillRef.current.off('text-change');
        quillRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docId, user, userLoading, navigate]);

  const shareableLink = `${window.location.origin}/doc/${docId}`;

  const copyLink = () => {
    navigator.clipboard.writeText(shareableLink);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  const getInitial = (str) => (str ? str[0].toUpperCase() : '?');

  if (userLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#090d16]">
      <div className="flex items-center gap-3 text-purple-400 font-semibold">
        <svg className="animate-spin w-6 h-6 text-purple-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        Initializing Cyber Editor...
      </div>
    </div>
  );

  if (accessDenied) return (
    <div className="min-h-screen flex items-center justify-center bg-[#090d16] p-4">
      <div className="text-center bg-[#131b2e] p-8 rounded-3xl border border-purple-500/30 neon-glow-purple max-w-sm w-full">
        <div className="w-14 h-14 bg-red-500/20 border border-red-500/40 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <svg className="w-7 h-7 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m0-6v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"/>
          </svg>
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Access Denied</h2>
        <p className="text-slate-400 text-sm mb-6">You don't have permission to edit this document.</p>
        <Link to="/" className="inline-block bg-purple-600 hover:bg-purple-500 text-white px-5 py-2.5 rounded-xl font-semibold shadow-lg shadow-purple-600/30 transition text-sm">
          Return to Dashboard
        </Link>
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#090d16] text-slate-100">
      <input type="file" ref={fileInputRef} onChange={handleImportFile} accept=".docx,.doc,.txt,.html,.md" className="hidden" />

      {/* Cyberpunk Neon Header Bar */}
      <header className="bg-[#111827]/90 backdrop-blur-md border-b border-purple-500/20 px-5 py-3 flex items-center gap-4 shrink-0 shadow-lg z-20">
        <Link to="/" className="flex items-center gap-3 shrink-0 group">
          <div className="w-10 h-10 bg-gradient-to-tr from-purple-600 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/30 group-hover:scale-105 transition-transform">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
            </svg>
          </div>
          <span className="font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 text-lg hidden sm:block tracking-tight">
            DocSync
          </span>
        </Link>

        <div className="w-px h-6 bg-slate-800 shrink-0" />

        {/* Title & Status */}
        <div className="flex-1 min-w-0">
          <h1 className="text-base font-bold text-white truncate tracking-wide">{docName}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            {saveStatus === 'saving' && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-400">
                <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
                Syncing...
              </span>
            )}
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#10b981]" />
                Saved to cloud
              </span>
            )}
            {saveStatus === 'error' && <span className="text-xs font-semibold text-rose-400">⚠ Sync error</span>}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Import File Button */}
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            title="Import .docx, .txt, .html document"
            className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 transition shadow-sm"
          >
            <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            <span className="hidden md:inline">Import Document</span>
          </button>

          {/* Export Dropdown */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
              className="flex items-center gap-1.5 text-xs font-semibold px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-purple-300 border border-purple-500/30 transition shadow-sm"
            >
              <svg className="w-4 h-4 text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
              </svg>
              <span>Export</span>
            </button>

            {exportDropdownOpen && (
              <div className="absolute right-0 mt-2 w-44 bg-[#1e293b] border border-purple-500/30 rounded-2xl shadow-2xl p-1.5 z-30 animate-fadeIn">
                <button
                  type="button"
                  onClick={() => handleExport('docx')}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-purple-500/20 hover:text-purple-300 rounded-xl transition flex items-center gap-2"
                >
                  <span className="text-blue-400">📄</span> Export as .DOCX
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('html')}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-purple-500/20 hover:text-purple-300 rounded-xl transition flex items-center gap-2"
                >
                  <span className="text-amber-400">🌐</span> Export as .HTML
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('txt')}
                  className="w-full text-left px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-purple-500/20 hover:text-purple-300 rounded-xl transition flex items-center gap-2"
                >
                  <span className="text-slate-400">📝</span> Export as .TXT
                </button>
              </div>
            )}
          </div>

          {/* Share Button */}
          <button
            type="button"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`flex items-center gap-2 text-xs px-4 py-2 rounded-xl font-bold transition shadow-lg ${
              sidebarOpen
                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50 shadow-purple-500/20'
                : 'bg-gradient-to-r from-purple-600 to-pink-600 text-white hover:opacity-95 shadow-purple-600/30'
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/>
            </svg>
            Share
          </button>

          {/* User Profile */}
          <button
            type="button"
            onClick={handleLogout}
            title={`Logout (${user?.email})`}
            className="w-9 h-9 rounded-xl bg-purple-950/80 border border-purple-500/40 flex items-center justify-center text-purple-300 font-extrabold text-sm hover:border-purple-400 transition"
          >
            {getInitial(user?.displayName || user?.email)}
          </button>
        </div>
      </header>

      {/* Main Canvas Area */}
      <div className="flex flex-1 overflow-hidden relative">
        <div className="flex-1 overflow-y-auto p-6 md:p-10">
          <div className="max-w-5xl mx-auto">
            <div ref={editorRef} className="doc-editor-container" />
          </div>
        </div>

        {/* Share Sidebar Drawer */}
        {sidebarOpen && (
          <aside className="w-80 bg-[#0f172a] border-l border-purple-500/20 flex flex-col shrink-0 overflow-hidden shadow-2xl z-20 animate-slideLeft">
            <div className="px-5 py-4 border-b border-purple-500/10 flex items-center justify-between bg-[#161f36]">
              <h3 className="font-bold text-white text-sm tracking-wide">Document Sharing</h3>
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="text-slate-400 hover:text-white transition p-1 rounded-lg hover:bg-slate-800"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12"/>
                </svg>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-6">
              {/* Shareable Link */}
              <div>
                <label className="text-xs font-bold text-purple-400 uppercase tracking-wider mb-2 block">Share Link</label>
                <div className="flex gap-2 mb-3">
                  <input
                    type="text"
                    value={shareableLink}
                    readOnly
                    className="flex-1 text-xs px-3 py-2 border border-purple-500/20 rounded-xl bg-[#1e293b] text-slate-300 min-w-0 font-mono"
                  />
                  <button
                    type="button"
                    onClick={copyLink}
                    className={`px-3.5 py-2 rounded-xl text-xs font-bold transition shrink-0 ${
                      linkCopied
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/40'
                        : 'bg-purple-600 hover:bg-purple-500 text-white'
                    }`}
                  >
                    {linkCopied ? '✓ Copied' : 'Copy'}
                  </button>
                </div>

                {isOwner && (
                  <button
                    type="button"
                    onClick={toggleLinkAccess}
                    className={`w-full py-2.5 text-xs rounded-xl font-bold transition border ${
                      allowLinkAccess
                        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                        : 'bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700'
                    }`}
                  >
                    {allowLinkAccess ? '🔓 Anyone with link can edit' : '🔒 Restricted access'}
                  </button>
                )}
              </div>

              {/* Invite Email */}
              {isOwner && (
                <div>
                  <label className="text-xs font-bold text-cyan-400 uppercase tracking-wider mb-2 block">Invite Collaborator</label>
                  <p className="text-xs text-slate-400 mb-3">Sends an email notification with direct link access.</p>
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={shareEmail}
                      onChange={e => setShareEmail(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && shareWithUser(shareEmail)}
                      placeholder="user@example.com"
                      className="flex-1 text-xs px-3.5 py-2.5 border border-purple-500/20 rounded-xl bg-[#1e293b] text-white focus:outline-none focus:border-purple-500 min-w-0"
                    />
                    <button
                      type="button"
                      onClick={() => shareWithUser(shareEmail)}
                      disabled={shareLoading || !shareEmail.trim()}
                      className="px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 text-white rounded-xl text-xs font-bold hover:opacity-90 transition disabled:opacity-50 shrink-0"
                    >
                      {shareLoading ? '...' : 'Invite'}
                    </button>
                  </div>
                </div>
              )}

              {/* Collaborators List */}
              {sharedWith.length > 0 && (
                <div>
                  <label className="text-xs font-bold text-pink-400 uppercase tracking-wider mb-3 block">Collaborators ({sharedWith.length})</label>
                  <div className="space-y-2">
                    {sharedWith.map(email => (
                      <div key={email} className="flex items-center gap-2.5 p-2.5 bg-[#1a243d] rounded-xl border border-purple-500/20">
                        <div className="w-7 h-7 bg-purple-900/60 border border-purple-500/30 rounded-lg flex items-center justify-center text-purple-300 text-xs font-bold shrink-0">
                          {email[0].toUpperCase()}
                        </div>
                        <span className="text-xs font-medium text-slate-200 truncate">{email}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </aside>
        )}
      </div>

      {/* Cyber Status Footer Bar */}
      <footer className="bg-[#0f172a] border-t border-purple-500/20 px-6 py-2 flex items-center justify-between text-xs font-medium text-slate-400 shrink-0">
        <div className="flex items-center gap-4">
          <span>Words: <strong className="text-purple-400">{wordCount}</strong></span>
          <span>Characters: <strong className="text-cyan-400">{charCount}</strong></span>
        </div>
        <div className="flex items-center gap-2 text-slate-500">
          <span className="w-2 h-2 rounded-full bg-cyan-400 shadow-[0_0_8px_#06b6d4]" />
          DocSync Neon v2.0
        </div>
      </footer>
    </div>
  );
};

export default Editor;