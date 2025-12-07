import React, { useState, useReducer, useMemo, useEffect, useCallback, useRef } from 'react';
import {
  Folder, ChevronRight, ChevronDown, Plus, Trash2, Calendar, Mail, Layout,
  Check, Sparkles, X, Inbox, Download, RefreshCw, Settings, Edit2,
  Menu, CheckSquare, Square, Wand2, Star, Mic, MicOff, AlertCircle,
  GraduationCap, Chrome, Clock, ArrowUp, FileText, Volume2
} from 'lucide-react';
import './index.css';

// --- Configuration & Constants ---
const INITIAL_FOLDERS = [
  { id: 'root', name: 'Inbox', parentId: null, color: 'bg-slate-500', collapsed: false },
  { id: 'school', name: 'School', parentId: 'root', color: 'bg-blue-500', collapsed: false },
  { id: 'work', name: 'Work', parentId: 'root', color: 'bg-green-500', collapsed: false },
  { id: 'personal', name: 'Personal', parentId: 'root', color: 'bg-purple-500', collapsed: false },
];

const INITIAL_TASKS = [];

const COLORS = [
  'bg-slate-500', 'bg-red-500', 'bg-orange-500', 'bg-amber-500',
  'bg-green-500', 'bg-emerald-500', 'bg-teal-500', 'bg-cyan-500',
  'bg-blue-500', 'bg-indigo-500', 'bg-violet-500', 'bg-purple-500',
  'bg-fuchsia-500', 'bg-pink-500', 'bg-rose-500'
];

// --- Load from localStorage ---
const loadState = () => {
  try {
    const saved = localStorage.getItem('todo-app-state');
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        folders: parsed.folders || INITIAL_FOLDERS,
        tasks: parsed.tasks || INITIAL_TASKS,
        config: parsed.config || { openaiKey: '', canvasUrl: '', canvasToken: '', googleToken: '' }
      };
    }
  } catch (e) {
    console.error('Failed to load state:', e);
  }
  return {
    folders: INITIAL_FOLDERS,
    tasks: INITIAL_TASKS,
    config: { openaiKey: '', canvasUrl: '', canvasToken: '', googleToken: '' }
  };
};

// --- AI Service with OpenAI API ---
const AIService = {
  async generatePlan(apiKey, text, currentFolders) {
    if (!text) return null;

    const today = new Date().toISOString().split('T')[0];
    const folderContext = currentFolders.map(f => `"${f.name}" (id: ${f.id})`).join(', ');

    const prompt = `You are an expert productivity assistant. Parse the user's brain dump into organized tasks.

EXISTING FOLDERS: [${folderContext}]

TODAY'S DATE: ${today}

STRICT RULES:
1. Extract ALL actionable items from the text
2. Assign each task to an existing folder OR suggest a NEW folder if needed
3. For new folders, use hierarchical naming like "School > Class Name > Project"
4. ALWAYS assign a specific due date (YYYY-MM-DD format). If unclear, use reasonable defaults:
   - "tomorrow" = next day
   - "next week" = 7 days from today
   - "soon" or unclear = 3 days from today
   - Specific days like "Friday" = next occurrence of that day
5. Mark tasks as important if they contain words like "urgent", "important", "ASAP", "critical", "deadline"
6. Keep task titles concise but actionable (start with a verb)

OUTPUT JSON FORMAT (no markdown, just valid JSON):
{
  "newFolders": [
    { "name": "Folder Name", "parentName": "Parent Folder Name or root", "reason": "Why this folder is needed" }
  ],
  "suggestedTasks": [
    {
      "title": "Task title starting with action verb",
      "folderName": "Existing or new folder name",
      "date": "YYYY-MM-DD",
      "important": true,
      "description": "Additional context or notes"
    }
  ]
}

USER'S BRAIN DUMP:
"${text}"`;

    if (!apiKey) {
      // Demo mode - return mock data
      return new Promise(resolve => setTimeout(() => {
        resolve({
          newFolders: [],
          suggestedTasks: [
            {
              title: 'Demo: Add your OpenAI API key in settings',
              folderName: 'Inbox',
              date: today,
              important: true,
              description: 'Go to Settings and add your OpenAI API key to enable AI features'
            }
          ]
        });
      }, 500));
    }

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' }
        })
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error?.message || 'API request failed');
      }

      const data = await res.json();
      const textRes = data.choices[0].message.content;

      // Parse JSON from response
      const parsed = JSON.parse(textRes);
      return parsed;

    } catch (e) {
      console.error("AI Error:", e);
      throw e;
    }
  },

  async processGmailSnippets(apiKey, snippets) {
    if (!apiKey || !snippets.length) return [];

    const today = new Date().toISOString().split('T')[0];

    const prompt = `You are an email assistant. Extract actionable tasks from these email snippets.

BE CONSERVATIVE - only extract clear action items, not every email.

RULES:
1. Ignore spam, promotions, newsletters without action items
2. Look for: meeting requests, deadlines, requests for response, action items
3. Always include a due date (YYYY-MM-DD). If email mentions a date, use it. Otherwise use 3 days from today.
4. Mark as important if urgent language is used

TODAY: ${today}

EMAILS:
${JSON.stringify(snippets, null, 2)}

OUTPUT JSON (object with tasks array):
{
  "tasks": [
    { "title": "Action verb + task", "description": "Context from email", "date": "YYYY-MM-DD", "important": false }
  ]
}

Return {"tasks": []} if no actionable items found.`;

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' }
        })
      });

      const data = await res.json();
      const textRes = data.choices[0].message.content;
      const parsed = JSON.parse(textRes);
      return parsed.tasks || [];
    } catch (e) {
      console.error("Gmail AI Error:", e);
      return [];
    }
  },

  async processGranolaNotes(apiKey, notes) {
    if (!apiKey || !notes) return null;

    const today = new Date().toISOString().split('T')[0];

    const prompt = `You are a meeting notes assistant. Extract action items from these meeting notes/transcript.

RULES:
1. Find all action items, follow-ups, and commitments mentioned
2. Identify WHO is responsible if mentioned
3. Extract any deadlines or due dates mentioned
4. Group related tasks if they belong to the same project
5. Always assign a date (YYYY-MM-DD). Use mentioned dates or default to 3 days from today.

TODAY: ${today}

MEETING NOTES:
"${notes}"

OUTPUT JSON:
{
  "meetingTitle": "Brief description of what this meeting was about",
  "newFolders": [
    { "name": "Project or Category Name", "parentName": "root", "reason": "Why needed" }
  ],
  "suggestedTasks": [
    {
      "title": "Action item",
      "folderName": "Folder name",
      "date": "YYYY-MM-DD",
      "important": false,
      "description": "Context from meeting"
    }
  ]
}`;

    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [{ role: 'user', content: prompt }],
          response_format: { type: 'json_object' }
        })
      });

      const data = await res.json();
      const textRes = data.choices[0].message.content;
      return JSON.parse(textRes);
    } catch (e) {
      console.error("Granola AI Error:", e);
      throw e;
    }
  }
};

// --- Voice Input Hook ---
const useVoiceInput = () => {
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      setIsSupported(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
          } else {
            interimTranscript += transcript;
          }
        }

        setTranscript(prev => prev + finalTranscript);
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const startListening = useCallback(() => {
    if (recognitionRef.current && !isListening) {
      setTranscript('');
      recognitionRef.current.start();
      setIsListening(true);
    }
  }, [isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current && isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    }
  }, [isListening]);

  const resetTranscript = useCallback(() => {
    setTranscript('');
  }, []);

  return { isListening, transcript, isSupported, startListening, stopListening, resetTranscript, setTranscript };
};

// --- Reducer ---
const reducer = (state, action) => {
  switch (action.type) {
    case 'SET_FOLDERS': return { ...state, folders: action.payload };
    case 'SET_TASKS': return { ...state, tasks: action.payload };
    case 'SELECT_FOLDER': return { ...state, selectedId: action.payload };
    case 'TOGGLE_SIDEBAR': return { ...state, sidebarOpen: !state.sidebarOpen };
    case 'UPDATE_CONFIG': return { ...state, config: { ...state.config, ...action.payload } };
    case 'SET_MODAL': return { ...state, modal: action.payload };

    case 'ADD_FOLDER':
      return { ...state, folders: [...state.folders, { id: Math.random().toString(36).substr(2, 9), collapsed: false, ...action.payload }] };
    case 'UPDATE_FOLDER':
      return { ...state, folders: state.folders.map(f => f.id === action.id ? { ...f, ...action.patch } : f) };
    case 'DELETE_FOLDER': {
      const getDescendants = (id) => {
        const children = state.folders.filter(f => f.parentId === id);
        return [id, ...children.flatMap(c => getDescendants(c.id))];
      };
      const idsToDelete = new Set(getDescendants(action.id));
      return {
        ...state,
        folders: state.folders.filter(f => !idsToDelete.has(f.id)),
        tasks: state.tasks.filter(t => !idsToDelete.has(t.folderId)),
        selectedId: idsToDelete.has(state.selectedId) ? 'root' : state.selectedId
      };
    }

    case 'ADD_TASK':
      return { ...state, tasks: [...state.tasks, { id: Math.random().toString(36).substr(2, 9), ...action.payload }] };
    case 'UPDATE_TASK':
      return { ...state, tasks: state.tasks.map(t => t.id === action.id ? { ...t, ...action.patch } : t) };
    case 'DELETE_TASK':
      return { ...state, tasks: state.tasks.filter(t => t.id !== action.id) };

    case 'BULK_ADD':
      return {
        ...state,
        folders: [...state.folders, ...action.folders],
        tasks: [...state.tasks, ...action.tasks]
      };

    default: return state;
  }
};

// --- Helper Components ---
const DateBadge = ({ date, showOverdue = true }) => {
  if (!date) return (
    <span className="text-red-500 text-[10px] flex items-center gap-1 font-medium">
      <AlertCircle size={10}/> No Date!
    </span>
  );

  const today = new Date(); today.setHours(0,0,0,0);
  const d = new Date(date + 'T00:00:00');
  const diff = Math.ceil((d - today) / (1000 * 60 * 60 * 24));

  let color = 'text-green-600 bg-green-50 border-green-200';
  let label = date;

  if (diff < 0 && showOverdue) {
    color = 'text-red-600 bg-red-50 border-red-200 font-bold';
    label = `Overdue (${Math.abs(diff)}d)`;
  } else if (diff === 0) {
    color = 'text-orange-600 bg-orange-50 border-orange-200 font-semibold';
    label = 'Today';
  } else if (diff === 1) {
    color = 'text-orange-500 bg-orange-50 border-orange-200';
    label = 'Tomorrow';
  } else if (diff <= 7) {
    color = 'text-amber-600 bg-amber-50 border-amber-200';
  }

  return (
    <span className={`text-[10px] px-1.5 py-0.5 rounded border flex items-center gap-1 ${color}`}>
      <Calendar size={10}/> {label}
    </span>
  );
};

const CustomDatePicker = ({ value, onChange, required }) => {
  const inputRef = useRef(null);
  return (
    <div className="relative group flex items-center">
      <div onClick={() => inputRef.current?.showPicker()} className="cursor-pointer">
        <DateBadge date={value} />
      </div>
      <input
        ref={inputRef}
        type="date"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        required={required}
        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full -z-10"
      />
    </div>
  );
};

// Folder Tree Component
const FolderTreeItem = React.memo(({ folder, folders, selectedId, dispatch, onEdit, level = 0 }) => {
  const children = folders.filter(f => f.parentId === folder.id);
  const hasChildren = children.length > 0;

  return (
    <div style={{ paddingLeft: level > 0 ? '12px' : '0' }}>
      <div
        onClick={() => dispatch({ type: 'SELECT_FOLDER', payload: folder.id })}
        className={`flex items-center gap-2 p-1.5 rounded cursor-pointer text-sm mb-0.5 group
          ${selectedId === folder.id ? 'bg-blue-100 text-blue-900 font-medium' : 'text-slate-600 hover:bg-slate-100'}
        `}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (hasChildren) {
              dispatch({ type: 'UPDATE_FOLDER', id: folder.id, patch: { collapsed: !folder.collapsed } });
            }
          }}
          className={`p-0.5 rounded ${hasChildren ? 'hover:bg-black/5' : 'opacity-0'}`}
        >
          {folder.collapsed ? <ChevronRight size={12}/> : <ChevronDown size={12}/>}
        </button>
        <div className={`w-2 h-2 rounded-full ${folder.color}`} />
        <span className="truncate flex-1">{folder.name}</span>

        <div className="opacity-0 group-hover:opacity-100 flex items-center gap-1">
          <button
            onClick={(e) => { e.stopPropagation(); onEdit(folder); }}
            className="p-1 hover:text-blue-500 rounded"
          >
            <Edit2 size={12}/>
          </button>
        </div>
      </div>
      {!folder.collapsed && children.map(child => (
        <FolderTreeItem
          key={child.id}
          folder={child}
          folders={folders}
          selectedId={selectedId}
          dispatch={dispatch}
          onEdit={onEdit}
          level={level + 1}
        />
      ))}
    </div>
  );
});

// --- Main Component ---
export default function PowerTodoApp() {
  const savedState = useMemo(() => loadState(), []);

  const [state, dispatch] = useReducer(reducer, {
    folders: savedState.folders,
    tasks: savedState.tasks,
    selectedId: 'root',
    sidebarOpen: true,
    config: savedState.config,
    modal: null,
  });

  const [search, setSearch] = useState('');
  const [editingFolder, setEditingFolder] = useState(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskDate, setNewTaskDate] = useState('');
  const [showMorningView, setShowMorningView] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const voice = useVoiceInput();

  // Save to localStorage whenever state changes
  useEffect(() => {
    localStorage.setItem('todo-app-state', JSON.stringify({
      folders: state.folders,
      tasks: state.tasks,
      config: state.config
    }));
  }, [state.folders, state.tasks, state.config]);

  // Check for overdue tasks on mount (Morning View)
  useEffect(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const overdueTasks = state.tasks.filter(t => {
      if (t.completed || !t.date) return false;
      const taskDate = new Date(t.date + 'T00:00:00');
      return taskDate < today;
    });

    if (overdueTasks.length > 0) {
      setShowMorningView(true);
    }
  }, []);

  // --- Derived Data ---
  const activeFolder = useMemo(() =>
    state.folders.find(f => f.id === state.selectedId) || state.folders[0],
    [state.folders, state.selectedId]
  );

  // Sort tasks: Important first, then Overdue, then by date (soonest first)
  const sortedAndFilteredTasks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let tasks = state.tasks.filter(t => !t.completed);

    // Filter by folder
    if (state.selectedId !== 'root') {
      const getDescendants = (id) => {
        const children = state.folders.filter(f => f.parentId === id);
        return [id, ...children.flatMap(c => getDescendants(c.id))];
      };
      const ids = new Set(getDescendants(state.selectedId));
      tasks = tasks.filter(task => ids.has(task.folderId));
    }

    // Filter by search
    if (search) {
      tasks = tasks.filter(task =>
        task.title.toLowerCase().includes(search.toLowerCase())
      );
    }

    // Sort: Important → Overdue → Soonest date
    return tasks.sort((a, b) => {
      // Important tasks first
      if (a.important && !b.important) return -1;
      if (!a.important && b.important) return 1;

      // Then by date
      const dateA = a.date ? new Date(a.date + 'T00:00:00') : new Date('9999-12-31');
      const dateB = b.date ? new Date(b.date + 'T00:00:00') : new Date('9999-12-31');

      const isOverdueA = dateA < today;
      const isOverdueB = dateB < today;

      // Overdue tasks before non-overdue
      if (isOverdueA && !isOverdueB) return -1;
      if (!isOverdueA && isOverdueB) return 1;

      // Then sort by date
      return dateA - dateB;
    });
  }, [state.tasks, state.folders, state.selectedId, search]);

  const completedTasks = useMemo(() =>
    state.tasks.filter(t => t.completed),
    [state.tasks]
  );

  const overdueTasks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return state.tasks.filter(t => {
      if (t.completed || !t.date) return false;
      const taskDate = new Date(t.date + 'T00:00:00');
      return taskDate < today;
    });
  }, [state.tasks]);

  // --- Actions ---
  const handleAddTask = useCallback(() => {
    if (!newTaskTitle.trim()) return;
    if (!newTaskDate) {
      alert('Please select a due date. All tasks require a due date.');
      return;
    }

    dispatch({
      type: 'ADD_TASK',
      payload: {
        title: newTaskTitle.trim(),
        folderId: state.selectedId === 'root' ? 'root' : state.selectedId,
        date: newTaskDate,
        completed: false,
        important: false,
        description: ''
      }
    });
    setNewTaskTitle('');
    setNewTaskDate('');
  }, [newTaskTitle, newTaskDate, state.selectedId]);

  const handleCanvasSync = async () => {
    const { canvasUrl, canvasToken } = state.config;
    if (!canvasUrl || !canvasToken) {
      dispatch({ type: 'SET_MODAL', payload: { type: 'settings' } });
      return;
    }

    setAiLoading(true);
    const cleanUrl = canvasUrl.replace(/\/$/, '');
    const startDate = new Date().toISOString();
    const endDate = new Date(Date.now() + 30 * 86400000).toISOString();
    const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(`${cleanUrl}/api/v1/planner/items?start_date=${startDate}&end_date=${endDate}`)}`;

    try {
      const res = await fetch(proxyUrl, {
        headers: { 'Authorization': `Bearer ${canvasToken}` }
      });

      if (!res.ok) throw new Error(res.statusText);

      const data = await res.json();
      const newTasks = [];

      // Find or create School folder
      let schoolFolder = state.folders.find(f => f.name === 'School');

      data.forEach(item => {
        const taskTitle = item.plannable?.title || item.title;
        if (!state.tasks.some(t => t.title === taskTitle)) {
          newTasks.push({
            id: `canvas-${item.plannable_id || Math.random()}`,
            title: taskTitle,
            folderId: schoolFolder?.id || 'root',
            date: item.plannable_date ? item.plannable_date.split('T')[0] : new Date().toISOString().split('T')[0],
            description: `Canvas: ${item.context_name || 'Assignment'}`,
            completed: false,
            important: false,
            isCanvas: true
          });
        }
      });

      dispatch({ type: 'BULK_ADD', folders: [], tasks: newTasks });
      alert(`Synced ${newTasks.length} items from Canvas.`);

    } catch (e) {
      console.error('Canvas sync error:', e);
      if (confirm("Canvas Sync Failed (likely CORS). Load simulated data?")) {
        const simTasks = [
          { id: 'sim-1', title: 'Canvas: Read Chapter 4', folderId: 'school', date: new Date().toISOString().split('T')[0], completed: false, important: false },
          { id: 'sim-2', title: 'Canvas: Project Proposal Due', folderId: 'school', date: new Date(Date.now() + 86400000 * 3).toISOString().split('T')[0], completed: false, important: true }
        ];
        dispatch({ type: 'BULK_ADD', folders: [], tasks: simTasks });
      }
    } finally {
      setAiLoading(false);
    }
  };

  const handleGmailSync = async () => {
    const { googleToken, openaiKey } = state.config;

    if (!googleToken) {
      dispatch({ type: 'SET_MODAL', payload: { type: 'settings' } });
      return;
    }

    setAiLoading(true);
    try {
      const listRes = await fetch(
        'https://www.googleapis.com/gmail/v1/users/me/messages?q=is:unread -category:promotions -category:social&maxResults=10',
        { headers: { 'Authorization': `Bearer ${googleToken}` } }
      );

      if (!listRes.ok) throw new Error("Gmail Auth Failed");
      const listData = await listRes.json();

      if (!listData.messages) {
        alert("No unread emails found.");
        return;
      }

      const snippets = [];
      for (const msg of listData.messages) {
        const detailRes = await fetch(
          `https://www.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=minimal`,
          { headers: { 'Authorization': `Bearer ${googleToken}` } }
        );
        const detailData = await detailRes.json();
        snippets.push({
          snippet: detailData.snippet,
          date: new Date(parseInt(detailData.internalDate)).toISOString().split('T')[0]
        });
      }

      let extractedTasks = [];
      if (openaiKey) {
        extractedTasks = await AIService.processGmailSnippets(openaiKey, snippets);
      } else {
        extractedTasks = snippets.slice(0, 3).map((s, i) => ({
          title: `Reply to: ${s.snippet.substring(0, 40)}...`,
          date: s.date,
          description: "Extracted from Gmail",
          important: false
        }));
      }

      let gmailFolder = state.folders.find(f => f.name === 'Gmail');
      const newFolders = [];
      if (!gmailFolder) {
        gmailFolder = { id: 'gmail-folder', name: 'Gmail', parentId: 'root', color: 'bg-red-400', collapsed: false };
        newFolders.push(gmailFolder);
      }

      const newTasks = extractedTasks.map((t, i) => ({
        id: `gmail-${Date.now()}-${i}`,
        title: t.title,
        folderId: gmailFolder.id,
        date: t.date || new Date().toISOString().split('T')[0],
        description: t.description || '',
        completed: false,
        important: t.important || false,
        isGmail: true
      }));

      dispatch({ type: 'BULK_ADD', folders: newFolders, tasks: newTasks });
      alert(`Synced ${newTasks.length} tasks from Gmail.`);

    } catch (e) {
      console.error('Gmail sync error:', e);
      alert("Gmail Sync Failed. Check your Access Token.");
    } finally {
      setAiLoading(false);
    }
  };

  const processAI = async (input, type = 'braindump') => {
    if (!input.trim()) return;

    setAiLoading(true);
    setAiError('');

    try {
      let result;
      if (type === 'granola') {
        result = await AIService.processGranolaNotes(state.config.openaiKey, input);
      } else {
        result = await AIService.generatePlan(state.config.openaiKey, input, state.folders);
      }

      const processed = {
        type,
        meetingTitle: result.meetingTitle,
        newFolders: result.newFolders?.map(f => ({ ...f, approved: true })) || [],
        suggestedTasks: result.suggestedTasks?.map(t => ({ ...t, approved: true })) || []
      };

      dispatch({ type: 'SET_MODAL', payload: { type: 'review', data: processed } });
    } catch (e) {
      setAiError(e.message || 'AI Processing Failed');
    } finally {
      setAiLoading(false);
    }
  };

  const commitReviewedTasks = () => {
    const { newFolders, suggestedTasks } = state.modal.data;
    const folderMap = {};

    // Create approved folders
    const foldersToAdd = newFolders
      .filter(f => f.approved)
      .map(f => {
        const id = Math.random().toString(36).substr(2, 9);
        folderMap[f.name] = id;

        // Find parent folder
        let parentId = 'root';
        if (f.parentName && f.parentName !== 'root') {
          const parent = state.folders.find(fol =>
            fol.name.toLowerCase() === f.parentName.toLowerCase()
          );
          if (parent) parentId = parent.id;
        }

        return {
          id,
          name: f.name,
          parentId,
          color: COLORS[Math.floor(Math.random() * COLORS.length)],
          collapsed: false
        };
      });

    // Create approved tasks
    const tasksToAdd = suggestedTasks
      .filter(t => t.approved)
      .map(t => {
        // Find folder ID
        const existing = state.folders.find(fol =>
          fol.name.toLowerCase() === (t.folderName || '').toLowerCase()
        );
        const targetId = existing?.id || folderMap[t.folderName] || 'root';

        return {
          id: Math.random().toString(36).substr(2, 9),
          title: t.title,
          folderId: targetId,
          date: t.date || new Date().toISOString().split('T')[0],
          description: t.description || '',
          completed: false,
          important: t.important || false
        };
      });

    dispatch({ type: 'BULK_ADD', folders: foldersToAdd, tasks: tasksToAdd });
    dispatch({ type: 'SET_MODAL', payload: null });
    voice.resetTranscript();
  };

  return (
    <div className="flex h-screen w-full bg-white text-slate-800 font-sans">

      {/* SIDEBAR */}
      <div className={`bg-slate-50 border-r border-slate-200 flex flex-col transition-all duration-300 ${state.sidebarOpen ? 'w-64' : 'w-0 overflow-hidden'}`}>
        <div className="p-4 border-b border-slate-200 flex items-center justify-between">
          <span className="font-bold text-slate-700 flex items-center gap-2">
            <Layout size={18} className="text-blue-600"/> TODO Master
          </span>
          <button
            onClick={() => dispatch({ type: 'SET_MODAL', payload: { type: 'settings' } })}
            className="text-slate-400 hover:text-slate-600"
          >
            <Settings size={16}/>
          </button>
        </div>

        <div className="p-2 overflow-y-auto flex-1">
          {/* Inbox */}
          <div
            onClick={() => dispatch({ type: 'SELECT_FOLDER', payload: 'root' })}
            className={`flex items-center gap-2 p-2 rounded cursor-pointer text-sm font-medium mb-2
              ${state.selectedId === 'root' ? 'bg-blue-100 text-blue-900' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            <Inbox size={16}/> All Tasks
            {overdueTasks.length > 0 && (
              <span className="ml-auto bg-red-500 text-white text-[10px] px-1.5 py-0.5 rounded-full">
                {overdueTasks.length}
              </span>
            )}
          </div>

          {/* Folder Tree */}
          {state.folders.filter(f => f.parentId === 'root').map(f => (
            <FolderTreeItem
              key={f.id}
              folder={f}
              folders={state.folders}
              selectedId={state.selectedId}
              dispatch={dispatch}
              onEdit={(folder) => {
                setEditingFolder(folder);
                dispatch({ type: 'SET_MODAL', payload: { type: 'folder_settings' } });
              }}
            />
          ))}

          <button
            onClick={() => dispatch({ type: 'ADD_FOLDER', payload: { name: 'New Folder', parentId: 'root', color: 'bg-slate-400' } })}
            className="flex items-center gap-2 text-xs text-slate-400 hover:text-blue-600 p-2 mt-2"
          >
            <Plus size={14}/> Add Folder
          </button>
        </div>

        {/* Sync Buttons */}
        <div className="p-2 border-t border-slate-200 grid grid-cols-3 gap-1">
          <button
            onClick={handleCanvasSync}
            disabled={aiLoading}
            className="flex flex-col items-center p-2 hover:bg-white rounded text-[10px] text-slate-500 gap-1 disabled:opacity-50"
          >
            <GraduationCap size={14}/> Canvas
          </button>
          <button
            onClick={handleGmailSync}
            disabled={aiLoading}
            className="flex flex-col items-center p-2 hover:bg-white rounded text-[10px] text-slate-500 gap-1 disabled:opacity-50"
          >
            <Mail size={14}/> Gmail
          </button>
          <button
            onClick={() => dispatch({ type: 'SET_MODAL', payload: { type: 'granola' } })}
            className="flex flex-col items-center p-2 hover:bg-white rounded text-[10px] text-slate-500 gap-1"
          >
            <FileText size={14}/> Granola
          </button>
        </div>
      </div>

      {/* MAIN AREA */}
      <div className="flex-1 flex flex-col min-w-0 bg-white relative">
        {/* Header */}
        <header className="h-14 border-b border-slate-100 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
            {!state.sidebarOpen && (
              <button onClick={() => dispatch({ type: 'TOGGLE_SIDEBAR' })}>
                <Menu size={18} className="text-slate-400"/>
              </button>
            )}
            <h1 className="text-lg font-bold text-slate-800 flex items-center gap-2">
              {activeFolder?.name || 'All Tasks'}
              {activeFolder?.id !== 'root' && activeFolder?.color && (
                <span className={`w-2.5 h-2.5 rounded-full ${activeFolder.color}`}/>
              )}
            </h1>
          </div>
          <div className="flex items-center gap-2">
            <input
              className="bg-slate-50 border border-slate-200 rounded-full px-4 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 w-48"
              placeholder="Search tasks..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
            <button
              onClick={() => dispatch({ type: 'SET_MODAL', payload: { type: 'voice' } })}
              className="bg-gradient-to-r from-indigo-600 to-violet-600 text-white px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-2 shadow-sm hover:shadow-md transition-all"
            >
              <Mic size={14}/> Brain Dump
            </button>
          </div>
        </header>

        {/* Morning View Alert */}
        {showMorningView && overdueTasks.length > 0 && (
          <div className="bg-red-50 border-b border-red-200 p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="text-red-500" size={20}/>
                <div>
                  <h3 className="font-semibold text-red-800">Good morning! You have {overdueTasks.length} overdue task(s)</h3>
                  <p className="text-sm text-red-600">Please reschedule them to continue</p>
                </div>
              </div>
              <button
                onClick={() => setShowMorningView(false)}
                className="text-red-400 hover:text-red-600"
              >
                <X size={18}/>
              </button>
            </div>
          </div>
        )}

        {/* Task List */}
        <div className="flex-1 overflow-y-auto p-6 space-y-1">
          {sortedAndFilteredTasks.length === 0 && (
            <div className="text-center py-12 text-slate-400">
              <CheckSquare size={48} className="mx-auto mb-4 opacity-50"/>
              <p>No tasks yet. Use Brain Dump to add some!</p>
            </div>
          )}

          {sortedAndFilteredTasks.map(task => (
            <div
              key={task.id}
              className={`group flex items-center gap-3 py-2 px-3 hover:bg-slate-50 rounded-lg border transition-all
                ${task.important ? 'border-amber-200 bg-amber-50/50' : 'border-transparent hover:border-slate-100'}
              `}
            >
              <button onClick={() => dispatch({ type: 'UPDATE_TASK', id: task.id, patch: { completed: !task.completed } })}>
                {task.completed ? (
                  <CheckSquare size={18} className="text-green-500"/>
                ) : (
                  <Square size={18} className="text-slate-300 hover:text-blue-500"/>
                )}
              </button>

              <div className="flex-1 min-w-0 flex items-center gap-3">
                {task.important && (
                  <Star size={14} className="text-amber-500 fill-amber-500 shrink-0"/>
                )}
                <span className={`text-sm truncate flex-1 ${task.completed ? 'text-slate-400 line-through' : 'text-slate-700'}`}>
                  {task.title}
                </span>

                <div className="flex items-center gap-2 shrink-0">
                  {/* Folder Badge */}
                  {state.selectedId === 'root' && task.folderId !== 'root' && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full text-white ${state.folders.find(f => f.id === task.folderId)?.color || 'bg-gray-400'}`}>
                      {state.folders.find(f => f.id === task.folderId)?.name}
                    </span>
                  )}

                  {/* Date */}
                  <CustomDatePicker
                    value={task.date}
                    onChange={d => dispatch({ type: 'UPDATE_TASK', id: task.id, patch: { date: d } })}
                    required
                  />

                  {/* Important Toggle */}
                  <button
                    onClick={() => dispatch({ type: 'UPDATE_TASK', id: task.id, patch: { important: !task.important } })}
                    className={`p-1 rounded ${task.important ? 'text-amber-500' : 'text-slate-300 hover:text-amber-400'}`}
                  >
                    <Star size={14} className={task.important ? 'fill-amber-500' : ''}/>
                  </button>

                  {/* Delete */}
                  <button
                    onClick={() => dispatch({ type: 'DELETE_TASK', id: task.id })}
                    className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={14}/>
                  </button>
                </div>
              </div>
            </div>
          ))}

          {/* Completed Tasks */}
          {completedTasks.length > 0 && (
            <div className="mt-8 pt-4 border-t border-slate-100">
              <h3 className="text-xs font-semibold text-slate-400 uppercase mb-2">
                Completed ({completedTasks.length})
              </h3>
              {completedTasks.slice(0, 5).map(task => (
                <div
                  key={task.id}
                  className="group flex items-center gap-3 py-1.5 px-3 text-slate-400"
                >
                  <button onClick={() => dispatch({ type: 'UPDATE_TASK', id: task.id, patch: { completed: false } })}>
                    <CheckSquare size={16} className="text-green-400"/>
                  </button>
                  <span className="text-sm line-through flex-1">{task.title}</span>
                  <button
                    onClick={() => dispatch({ type: 'DELETE_TASK', id: task.id })}
                    className="text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 size={12}/>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Add Bar */}
        <div className="border-t border-slate-100 p-4 bg-white">
          <div className="flex items-center gap-3">
            <Plus size={18} className="text-slate-400"/>
            <input
              className="flex-1 bg-transparent outline-none text-sm placeholder:text-slate-400"
              placeholder="Add a task... (press Enter)"
              value={newTaskTitle}
              onChange={e => setNewTaskTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleAddTask()}
            />
            <input
              type="date"
              value={newTaskDate}
              onChange={e => setNewTaskDate(e.target.value)}
              className="text-sm border border-slate-200 rounded px-2 py-1"
              required
            />
            <button
              onClick={handleAddTask}
              disabled={!newTaskTitle.trim() || !newTaskDate}
              className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>
        </div>
      </div>

      {/* MODALS */}
      {state.modal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl max-h-[85vh] flex flex-col">
            <div className="p-4 border-b border-slate-100 flex justify-between items-center">
              <h3 className="font-bold text-slate-800 capitalize">
                {state.modal.type === 'voice' ? 'Brain Dump - Voice Input' :
                 state.modal.type === 'granola' ? 'Granola Notes Import' :
                 state.modal.type === 'review' ? 'Review AI Suggestions' :
                 state.modal.type.replace('_', ' ')}
              </h3>
              <button onClick={() => {
                dispatch({ type: 'SET_MODAL', payload: null });
                setEditingFolder(null);
                voice.stopListening();
                voice.resetTranscript();
                setAiError('');
              }}>
                <X size={20} className="text-slate-400"/>
              </button>
            </div>

            <div className="p-6 overflow-y-auto flex-1">

              {/* SETTINGS MODAL */}
              {state.modal.type === 'settings' && (
                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">OpenAI API Key</label>
                    <input
                      type="password"
                      value={state.config.openaiKey}
                      onChange={e => dispatch({ type: 'UPDATE_CONFIG', payload: { openaiKey: e.target.value } })}
                      className="w-full border p-2 rounded mt-1 text-sm"
                      placeholder="sk-proj-..."
                    />
                    <p className="text-xs text-slate-400 mt-1">Required for AI features. Get one at platform.openai.com</p>
                  </div>

                  <div className="bg-blue-50 p-3 rounded border border-blue-100">
                    <h4 className="text-xs font-bold text-blue-700 uppercase mb-2 flex items-center gap-1">
                      <GraduationCap size={12}/> Canvas LMS Settings
                    </h4>
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs font-medium text-slate-600">Canvas Instance URL</label>
                        <input
                          type="text"
                          value={state.config.canvasUrl}
                          onChange={e => dispatch({ type: 'UPDATE_CONFIG', payload: { canvasUrl: e.target.value } })}
                          className="w-full border p-2 rounded mt-1 text-sm"
                          placeholder="https://canvas.instructure.com"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-600">Access Token</label>
                        <input
                          type="password"
                          value={state.config.canvasToken}
                          onChange={e => dispatch({ type: 'UPDATE_CONFIG', payload: { canvasToken: e.target.value } })}
                          className="w-full border p-2 rounded mt-1 text-sm"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="bg-red-50 p-3 rounded border border-red-100">
                    <h4 className="text-xs font-bold text-red-700 uppercase mb-2 flex items-center gap-1">
                      <Chrome size={12}/> Google Gmail Settings
                    </h4>
                    <div>
                      <label className="block text-xs font-medium text-slate-600">OAuth Access Token</label>
                      <input
                        type="password"
                        value={state.config.googleToken}
                        onChange={e => dispatch({ type: 'UPDATE_CONFIG', payload: { googleToken: e.target.value } })}
                        className="w-full border p-2 rounded mt-1 text-sm"
                        placeholder="From Google OAuth Playground"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* FOLDER SETTINGS MODAL */}
              {state.modal.type === 'folder_settings' && editingFolder && (
                <div className="space-y-6">
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Folder Name</label>
                    <input
                      type="text"
                      className="w-full border rounded p-2 text-sm font-medium"
                      value={editingFolder.name}
                      onChange={e => setEditingFolder({ ...editingFolder, name: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Color</label>
                    <div className="grid grid-cols-8 gap-2">
                      {COLORS.map(c => (
                        <button
                          key={c}
                          onClick={() => setEditingFolder({ ...editingFolder, color: c })}
                          className={`w-6 h-6 rounded-full ${c} transition-transform ${editingFolder.color === c ? 'scale-125 ring-2 ring-offset-2 ring-slate-300' : 'hover:scale-110'}`}
                        />
                      ))}
                    </div>
                  </div>
                  <div className="pt-6 border-t flex justify-between">
                    <button
                      onClick={() => {
                        if (confirm('Delete this folder and all its tasks?')) {
                          dispatch({ type: 'DELETE_FOLDER', id: editingFolder.id });
                          dispatch({ type: 'SET_MODAL', payload: null });
                        }
                      }}
                      className="text-red-500 text-sm flex items-center gap-2 hover:bg-red-50 px-3 py-2 rounded"
                    >
                      <Trash2 size={16}/> Delete
                    </button>
                    <button
                      onClick={() => {
                        dispatch({ type: 'UPDATE_FOLDER', id: editingFolder.id, patch: editingFolder });
                        dispatch({ type: 'SET_MODAL', payload: null });
                      }}
                      className="px-6 py-2 bg-blue-600 text-white text-sm font-medium rounded"
                    >
                      Save
                    </button>
                  </div>
                </div>
              )}

              {/* VOICE INPUT MODAL */}
              {state.modal.type === 'voice' && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-500">
                    Click the microphone and speak your thoughts. I'll organize them into tasks with due dates.
                  </p>

                  {/* Voice Controls */}
                  <div className="flex justify-center py-6">
                    {voice.isSupported ? (
                      <button
                        onClick={voice.isListening ? voice.stopListening : voice.startListening}
                        className={`w-24 h-24 rounded-full flex items-center justify-center transition-all ${
                          voice.isListening
                            ? 'bg-red-500 text-white shadow-lg shadow-red-200'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {voice.isListening ? (
                          <div className="relative">
                            <div className="absolute inset-0 rounded-full bg-red-400 voice-pulse"/>
                            <MicOff size={32}/>
                          </div>
                        ) : (
                          <Mic size={32}/>
                        )}
                      </button>
                    ) : (
                      <div className="text-center text-slate-500">
                        <AlertCircle size={32} className="mx-auto mb-2"/>
                        <p>Voice input not supported in this browser</p>
                      </div>
                    )}
                  </div>

                  {voice.isListening && (
                    <p className="text-center text-sm text-red-500 animate-pulse">Listening...</p>
                  )}

                  {/* Transcript */}
                  <div>
                    <label className="text-xs font-bold text-slate-500 uppercase">Your thoughts (edit if needed)</label>
                    <textarea
                      className="w-full h-40 p-4 border rounded-xl text-sm mt-1 focus:ring-2 focus:ring-blue-100 outline-none"
                      placeholder="Start speaking or type here..."
                      value={voice.transcript}
                      onChange={e => voice.setTranscript(e.target.value)}
                    />
                  </div>

                  {aiError && (
                    <div className="bg-red-50 text-red-600 p-3 rounded text-sm">
                      {aiError}
                    </div>
                  )}

                  <div className="flex justify-end gap-2">
                    <button
                      onClick={() => voice.resetTranscript()}
                      className="px-4 py-2 text-sm text-slate-500 hover:bg-slate-50 rounded"
                    >
                      Clear
                    </button>
                    <button
                      onClick={() => processAI(voice.transcript, 'braindump')}
                      disabled={!voice.transcript.trim() || aiLoading}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
                    >
                      {aiLoading ? <RefreshCw className="animate-spin" size={16}/> : <Wand2 size={16}/>}
                      Process with AI
                    </button>
                  </div>
                </div>
              )}

              {/* GRANOLA NOTES MODAL */}
              {state.modal.type === 'granola' && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-500">
                    Paste your Granola meeting notes or transcript below. I'll extract action items.
                  </p>

                  <textarea
                    className="w-full h-64 p-4 border rounded-xl text-sm focus:ring-2 focus:ring-blue-100 outline-none"
                    placeholder="Paste your meeting notes here..."
                    id="granola-input"
                  />

                  {aiError && (
                    <div className="bg-red-50 text-red-600 p-3 rounded text-sm">
                      {aiError}
                    </div>
                  )}

                  <div className="flex justify-end">
                    <button
                      onClick={() => processAI(document.getElementById('granola-input').value, 'granola')}
                      disabled={aiLoading}
                      className="bg-blue-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-blue-700 flex items-center gap-2 disabled:opacity-50"
                    >
                      {aiLoading ? <RefreshCw className="animate-spin" size={16}/> : <FileText size={16}/>}
                      Extract Tasks
                    </button>
                  </div>
                </div>
              )}

              {/* REVIEW MODAL */}
              {state.modal.type === 'review' && state.modal.data && (
                <div className="space-y-6">
                  {state.modal.data.meetingTitle && (
                    <div className="bg-slate-50 p-3 rounded">
                      <span className="text-xs text-slate-500 uppercase">Meeting:</span>
                      <p className="font-medium">{state.modal.data.meetingTitle}</p>
                    </div>
                  )}

                  {/* New Folders */}
                  {state.modal.data.newFolders?.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">New Folders to Create</h4>
                      <div className="space-y-2">
                        {state.modal.data.newFolders.map((f, i) => (
                          <div key={i} className="flex items-center gap-3 p-2 border rounded bg-slate-50">
                            <input
                              type="checkbox"
                              checked={f.approved}
                              onChange={() => {
                                const updated = [...state.modal.data.newFolders];
                                updated[i] = { ...f, approved: !f.approved };
                                dispatch({
                                  type: 'SET_MODAL',
                                  payload: { ...state.modal, data: { ...state.modal.data, newFolders: updated } }
                                });
                              }}
                              className="rounded"
                            />
                            <Folder size={14} className="text-purple-500"/>
                            <div className="flex-1">
                              <span className="text-sm font-medium">{f.name}</span>
                              {f.parentName && f.parentName !== 'root' && (
                                <span className="text-xs text-slate-400 ml-2">in {f.parentName}</span>
                              )}
                              <p className="text-xs text-slate-400">{f.reason}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tasks */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase mb-2">
                      Tasks to Create ({state.modal.data.suggestedTasks?.length || 0})
                    </h4>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {state.modal.data.suggestedTasks?.map((t, i) => (
                        <div key={i} className="flex items-start gap-3 p-2 border rounded">
                          <input
                            type="checkbox"
                            checked={t.approved}
                            onChange={() => {
                              const updated = [...state.modal.data.suggestedTasks];
                              updated[i] = { ...t, approved: !t.approved };
                              dispatch({
                                type: 'SET_MODAL',
                                payload: { ...state.modal, data: { ...state.modal.data, suggestedTasks: updated } }
                              });
                            }}
                            className="rounded mt-1"
                          />
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              {t.important && <Star size={12} className="text-amber-500 fill-amber-500"/>}
                              <span className="text-sm font-medium">{t.title}</span>
                            </div>
                            <div className="flex items-center gap-2 mt-1 flex-wrap">
                              <span className="text-[10px] px-2 py-0.5 bg-slate-100 rounded text-slate-500">
                                {t.folderName}
                              </span>
                              <span className="text-[10px] px-2 py-0.5 bg-blue-50 rounded text-blue-600">
                                {t.date}
                              </span>
                            </div>
                            {t.description && (
                              <p className="text-xs text-slate-400 mt-1">{t.description}</p>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-4 border-t">
                    <button
                      onClick={() => {
                        dispatch({ type: 'SET_MODAL', payload: null });
                        voice.resetTranscript();
                      }}
                      className="px-4 py-2 text-sm text-slate-500"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={commitReviewedTasks}
                      className="bg-green-600 text-white px-4 py-2 rounded-lg text-sm hover:bg-green-700 flex items-center gap-2"
                    >
                      <Check size={16}/> Create Selected
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
