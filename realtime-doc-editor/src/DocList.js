import React, { useState, useEffect } from 'react';
import { db, auth } from './firebase';
import { collection, query, where, getDocs, addDoc } from 'firebase/firestore';
import { useNavigate, Link } from 'react-router-dom';
import { signOut } from 'firebase/auth';
import { useAuthState } from 'react-firebase-hooks/auth';

const DocList = () => {
  const [docs, setDocs] = useState([]);
  const [docName, setDocName] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const navigate = useNavigate();
  const [user, authLoading] = useAuthState(auth);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { navigate('/login'); return; }
    fetchDocs();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, authLoading]);

  const fetchDocs = async () => {
    try {
      const q = query(collection(db, 'docs'), where('ownerId', '==', user.uid));
      const snap = await getDocs(q);
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => new Date(b.updatedAt || b.createdAt || 0) - new Date(a.updatedAt || a.createdAt || 0));
      setDocs(list);
    } catch (err) {
      console.error('Error fetching documents:', err.message);
    }
  };

  const createNewDoc = async () => {
    if (!docName.trim()) return;
    setCreating(true);
    try {
      const now = new Date().toISOString();
      const docRef = await addDoc(collection(db, 'docs'), {
        content: JSON.stringify({ ops: [] }),
        ownerId: user.uid,
        allowLinkAccess: false,
        sharedWith: [],
        name: docName.trim(),
        createdAt: now,
        updatedAt: now,
      });
      setDocName('');
      setShowModal(false);
      navigate(`/doc/${docRef.id}`);
    } catch (err) {
      console.error('Error creating document:', err.message);
    } finally {
      setCreating(false);
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
    navigate('/login');
  };

  const getInitial = (str) => (str ? str[0].toUpperCase() : '?');

  const formatDate = (dateStr) => {
    if (!dateStr) return 'Recently';
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now - d;
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  if (authLoading) return (
    <div className="min-h-screen flex items-center justify-center bg-[#090d16]">
      <div className="flex items-center gap-3 text-purple-400 font-semibold">
        <svg className="animate-spin w-6 h-6 text-purple-500" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
        </svg>
        Loading documents...
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#090d16] text-slate-100">
      {/* Cyber Navbar */}
      <nav className="bg-[#111827]/90 backdrop-blur-md border-b border-purple-500/20 px-6 py-4 flex items-center justify-between sticky top-0 z-20 shadow-lg">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-tr from-purple-600 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-purple-500/30">
            <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
            </svg>
          </div>
          <span className="text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 tracking-tight">
            DocSync
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="w-9 h-9 rounded-xl bg-purple-950/80 border border-purple-500/40 flex items-center justify-center text-purple-300 font-extrabold text-sm">
            {getInitial(user?.displayName || user?.email)}
          </div>
          <span className="text-sm font-semibold text-slate-300 hidden sm:block max-w-[180px] truncate">{user?.displayName || user?.email}</span>
          <button
            onClick={handleLogout}
            className="text-xs text-slate-400 hover:text-rose-400 transition px-3.5 py-2 rounded-xl hover:bg-rose-500/10 font-bold border border-transparent hover:border-rose-500/20"
          >
            Logout
          </button>
        </div>
      </nav>

      {/* Main Dashboard Content */}
      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex items-center justify-between mb-10">
          <div>
            <h2 className="text-3xl font-extrabold text-white tracking-tight">Your Documents</h2>
            <p className="text-slate-400 text-sm mt-1">{docs.length} active project{docs.length !== 1 ? 's' : ''}</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2.5 bg-gradient-to-r from-purple-600 to-pink-600 text-white px-5 py-3 rounded-2xl font-bold hover:opacity-95 transition shadow-lg shadow-purple-600/30 text-sm"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4"/>
            </svg>
            New Document
          </button>
        </div>

        {docs.length === 0 ? (
          <div className="text-center py-28 bg-[#131b2e] border border-purple-500/20 rounded-3xl shadow-2xl relative overflow-hidden">
            <div className="w-20 h-20 bg-purple-500/10 border border-purple-500/30 rounded-3xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-purple-500/10">
              <svg className="w-10 h-10 text-purple-400" fill="currentColor" viewBox="0 0 24 24">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white mb-2">No documents created yet</h3>
            <p className="text-slate-400 text-sm mb-6 max-w-sm mx-auto">Create a new document to start real-time editing & collaboration.</p>
            <button
              onClick={() => setShowModal(true)}
              className="bg-purple-600 hover:bg-purple-500 text-white px-6 py-3 rounded-xl font-bold transition text-sm shadow-lg shadow-purple-600/30"
            >
              Create Document
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {docs.map(document => (
              <Link
                key={document.id}
                to={`/doc/${document.id}`}
                className="bg-[#131b2e] border border-purple-500/20 rounded-2xl p-5 hover:border-purple-500/60 hover:shadow-[0_0_25px_rgba(168,85,247,0.25)] transition-all duration-300 group block relative overflow-hidden"
              >
                <div className="w-12 h-14 bg-purple-500/10 border border-purple-500/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-purple-600 group-hover:border-purple-500 transition-colors">
                  <svg className="w-6 h-6 text-purple-400 group-hover:text-white transition-colors" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z"/>
                  </svg>
                </div>
                <h3 className="font-bold text-white truncate mb-1.5 group-hover:text-cyan-300 transition-colors text-base">
                  {document.name || 'Untitled Document'}
                </h3>
                <p className="text-xs font-semibold text-slate-400">{formatDate(document.updatedAt || document.createdAt)}</p>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Cyberpunk Modal */}
      {showModal && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4"
          onClick={e => { if (e.target === e.currentTarget) { setShowModal(false); setDocName(''); } }}
        >
          <div className="bg-[#131b2e] rounded-3xl shadow-2xl w-full max-w-md p-7 border border-purple-500/30 neon-glow-purple">
            <h3 className="text-2xl font-extrabold text-white mb-1">Create Document</h3>
            <p className="text-slate-400 text-sm mb-6">Enter a project title to get started</p>
            <input
              type="text"
              value={docName}
              onChange={e => setDocName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createNewDoc()}
              placeholder="e.g. Cyberpunk Specs"
              autoFocus
              maxLength={100}
              className="w-full px-4 py-3.5 border border-purple-500/30 rounded-xl bg-[#1e293b] text-white focus:outline-none focus:border-purple-400 text-sm mb-6"
            />
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowModal(false); setDocName(''); }}
                className="flex-1 py-3 border border-slate-700 rounded-xl text-slate-300 hover:bg-slate-800 transition font-bold text-sm"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={createNewDoc}
                disabled={creating || !docName.trim()}
                className="flex-1 py-3 bg-purple-600 hover:bg-purple-500 text-white rounded-xl transition font-bold text-sm disabled:opacity-50 shadow-lg shadow-purple-600/30"
              >
                {creating ? 'Creating...' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default DocList;